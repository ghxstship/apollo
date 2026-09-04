"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { voiceWith } from "@/lib/errors";
import { boundSignature } from "./signature";

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

  if (!/^[a-z0-9-]{1,64}$/i.test(input.documentCode)) {
    return { error: "That link looks wrong. Start again from Agreements." };
  }
  const bounded = boundSignature(input);
  if (!bounded) return { error: "That signature didn't land. Try again." };
  /* The context is the rendering condition set and nothing else — a handful
     of short string keys. Anything wider is not what the page rendered. */
  const context: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.context ?? {}).slice(0, 8)) {
    if (/^[a-z_]{1,32}$/.test(k) && typeof v === "string") context[k] = v.slice(0, 40);
  }

  const { error } = await supabase.rpc("sign_document", {
    p_document_code: input.documentCode,
    p_context: context,
    p_consent: input.consent === true,
    p_consent_text: bounded.consentText,
    p_signature_kind: bounded.kind,
    p_signature_data: bounded.data,
    p_signer_name: bounded.name || null,
    p_user_agent: bounded.userAgent || null,
  });

  if (error) {
    if (/consent/i.test(error.message))
      return { error: "Tick the box to agree to sign electronically." };
    if (/not published/i.test(error.message))
      /* Said what had happened and nothing about what happens next. Publishing
         is Shoreside's move, not the member's, so the line says whose it is. */
      return { error: "That document isn't ready to sign yet. Shoreside publishes it, and it lands here when they do." };
    if (/signature is required/i.test(error.message))
      return { error: "A signature is required." };
    /* Anything the RPC refuses in its own words reaches the member in them —
       "that paper is not yours to sign", "that document is not published".
       The branches above only exist because they say something SHORTER than
       the raise does; the fallback used to throw the rest away. */
    return { error: await voiceWith(supabase, error) };
  }

  revalidatePath("/agreements");
  revalidatePath("/card");
  return { signed: true };
}
