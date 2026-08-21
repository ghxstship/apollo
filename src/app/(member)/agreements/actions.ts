"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/* Signing goes through the RPC, never a table write. The hash, the timestamp and
   the IP are all computed server-side — a client that could insert its own
   signature row could claim to have signed anything. */

export type SignInput = {
  documentCode: string;
  context: Record<string, string>;
  consent: boolean;
  consentText: string;
  kind: "typed" | "drawn";
  data: string;
  name: string;
  userAgent: string;
};

export async function signDocument(
  input: SignInput
): Promise<{ error?: string; signed?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase.rpc("sign_document", {
    p_document_code: input.documentCode,
    p_context: input.context,
    p_consent: input.consent,
    p_consent_text: input.consentText,
    p_signature_kind: input.kind,
    p_signature_data: input.data,
    p_signer_name: input.name || null,
    p_user_agent: input.userAgent || null,
  });

  if (error) {
    if (/consent/i.test(error.message))
      return { error: "Tick the box to agree to sign electronically." };
    if (/not published/i.test(error.message))
      return { error: "That document isn't ready to sign yet." };
    if (/signature is required/i.test(error.message))
      return { error: "A signature is required." };
    return { error: "That didn't land. Try again." };
  }

  revalidatePath("/agreements");
  revalidatePath("/card");
  return { signed: true };
}
