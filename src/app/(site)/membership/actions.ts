"use server";

import { logDate, logTime } from "@/lib/format";
import { CLUB_ZONE } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { CITIES, type ApplyState, type ApplyValues } from "./apply-shared";

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
    note: String(formData.get("note") ?? "").trim(),
  };
  const conduct = formData.get("conduct") === "on";

  const errors: ApplyState["errors"] = {};
  if (values.full_name.length < 2) errors.full_name = "Your name, as the manifest should read it.";
  if (!EMAIL_RE.test(values.email)) errors.email = "A working address — the invitation travels by mail.";
  if (!(CITIES as readonly string[]).includes(values.city)) errors.city = "Pick the harbor nearest you.";
  if (!conduct) errors.conduct = "The code of conduct comes with the water.";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values };
  }

  const supabase = await createClient();
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

  const now = new Date().toISOString();
  return {
    ok: true,
    errors: {},
    values,
    meta: `Received · ${logDate(now, CLUB_ZONE)} · ${logTime(now, CLUB_ZONE)} · ${values.city}`,
  };
}
