"use server";

import { createClient } from "@/lib/supabase/server";
import { moduleTables } from "@/lib/module-tables";
import { qrDataUrl } from "@/lib/commerce-qr";
import { voiceWith } from "@/lib/errors";

/* The digital credential, minted.

   The kit's rule is that the digital QR rotates every 60 seconds while online
   and the printed one does not. The rotation has to be a server mint or it is
   not a rotation: redrawing the same payload on a timer leaves the old value
   valid forever, so a screenshot boards. issue_member_qr() writes a row with a
   60-second expiry and verify_member_qr() reads the clock off that row, which
   means the credential on screen and the credential the crew scan are the same
   fact rather than two components agreeing to pretend.

   The token itself never reaches the page as text — only as the raster. There
   is nothing for a reader to copy out of the image that will still work by the
   time they have typed it. */

export type CredentialResult = { error?: string; qr?: string; expiresAt?: string };

export async function mintCredential(): Promise<CredentialResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const db = moduleTables(supabase);
  const { data, error } = await db.rpc("issue_member_qr");
  if (error) return { error: await voiceWith(supabase, error) };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { token: string; expires_at: string }
    | undefined;
  if (!row?.token) return { error: "The credential did not mint. Try again." };

  return { qr: await qrDataUrl(row.token), expiresAt: row.expires_at };
}
