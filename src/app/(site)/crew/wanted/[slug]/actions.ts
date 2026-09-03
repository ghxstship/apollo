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
  if (!EMAIL_RE.test(values.email)) errors.email = "A working address — the reply comes by mail.";
  if (values.links && !URL_RE.test(values.links))
    errors.links = "A full link, starting http — or leave it empty.";
  if (values.note.length < 20)
    errors.note = "A few lines at least. This is the part a person actually reads.";
  if (values.note.length > 4000) errors.note = "Shorter than that. Four thousand characters is the ceiling.";
  if (!roleId) errors.form = "That role did not come through. Reload the page and try again.";

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  const supabase = await createClient();
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
