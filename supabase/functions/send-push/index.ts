// send-push — drains public.push_outbox to the browser Push API.
// VAPID keys live in Supabase Vault; read via the service-role-only RPC.
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function secret(name: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_app_secret`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ p_name: name }),
  });
  if (!res.ok) return "";
  const v = await res.json();
  return typeof v === "string" ? v : "";
}

type Row = { id: string; profile_id: string; title: string; body: string | null; url: string | null; attempts?: number };
type Sub = { id: string; profile_id: string; endpoint: string; p256dh: string; auth: string };

const MAX_ATTEMPTS = 5;

async function mark(id: string, status: "sent" | "skipped" | "failed") {
  const body: Record<string, unknown> = { status };
  if (status === "sent") body.sent_at = new Date().toISOString();
  /* `sending` too: the row is claimed before the Push API call, so by the
     time this runs it is no longer pending. */
  await fetch(`${SUPABASE_URL}/rest/v1/push_outbox?id=eq.${id}&status=in.(pending,sending)`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(body),
  });
}

/* Claim before sending — the discipline both siblings hold and this drain
   did not: two overlapping invocations both pushed, because only the MARKING
   collided. Only the invocation whose PATCH matched a pending row proceeds. */
async function claim(id: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_outbox?id=eq.${id}&status=eq.pending`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ status: "sending", claimed_at: new Date().toISOString() }),
  });
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length === 1;
}

/* A transient failure used to be terminal: any error marked `failed`, and the
   drain reads only `pending`. Push endpoints hiccup like carriers do. */
async function requeue(row: Row, why: string) {
  const attempts = (row.attempts ?? 0) + 1;
  const terminal = attempts >= MAX_ATTEMPTS;
  const backoff = new Date(Date.now() + Math.min(30, 2 ** attempts) * 60_000).toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/push_outbox?id=eq.${row.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(
      terminal
        ? { status: "failed", attempts, last_error: `${why} (gave up after ${attempts})` }
        : { status: "pending", attempts, next_attempt_at: backoff, last_error: why },
    ),
  });
  console.error(`push ${row.id}: ${why}${terminal ? " (gave up)" : ""}`);
}

Deno.serve(async (req: Request) => {
  try {
    /* Scheduler only. The migration that moved these drains behind a cron key
       said "the matching check lives in the edge functions themselves" — and it
       did, in send-outbox, and in neither of the other two. Both answered a
       bare anon key with 200 for a week. The anon key is public; it proves
       nothing about who is calling. */
    /* Fail CLOSED: an empty key used to skip the check entirely. */
    const cronKey = Deno.env.get("CRON_SECRET") || (await secret("CRON_SECRET"));
    if (!cronKey) {
      return Response.json({ error: "the scheduler's key is not on file" }, { status: 503 });
    }
    if (!sameSecret(req.headers.get("x-cron-key"), cronKey)) {
      return Response.json({ error: "not for you" }, { status: 403 });
    }

    const [pub, priv, subj] = await Promise.all([
      secret("VAPID_PUBLIC_KEY"),
      secret("VAPID_PRIVATE_KEY"),
      secret("VAPID_SUBJECT"),
    ]);
    const now = new Date().toISOString();
    const rows: Row[] = await fetch(
      `${SUPABASE_URL}/rest/v1/push_outbox?status=eq.pending&or=(next_attempt_at.is.null,next_attempt_at.lte.${now})&order=created_at.asc&limit=50&select=id,profile_id,title,body,url,attempts`,
      { headers: H },
    ).then((r) => r.json());

    if (!pub || !priv) {
      /* The queue waits for the keys; it is not drained to prove they are gone. */
      console.error(`VAPID keys not set — ${rows.length} push(es) left pending.`);
      return Response.json({ fetched: rows.length, skipped: 0, reason: "no vapid keys" }, { status: 503 });
    }
    webpush.setVapidDetails(subj || "mailto:shore@atlvs.pro", pub, priv);

    /* One read for every subscription this batch needs, not one per row. */
    const profileIds = [...new Set(rows.map((r) => r.profile_id))];
    const allSubs: Sub[] = profileIds.length
      ? await fetch(
          `${SUPABASE_URL}/rest/v1/push_subscriptions?profile_id=in.(${profileIds.join(",")})&select=id,profile_id,endpoint,p256dh,auth`,
          { headers: H },
        ).then((r) => r.json())
      : [];
    const subsByProfile = new Map<string, Sub[]>();
    for (const s of allSubs) {
      const list = subsByProfile.get(s.profile_id) ?? [];
      list.push(s);
      subsByProfile.set(s.profile_id, list);
    }

    let sent = 0, failed = 0, skipped = 0;
    for (const row of rows) {
      const subs = subsByProfile.get(row.profile_id) ?? [];
      if (!subs.length) { await mark(row.id, "skipped"); skipped++; continue; }

      /* Claimed immediately before the push — a row another run took is
         skipped, not re-sent. */
      if (!(await claim(row.id))) continue;

      const payload = JSON.stringify({
        title: row.title,
        body: row.body ?? "",
        url: row.url ?? "/inbox",
      });
      let ok = false;
      let transient = false;
      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { timeout: 5000 },
          );
          ok = true;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          // The browser dropped it — stop shouting into a dead endpoint.
          if (code === 404 || code === 410) {
            await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${s.id}`, {
              method: "DELETE",
              headers: H,
            });
          } else {
            /* 429/5xx/undefined is the service saying "later", not "never". */
            transient = true;
          }
        }
      }
      if (ok) {
        await mark(row.id, "sent");
        sent++;
      } else if (transient) {
        await requeue(row, "push service refused, worth another try");
        skipped++;
      } else {
        await mark(row.id, "failed");
        failed++;
      }
    }
    return Response.json({ fetched: rows.length, sent, failed, skipped }, { status: failed > 0 ? 207 : 200 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
