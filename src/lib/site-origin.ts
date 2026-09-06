import { SITE_DOMAIN } from "@/lib/brand";

/* The origin this deployment calls itself, read from configuration and never
   from the request.

   WHY THIS IS NOT DERIVED FROM THE REQUEST. An origin assembled from the
   `Host` header is whatever the caller wrote there. Next's Server Action
   origin check compares `Origin` against `Host`, so a caller who forges both
   to the same value satisfies it — the check proves the two headers agree, not
   that either is ours. Any origin that then leaves the process inside a link
   somebody else will follow (a password-reset mail, a magic link, an OAuth
   return, a Stripe success page) is a link the caller chose. The password
   reset is the sharp end: the mail goes to the victim, the `token_hash` lands
   on the attacker's host, and it is still good against the real
   /auth/confirm.

   So the rule is: a URL that leaves the process is built from here. A redirect
   the app hands straight back to the same caller is same-origin by
   construction (`new URL(path, request.url)`) and may keep using the request —
   it can only ever point the caller at a host they already reached.

   NEXT_PUBLIC_SITE_URL so a preview deploy issues links that point at itself,
   falling back to the production domain — right in production and the only
   honest default anywhere else. Read at call time, never at module load: one
   serverless module instance may serve many deployments, and a test wants to
   set and unset it between cases. */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`;
  return raw.replace(/\/+$/, "");
}
