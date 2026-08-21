// send-sms — drains public.sms_outbox via sent.dm. Day-of messages only:
// weather holds and muster changes, where email loses the race.
//
// sent.dm differs from a plain SMS gateway in one way that shapes this whole
// function: there is no ad-hoc text. Every send names a TEMPLATE registered with
// sent.dm and passes parameters into it, and that template must be approved —
// by Meta where a WhatsApp Business Account is connected, otherwise by sent.dm's
// compliance team, per channel — before anything goes out.
//
// So the mapping from the club's template codes to sent.dm's ids lives in
// public.sms_templates rather than in here. A code with no id yet is skipped,
// not failed: nothing is wrong with the message, the template simply is not
// registered, and a failed row would read like an outage.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENT_API = "https://api.sent.dm/v3/messages";

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

type Row = {
  id: string;
  to_phone: string;
  template: string;
  payload: Record<string, unknown>;
};

type Mapping = {
  code: string;
  provider_template_id: string | null;
  channels: string[];
  parameter_map: Record<string, string>;
  active: boolean;
};

/* sent.dm requires E.164. Anything else is the club's data problem, not a
   send-time guess — a number we cannot state confidently is not dialled. */
function e164(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  // A bare 10-digit number is North American by the only convention the club
  // has; 11 digits starting 1 is the same number written out.
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/* The outbox speaks in title/body; sent.dm speaks in named variables. The
   mapping says which is which, so neither side has to know about the other. */
function parameters(row: Row, map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [variable, key] of Object.entries(map ?? {})) {
    const v = row.payload?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      out[variable] = String(v).slice(0, 300);
    }
  }
  return out;
}

async function mark(id: string, status: "sent" | "skipped" | "failed") {
  const body: Record<string, unknown> = { status };
  if (status === "sent") body.sent_at = new Date().toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/sms_outbox?id=eq.${id}&status=eq.pending`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
  try {
    /* Sandbox proves the wiring — Vault key, template mapping, request shape —
       against the real sent.dm endpoint, without putting a message on a carrier.
       It deliberately does NOT touch the outbox. An earlier version validated
       real pending rows and left them pending, which meant the live cron picked
       them up minutes later and sent them for real. A test that arms the thing
       it is testing is worse than no test. */
    let sandbox = false;
    try {
      const body = await req.json();
      sandbox = body?.sandbox === true;
    } catch {
      /* No body is the ordinary cron call. */
    }

    const apiKey = await secret("SENT_API_KEY");

    const [rows, mappings]: [Row[], Mapping[]] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/sms_outbox?status=eq.pending&order=created_at.asc&limit=25` +
          `&select=id,to_phone,template,payload`,
        { headers: H },
      ).then((r) => r.json()),
      fetch(
        `${SUPABASE_URL}/rest/v1/sms_templates?select=code,provider_template_id,channels,parameter_map,active`,
        { headers: H },
      ).then((r) => r.json()),
    ]);

    if (!apiKey) {
      for (const r of rows) await mark(r.id, "skipped");
      return Response.json({ fetched: rows.length, skipped: rows.length, reason: "no api key" });
    }

    const byCode = new Map(mappings.map((m) => [m.code, m]));

    if (sandbox) {
      /* A synthetic message against the first registered template. Nothing is
         read from or written to the queue. */
      const registered = mappings.find((m) => m.active && m.provider_template_id);
      if (!registered) {
        return Response.json({
          sandbox: true, ok: false,
          reason: "no template is registered with sent.dm yet",
          templates: mappings.map((m) => m.code),
        });
      }
      const probe = await fetch(SENT_API, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: ["+15005550006"],
          template: { id: registered.provider_template_id, parameters: {} },
          channel: registered.channels?.length ? registered.channels : ["sms"],
          sandbox: true,
        }),
      });
      const text = await probe.text();
      return Response.json({
        sandbox: true, ok: probe.ok, status: probe.status,
        template: registered.code,
        response: text.slice(0, 400),
      });
    }

    let sent = 0, failed = 0, skipped = 0;

    for (const row of rows) {
      const map = byCode.get(row.template);

      // No registered, approved template — nothing is wrong, there is just
      // nothing to send against yet.
      if (!map || !map.active || !map.provider_template_id) {
        await mark(row.id, "skipped");
        skipped++;
        continue;
      }

      const to = e164(row.to_phone);
      if (!to) {
        console.error(`send-sms ${row.id}: unusable number`);
        await mark(row.id, "failed");
        failed++;
        continue;
      }

      const res = await fetch(SENT_API, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [to],
          template: {
            id: map.provider_template_id,
            parameters: parameters(row, map.parameter_map),
          },
          channel: map.channels?.length ? map.channels : ["sms"],
        }),
      });

      if (!res.ok) {
        console.error(`sent.dm ${row.id}: ${res.status} ${await res.text()}`);
        await mark(row.id, "failed");
        failed++;
        continue;
      }

      await mark(row.id, "sent");
      sent++;
    }

    return Response.json({ fetched: rows.length, sent, failed, skipped, sandbox });
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
