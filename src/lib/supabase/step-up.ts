import type { SupabaseClient, User } from "@supabase/supabase-js";

/* The second step, for everything that is not a page.

   The proxy sends a member who has enrolled a code app to /gangway/verify
   until the code is proven, and it does that only for the page prefixes in
   PROTECTED. Route handlers are not pages and are not on that list, so the
   gate never ran for them: every handler authenticated with a bare getUser(),
   and getUser() is satisfied by a session at the FIRST assurance level.

   That is the whole attack. Someone holding a member's password but not their
   phone signs in at the gangway, is correctly bounced away from /home — and
   then asks /api/producer for the manifest, which answers with the boarding
   code for every pass they hold. The wallet routes hand back a signed pass
   carrying a live token; the billing routes open the portal. The second step
   was protecting the windows and not the door.

   Nothing in the database knows about assurance levels either — no policy and
   no definer function consults one — so RLS cannot be the backstop here. This
   is, and every cookie-authenticated handler calls it.

   A member who has enrolled nothing is unaffected: the question is only asked
   when a verified factor exists, which is the same shape the proxy uses. An
   API answers 401 rather than redirecting, because a redirect to an HTML page
   is not an answer a fetch() can use. */
export async function stepUpRefusal(supabase: SupabaseClient, user: User | null): Promise<Response | null> {
  /* The caller has already asked who this is; asking again would be a second
     round trip for an answer it is holding. Not signed in at all is the
     caller's own 401, not this one's business. */
  if (!user) return null;

  const enrolled = (user.factors ?? []).some((f) => f.status === "verified");
  if (!enrolled) return null;

  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  /* Fail closed. If the level cannot be read, the safe answer for a surface
     that hands out boarding codes and billing sessions is no. */
  if (error || !aal) {
    return Response.json({ error: "Prove the code first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (aal.currentLevel === aal.nextLevel) return null;

  return Response.json(
    { error: "Prove the code first.", next: "/gangway/verify" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}
