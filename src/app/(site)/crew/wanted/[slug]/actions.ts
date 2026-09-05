"use server";

import { createClient } from "@/lib/supabase/server";

/* The inlet the pipeline never had.

   /bridge/crew has run five stages and an advance action since it shipped, with
   Apply on the public page pointing at a mailto: — so every candidate in it was
   typed in by hand, against a public-insert policy that already existed and was
   already covered by the e2e suite.

   Written the way the member application is written, deliberately: the same
   validation shape, the same reading of 53400 as pacing and 23505 as a
   duplicate, the same refusal to invent a message the database already made in
   the brand's voice. Two front doors that behave differently are two things to
   maintain and one of them will rot. */

export type CrewApplyValues = {
  full_name: string;
  email: string;
  phone: string;
  links: string;
  source: string;
  note: string;
};

export type CrewApplyState = {
  ok: boolean;
  errors: Partial<Record<keyof CrewApplyValues | "form", string>>;
  values: CrewApplyValues;
  meta?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* The bounds the insert policy holds (name 120, address 254, note 2000) and
   the ones it does not yet — phone, link and source are free text on the
   table, so they are bounded here until the policy says so too. */
const NAME_MAX = 120;
const EMAIL_MAX = 254;
const PHONE_MAX = 40;
const LINK_MAX = 300;
const SOURCE_MAX = 200;
const NOTE_MAX = 2000;
/* Module-local: a "use server" file may export only async functions. */
const CLOSED_POSTING =
  "This posting has closed and is not taking applications any more. The open roles are on the crew page.";
/* A link field that accepts anything becomes a spam field. http(s) only, and
   the row stores what they typed rather than a normalised guess. */
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;

export async function submitCrewApplication(
  _prev: CrewApplyState,
  formData: FormData
): Promise<CrewApplyState> {
  const roleId = String(formData.get("role_id") ?? "");
  const values: CrewApplyValues = {
    full_name: String(formData.get("full_name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    links: String(formData.get("links") ?? "").trim(),
    source: String(formData.get("source") ?? "").trim(),
    note: String(formData.get("note") ?? "").trim(),
  };

  const errors: CrewApplyState["errors"] = {};
  if (values.full_name.length < 2) errors.full_name = "Your name, as we should read it.";
  if (values.full_name.length > NAME_MAX) errors.full_name = "Shorter than that — the name as it is read out.";
  if (!EMAIL_RE.test(values.email) || values.email.length > EMAIL_MAX)
    errors.email = "A working address — the reply comes by mail.";
  if (values.phone.length > PHONE_MAX) errors.phone = "A phone number, not a paragraph.";
  if (values.links && (!URL_RE.test(values.links) || values.links.length > LINK_MAX))
    errors.links = "A full link, starting http — or leave it empty.";
  if (values.source.length > SOURCE_MAX) errors.source = "A few words on how you found it is plenty.";
  if (values.note.length < 20)
    errors.note = "A few lines at least. This is the part a person actually reads.";
  /* The policy on crew_candidates admits a note of 2000 characters. This said
     4000, so a note between the two passed here and was refused by the
     database as "that didn't land" — a candidate told the truth about the
     ceiling can meet it. */
  if (values.note.length > NOTE_MAX) errors.note = "Shorter than that. Two thousand characters is the ceiling.";
  if (!UUID_RE.test(roleId)) errors.form = "That role did not come through. Reload the page and try again.";

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  const supabase = await createClient();

  /* The page shows no form on a closed posting, but a form is a request and a
     request can be forged; the insert policy reads nothing about the role. A
     posting that has closed takes no application, and says so. */
  const { data: role } = await supabase.from("crew_roles").select("id, open").eq("id", roleId).maybeSingle();
  if (!role) return { ok: false, errors: { form: "That role is not on the list any more. The open roles are on the crew page." }, values };
  if (!role.open) return { ok: false, errors: { form: CLOSED_POSTING }, values };
  /* No .select() — the SELECT policy on this table is staff-only, so asking for
     the row back would fail the read after a successful write and read as an
     error to someone whose application landed fine. */
  const { error } = await supabase.from("crew_candidates").insert({
    role_id: roleId,
    full_name: values.full_name,
    email: values.email,
    phone: values.phone || null,
    links: values.links || null,
    cv_url: values.links || null,
    source: values.source || null,
    note: values.note,
  });

  if (error) {
    /* 53400 is the pacing trigger speaking and its message says the way out;
       23505 is the one-per-role index. Both are the database being clear, so
       neither gets flattened into a generic line. */
    const paced =
      error.code === "53400" && error.message ? error.message.replace(/^[^:]*:\s*/, "") : null;
    const twice =
      error.code === "23505"
        ? "You have already applied for this one — once is enough, and a person reads it next."
        : null;
    return {
      ok: false,
      errors: { form: paced ?? twice ?? "That didn't land. Try again; if it holds, write to us instead." },
      values,
    };
  }

  return {
    ok: true,
    errors: {},
    values: { full_name: "", email: "", phone: "", links: "", source: "", note: "" },
  };
}
