"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { StatusState } from "./shared";

/* application_status_for is anon-callable and returns the standing of an
   application — nothing else about it leaves the database. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function lookupApplication(
  _prev: StatusState,
  formData: FormData
): Promise<StatusState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { state: "error", email, error: "The address you applied with." };
  }

  /* The visitor's address, not ours. This call is made server-side, so without
     it PostgREST sees the Next server for everybody and the rate limit becomes
     one shared budget for the whole site — the eleventh applicant anywhere
     would have been refused. */
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const caller = forwarded.split(",")[0]?.trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("application_status_for", {
    p_email: email,
    p_fingerprint: caller,
  });

  if (error) {
    /* The limit refuses in the club's own words and belongs at form level —
       it is not a fault in the address the applicant typed, and putting it on
       the email field said it was. */
    if (/checked a few times|too many lookups/i.test(error.message)) {
      return { state: "error", email, error: error.message.replace(/^./, (c) => c.toUpperCase()) + "." };
    }
    return { state: "error", email, error: "That didn't land. Try again." };
  }
  if (!data) {
    return { state: "unknown", email };
  }
  return { state: "found", status: data, email };
}
