// resend-events — receives Resend's delivery webhooks and records the two
// verdicts a sender must never forget: a hard bounce and a complaint.
//
// Until this existed the club had no memory of either. Resend keeps its own
// suppression list, so a hard-bounced address was quietly dropped at the
// provider — but the outbox row stayed 'sent', the Bridge reported a letter
// delivered, and the next letter to the same address was queued, claimed and
// refused again with nothing on our side saying why. A complaint is worse:
// the reader asked to be left alone and the club could not hear them.
//
// What this writes:
//   public.email_suppressions  one row per address, reason and provider event
//   public.email_outbox        last_error on the recent sent rows to that
//                              address, so the Bridge shows the bounce beside
//                              the letter that bounced
//
// send-outbox reads email_suppressions before every batch and skips a listed
// address with the reason on the row. The table arrives by migration (the SQL
// is in the communications report); until it exists this function records
// nothing, says so in the log, and still answers 200 so Resend does not retry
// forever.
//
// Signature: Resend signs with Svix. svix-id, svix-timestamp and
// svix-signature come in headers; the secret is whsec_<base64>; the signed
// content is `${id}.${timestamp}.${rawBody}`; the signature header carries one
// or more `v1,<base64>` entries. Verified with WebCrypto, compared in constant
// time, and refused when the timestamp is more than five minutes off — the
// three checks Svix's own library makes.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

/* How far back a bounce annotates the outbox. A bounce arrives minutes after
   a send, a complaint within days; a week covers both without touching a
   letter from another season. */
const ANNOTATE_WINDOW_DAYS = 7;
const TOLERANCE_SECONDS = 5 * 60;

async function vaultSecret(name: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_app_secret`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ p_name: name }),
  });
  if (!res.ok) return "";
  const v = await res.json();
  return typeof v === "string" ? v : "";
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* Backed by a plain ArrayBuffer, which is what WebCrypto's BufferSource
   accepts; Uint8Array.from would type as ArrayBufferLike and be refused. */
function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verify(req: Request, raw: string, secret: string): Promise<boolean> {
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigs = req.headers.get("svix-signature");
  if (!id || !ts || !sigs) return false;
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const keyBytes = fromBase64(secret.replace(/^whsec_/, ""));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));

  for (const entry of sigs.split(" ")) {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) continue;
    try {
      if (timingSafeEqual(mac, fromBase64(value))) return true;
    } catch {
      /* not base64 — not ours */
    }
  }
  return false;
}

type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string; subType?: string; message?: string };
  };
};

function addressesOf(ev: ResendEvent): string[] {
  const to = ev.data?.to;
  const list = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
  return list
    .map((a) => String(a).replace(/^.*<([^>]+)>.*$/, "$1").trim().toLowerCase())
    .filter((a) => a.includes("@"));
}

/* What the verdict is, in the words the Bridge will show. Only a permanent
   bounce suppresses: a transient one — a full mailbox, a greylisting relay —
   is noted on the row and the next letter is still tried. */
function verdict(ev: ResendEvent): { suppress: boolean; reason: string } | null {
  switch (ev.type) {
    case "email.complained":
      return { suppress: true, reason: "complaint — the reader marked a letter as spam" };
    case "email.bounced": {
      const kind = (ev.data?.bounce?.type ?? "").toLowerCase();
      const sub = ev.data?.bounce?.subType ? ` (${ev.data.bounce.subType})` : "";
      if (kind === "transient" || kind === "undetermined") {
        return { suppress: false, reason: `soft bounce${sub}` };
      }
      return { suppress: true, reason: `hard bounce${sub}` };
    }
    case "email.delivery_delayed":
      return { suppress: false, reason: "delivery delayed at the receiving end" };
    default:
      return null;
  }
}

async function suppress(email: string, reason: string, eventId: string): Promise<"recorded" | "no table" | "failed"> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/email_suppressions`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      email,
      reason,
      source: "resend",
      provider_event_id: eventId,
      recorded_at: new Date().toISOString(),
    }),
  });
  if (res.status === 404) return "no table";
  if (!res.ok) {
    console.error(`suppression write failed: ${res.status}`);
    return "failed";
  }
  return "recorded";
}

async function annotate(email: string, reason: string): Promise<void> {
  const since = new Date(Date.now() - ANNOTATE_WINDOW_DAYS * 86_400_000).toISOString();
  /* ilike with no wildcard is a case-insensitive equality; the address is
     encoded so nothing in it can reach the query as syntax. */
  const url =
    `${SUPABASE_URL}/rest/v1/email_outbox?status=eq.sent&sent_at=gte.${since}` +
    `&to_email=ilike.${encodeURIComponent(email.replace(/[%_*]/g, ""))}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ last_error: `provider reported: ${reason}` }),
  });
  if (!res.ok) console.error(`outbox annotation failed: ${res.status}`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  try {
    /* Fail closed: no secret on file means no event is trusted. */
    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") || (await vaultSecret("RESEND_WEBHOOK_SECRET"));
    if (!secret) return Response.json({ error: "the webhook secret is not on file" }, { status: 503 });

    const raw = await req.text();
    if (!(await verify(req, raw, secret))) {
      return Response.json({ error: "not for you" }, { status: 401 });
    }
    const eventId = req.headers.get("svix-id") ?? "";

    let ev: ResendEvent;
    try {
      ev = JSON.parse(raw);
    } catch {
      return Response.json({ error: "not json" }, { status: 400 });
    }

    const v = verdict(ev);
    if (!v) return Response.json({ ignored: ev.type ?? "unknown" });

    const addresses = addressesOf(ev);
    let recorded = 0, annotated = 0;
    let tableMissing = false;
    for (const email of addresses) {
      if (v.suppress) {
        const outcome = await suppress(email, v.reason, eventId);
        if (outcome === "recorded") recorded++;
        if (outcome === "no table") tableMissing = true;
      }
      await annotate(email, v.reason);
      annotated++;
    }
    if (tableMissing) {
      console.warn(`email_suppressions is not on file yet — a ${ev.type} was not recorded`);
    }
    /* The type and the count. Never the address. */
    console.log(`resend ${ev.type}: ${addresses.length} address(es), ${recorded} suppressed, ${annotated} annotated`);
    return Response.json({ type: ev.type, suppressed: recorded, annotated, recorded: !tableMissing });
  } catch (err) {
    console.error(`resend-events: ${err instanceof Error ? err.message : "error"}`);
    return Response.json({ error: "could not record the event" }, { status: 500 });
  }
});
