"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/* A standing view of the manifest.

   A member who only sails, or only follows one series, says so once and the
   manifest opens that way. Stored on the profile rather than in the browser so
   it survives the phone — which is the whole difference between this and a
   preference nobody can rely on.

   What is stored is the query string the pills already write, so there is one
   format for a filter set in this system rather than two that can disagree. */

/** Keys the manifest owns. Anything else is refused rather than stored: this
    column is written by a member, and it is read straight back into a URL. */
const ALLOWED = new Set(["setting", "series", "city", "season", "when", "from", "to", "sort"]);

const MAX = 200;

export async function saveStandingView(
  raw: string
): Promise<{ error?: string; saved?: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to keep a standing view." };

  /* Rebuilt from the parsed keys rather than trusted as a string. A member is
     not an attacker, but this value goes back out as a URL on their next visit
     and the cheapest place to be sure of its shape is before it is stored. */
  const incoming = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const clean = new URLSearchParams();
  for (const [key, value] of incoming) {
    if (!ALLOWED.has(key)) continue;
    if (!value || value.length > 64) continue;
    clean.set(key, value);
  }
  const qs = clean.toString();
  if (qs.length > MAX) return { error: "That is more filters than a standing view can hold." };

  /* Clearing is saving nothing, so there is one path and not two. */
  const value = qs.length > 0 ? qs : null;
  const { error } = await supabase
    .from("profiles")
    .update({ manifest_filters: value })
    .eq("id", user.id);
  if (error) return { error: "That did not save. Try again." };

  revalidatePath("/episodes");
  return { saved: value };
}
