// send-sms — drains public.sms_outbox via Twilio. Day-of messages only:
// weather holds and muster changes, where email loses the race.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function secret(name: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_app_secret`, {
    method: "POST", headers: H, body: JSON.stringify({ p_name: name }),
  });
  if (!res.ok) return "";
  const v = await res.json();
  return typeof v === "string" ? v : "";
}

type Row = { id: string; to_phone: string; template: string; payload: Record<string, unknown> };

/* Short, plain, signed. No links longer than they need to be. */
function render(row: Row): string {
  const p = row.payload ?? {};
  const title = String(p["title"] ?? "");
  const body = String(p["body"] ?? "");
  switch (row.template) {
    case "weather-hold":
      return `LYRE — ${title} ${body}`.trim().slice(0, 300);
    case "muster":
      return `LYRE — Muster moved: ${body}`.slice(0, 300);
    default:
      return `LYRE — ${title || body}`.trim().slice(0, 300);
  }
}

async function mark(id: string, status: "sent" | "skipped" | "failed") {
  const body: Record<string, unknown> = { status };
  if (status === "sent") body.sent_at = new Date().toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/sms_outbox?id=eq.${id}&status=eq.pending`, {
    method: "PATCH", headers: H, body: JSON.stringify(body),
  });
}

Deno.serve(async () => {
  try {
    const [sid, token, from] = await Promise.all([
      secret("TWILIO_ACCOUNT_SID"), secret("TWILIO_AUTH_TOKEN"), secret("TWILIO_FROM"),
    ]);
    const rows: Row[] = await fetch(
      `${SUPABASE_URL}/rest/v1/sms_outbox?status=eq.pending&order=created_at.asc&limit=25&select=id,to_phone,template,payload`,
      { headers: H },
    ).then((r) => r.json());

    if (!sid || !token || !from) {
      for (const r of rows) await mark(r.id, "skipped");
      return Response.json({ fetched: rows.length, skipped: rows.length });
    }

    let sent = 0, failed = 0;
    for (const row of rows) {
      const form = new URLSearchParams({ To: row.to_phone, From: from, Body: render(row) });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${sid}:${token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      if (!res.ok) console.error(`twilio ${row.id}: ${res.status} ${await res.text()}`);
      await mark(row.id, res.ok ? "sent" : "failed");
      res.ok ? sent++ : failed++;
    }
    return Response.json({ fetched: rows.length, sent, failed });
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
