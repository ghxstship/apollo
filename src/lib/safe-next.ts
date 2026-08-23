/* Where a magic link is allowed to put you down.

   The old test was `startsWith("/") && !startsWith("//")`, repeated in three
   places. It reads right and is wrong: WHATWG treats a leading `/\` as an
   authority for http(s), so `next=/\evil.com` passes the test and then
   `new URL(next, origin)` resolves to http://evil.com. That turns a crafted
   /gangway link into a credential-phishing hop off our own origin — the member
   signs in for real, then lands somewhere else.

   Rather than blacklist the shapes, resolve the value and insist it stayed
   home. Anything that escapes the origin, or refuses to parse, goes to the
   fallback. */

const SENTINEL = "http://safe-next.invalid";

export function safeNext(raw: string | null | undefined, fallback = "/home"): string {
  if (!raw) return fallback;
  try {
    const url = new URL(raw, SENTINEL);
    if (url.origin !== SENTINEL) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    /* Resolving normalises `..`, so `/..//evil.com` comes back as `//evil.com`
       — a protocol-relative escape the moment it is resolved again. Insist the
       result is a single-slash path of our own. */
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
      return fallback;
    }
    return path;
  } catch {
    return fallback;
  }
}
