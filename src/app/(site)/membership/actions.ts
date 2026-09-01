"use server";

import { logDate, logTime } from "@/lib/format";
import { CLUB_ZONE } from "@/lib/brand";
import { voice } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { CITIES, INVITE_CODE_RE, type ApplyState, type ApplyValues } from "./apply-shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitApplication(
  _prev: ApplyState,
  formData: FormData
): Promise<ApplyState> {
  const values: ApplyValues = {
    full_name: String(formData.get("full_name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    referral: String(formData.get("referral") ?? "").trim(),
    invite: String(formData.get("invite") ?? "").trim().toUpperCase(),
    note: String(formData.get("note") ?? "").trim(),
  };
  const conduct = formData.get("conduct") === "on";

  const errors: ApplyState["errors"] = {};
  if (values.full_name.length < 2) errors.full_name = "Your name, as the manifest should read it.";
  if (!EMAIL_RE.test(values.email)) errors.email = "A working address — the invitation travels by mail.";
  if (!(CITIES as readonly string[]).includes(values.city)) errors.city = "Pick the harbor nearest you.";
  if (values.invite && !INVITE_CODE_RE.test(values.invite))
    errors.invite = "That code doesn't read — check it against the note it came with.";
  if (!conduct) errors.conduct = "The code of conduct comes with the water.";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values };
  }

  const supabase = await createClient();

  if (values.invite) {
    /* apply_with_invite is the only writer of applications.invite_code, and
       the sponsor's 250-knot payout and /bridge/referrals read nothing else —
       a coded application must never fall through to the plain insert. The RPC
       takes no referral arg: the code itself names the sponsor. */
    const { error } = await supabase.rpc("apply_with_invite", {
      p_full_name: values.full_name,
      p_email: values.email,
      p_city: values.city,
      p_note: values.note,
      p_code: values.invite,
    });

    if (error) {
      /* The pacing trigger fires inside the RPC too; its message belongs to
         the form, same as the plain path below. */
      const paced = error.code === "53400" && error.message ? error.message.replace(/^[^:]*:\s*/, "") : null;
      if (paced) return { ok: false, errors: { form: paced }, values };
      /* Anything else — unknown code, spent code — the RPC refuses in the
         brand's voice; hand its words to the field the applicant can fix. */
      return { ok: false, errors: { invite: voice(error) }, values };
    }
  } else {
    const { error } = await supabase.from("applications").insert({
      full_name: values.full_name,
      email: values.email,
      city: values.city,
      referral: values.referral || null,
      note: values.note || null,
    });

    if (error) {
      /* 53400 is the pacing trigger speaking, and its message says the way out
         ("try again in an hour"). Collapsing it into the generic line handed a
         legitimate re-applicant a dead end — the gangway and status lookups
         already pass their pacing through; the front door now does too. */
      const paced = error.code === "53400" && error.message ? error.message.replace(/^[^:]*:\s*/, "") : null;
      return {
        ok: false,
        errors: { form: paced ?? "That didn't land. Try again; if it holds, hail Shoreside." },
        values,
      };
    }
  }

  const now = new Date().toISOString();
  return {
    ok: true,
    errors: {},
    values,
    meta: `Received · ${logDate(now, CLUB_ZONE)} · ${logTime(now, CLUB_ZONE)} · ${values.city}`,
  };
}
