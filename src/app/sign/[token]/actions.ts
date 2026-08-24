"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { voice } from "@/lib/errors";

/* The token is the credential, so it is passed to a definer RPC that resolves
   the guest and their sailing itself. Nothing here trusts the caller for
   anything except the words they typed. */

export type GuestSignInput = {
  token: string;
  consent: boolean;
  consentText: string;
  kind: "typed" | "drawn";
  data: string;
  name: string;
  guardian: string;
  onCamera: boolean;
  userAgent: string;
};

export async function signAsGuest(
  input: GuestSignInput
): Promise<{ error?: string; signed?: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(input.token)) return { error: "That link isn't recognised." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_document_as_guest", {
    p_token: input.token,
    p_document_code: "guest-waiver",
    p_consent: input.consent,
    p_consent_text: input.consentText,
    p_signature_kind: input.kind,
    p_signature_data: input.data,
    p_signer_name: input.name || null,
    p_guardian_name: input.guardian || null,
    p_user_agent: input.userAgent || null,
    p_on_camera: input.onCamera,
  });

  if (error) {
    if (/consent/i.test(error.message))
      return { error: "Tick the box to agree to sign electronically." };
    if (/not recognised/i.test(error.message))
      return { error: "That link isn't recognised. Ask the member who invited you for a fresh one." };
    if (/signature is required/i.test(error.message))
      return { error: "A signature is required." };
    if (/nothing left to sign/i.test(error.message))
      return { error: "That sailing has gone — there is nothing left to sign." };
    /* A guest has no account and no other way to ask what went wrong, so a
       generic line strands them completely. The branches above are kept for
       being shorter than the raise; everything else reaches them as written. */
    return { error: voice(error) };
  }

  revalidatePath(`/sign/${input.token}`);
  return { signed: true };
}
