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

type Row = { id: string; profile_id: string; title: string; body: string | null; url: string | null };
type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

async function mark(id: string, status: "sent" | "skipped" | "failed") {
  const body: Record<string, unknown> = { status };
  if (status === "sent") body.sent_at = new Date().toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/push_outbox?id=eq.${id}&status=eq.pending`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(body),
  });
}

Deno.serve(async () => {
  try {
    const [pub, priv, subj] = await Promise.all([
      secret("VAPID_PUBLIC_KEY"),
      secret("VAPID_PRIVATE_KEY"),
      secret("VAPID_SUBJECT"),
    ]);
    const rows: Row[] = await fetch(
      `${SUPABASE_URL}/rest/v1/push_outbox?status=eq.pending&order=created_at.asc&limit=50&select=id,profile_id,title,body,url`,
      { headers: H },
    ).then((r) => r.json());

    if (!pub || !priv) {
      for (const r of rows) await mark(r.id, "skipped");
      return Response.json({ fetched: rows.length, skipped: rows.length });
    }
    webpush.setVapidDetails(subj || "mailto:shore@atlvs.pro", pub, priv);

    let sent = 0, failed = 0, skipped = 0;
    for (const row of rows) {
      const subs: Sub[] = await fetch(
        `${SUPABASE_URL}/rest/v1/push_subscriptions?profile_id=eq.${row.profile_id}&select=id,endpoint,p256dh,auth`,
        { headers: H },
      ).then((r) => r.json());
      if (!subs.length) { await mark(row.id, "skipped"); skipped++; continue; }

      const payload = JSON.stringify({
        title: row.title,
        body: row.body ?? "",
        url: row.url ?? "/word",
      });
      let ok = false;
      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
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
          }
        }
      }
      await mark(row.id, ok ? "sent" : "failed");
      ok ? sent++ : failed++;
    }
    return Response.json({ fetched: rows.length, sent, failed, skipped });
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
