import "server-only";

/* What a stranger may spend on one request, before anything is believed.

   Two guards live here because they are the same idea: a route that answers
   before it authenticates has to bound what the answering itself costs. */

/* ── The body ─────────────────────────────────────────────────────────────

   `await request.text()` and `await request.json()` buffer the whole body into
   the process before a single byte of it has been judged. On the Stripe
   webhook that buffering is unavoidable — the raw body IS the signed content,
   so it cannot be verified until it is whole — which makes the cap the only
   thing standing between an unauthenticated caller and half a gigabyte of
   heap.

   A cap read off `Content-Length` is not a cap. The header is the caller's own
   claim, and a chunked request omits it entirely, so a declared-length check
   passes anything that declines to declare. The count that matters is kept
   here, over the bytes as they arrive, and the read is abandoned the moment it
   goes past.

   Answers null when the body is over the cap or unreadable; the caller decides
   what to say, because the sentence a webhook owes Stripe is not the one a
   Producer owes a member. */
export async function readBounded(request: Request, maxBytes: number): Promise<string | null> {
  /* The declared length is still worth reading — an honest client that says it
     is sending too much is refused without transferring any of it. It is a
     shortcut, never the check. */
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  const stream = request.body;
  if (!stream) return "";

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let seen = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      if (seen > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch {
    /* A connection that died mid-body is not a body. */
    return null;
  }
}

/* ── The origin of the ask ────────────────────────────────────────────────

   A POST carrying a `text/plain` body of JSON is a CORS simple request: no
   preflight, so a page on any origin can send one. What stops it here is that
   Supabase's auth cookies are SameSite=Lax, which means a cross-site POST
   carries no session and the handler's own `getUser()` answers 401 — the
   session cookie is the authorisation, and it is not there to be ridden.

   That mitigation holds today and is not written down anywhere the browser can
   read, so this is the belt beside it: when the browser itself says the ask
   came from another site, the club declines to answer at all. Refused only on
   an explicit `cross-site` — the header is absent on every non-browser caller
   (curl, a native app, a server) and `same-origin` / `same-site` / `none` are
   all ours, so nothing legitimate is turned away by a header it never sends. */
export function crossSiteRefusal(request: Request): Response | null {
  if (request.headers.get("sec-fetch-site") !== "cross-site") return null;
  return Response.json(
    { error: "That request did not come from the club." },
    { status: 403, headers: { "Cache-Control": "private, no-store" } }
  );
}
