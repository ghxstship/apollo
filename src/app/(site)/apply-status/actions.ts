"use server";

import { createClient } from "@/lib/supabase/server";
import type { StatusState } from "./shared";

/* application_status_for is anon-callable and returns the latest status for an
   address — nothing else about the application leaves the database. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function lookupApplication(
  _prev: StatusState,
  formData: FormData
): Promise<StatusState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { state: "error", email, error: "The address you applied with." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("application_status_for", { p_email: email });

  if (error) {
    return { state: "error", email, error: "That didn't land. Try again." };
  }
  if (!data) {
    return { state: "unknown", email };
  }
  return { state: "found", status: data, email };
}
