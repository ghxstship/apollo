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
  attempts?: number;
};

type Mapping = {
  code: string;
  provider_template_id: string | null;
  provider_template_name: string | null;
  channels: string[];
  parameter_map: Record<string, string>;
  active: boolean;
};

/* sent.dm resolves a template by name or by id. Name is preferred: the club
   creates `lyre_weather_hold` in the dashboard and this finds it, with no UUID
   to transcribe. The id pins an exact template when one is known. */
function templateRef(m: Mapping): { name?: string; id?: string } | null {
  if (m.provider_template_name) return { name: m.provider_template_name };
  if (m.provider_template_id) return { id: m.provider_template_id };
  return null;
}

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

async function mark(id: string, status: "sent" | "skipped" | "failed", why?: string) {
  const body: Record<string, unknown> = { status };
  if (status === "sent") body.sent_at = new Date().toISOString();
  if (why) body.last_error = why;
  /* `sending` too: the row is claimed before the carrier call, so by the time
     this runs it is no longer pending. */
  await fetch(`${SUPABASE_URL}/rest/v1/sms_outbox?id=eq.${id}&status=in.(pending,sending)`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(body),
  });
}

const MAX_ATTEMPTS = 5;

/* Nothing claimed a row before sending it. The fetch selected `pending` and the
   POST to sent.dm went out, and only the MARKING collided — so two overlapping
   invocations both put the message on a carrier and a real member's phone
   buzzed twice. Now the row is moved to `sending` first and only the
   invocation whose PATCH actually matched a pending row proceeds; the loser
   gets zero rows back and skips it. Exactly the shape send-outbox has used
   since it was written. */
async function claim(id: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sms_outbox?id=eq.${id}&status=eq.pending`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ status: "sending" }),
  });
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length === 1;
}

/* Every non-ok response used to mark `failed`, which is terminal — the drain
   reads only `pending`. A single transient 429 from the carrier permanently
   dropped the message, and these are day-of messages: a weather hold is the
   one thing /you promises "must not wait in an inbox". `attempts` and
   `next_attempt_at` have been on this table since it was created and nothing
   ever wrote to them. */
async function requeue(row: Row, why: string): Promise<boolean> {
  const attempts = (row.attempts ?? 0) + 1;
  const terminal = attempts >= MAX_ATTEMPTS;
  const backoff = new Date(Date.now() + Math.min(30, 2 ** attempts) * 60_000).toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/sms_outbox?id=eq.${row.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(
      terminal
        ? { status: "failed", attempts, last_error: `${why} (gave up after ${attempts})` }
        : { status: "pending", attempts, next_attempt_at: backoff, last_error: why },
    ),
  });
  return terminal;
}

Deno.serve(async (req) => {
  try {
    /* Scheduler only. The migration that moved these drains behind a cron key
       said "the matching check lives in the edge functions themselves" — and it
       did, in send-outbox, and in neither of the other two. Both answered a
       bare anon key with 200 for a week. The anon key is public; it proves
       nothing about who is calling. */
    const cronKey = Deno.env.get("CRON_SECRET") || (await secret("CRON_SECRET"));
    if (cronKey && req.headers.get("x-cron-key") !== cronKey) {
      return new Response(JSON.stringify({ error: "not for you" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

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
        `${SUPABASE_URL}/rest/v1/sms_outbox?status=eq.pending&or=(next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()})` +
          `&order=created_at.asc&limit=25&select=id,to_phone,template,payload,attempts`,
        { headers: H },
      ).then((r) => r.json()),
      fetch(
        `${SUPABASE_URL}/rest/v1/sms_templates?select=code,provider_template_id,provider_template_name,channels,parameter_map,active`,
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
      const registered = mappings.find((m) => m.active && templateRef(m));
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
          template: { ...templateRef(registered), parameters: {} },
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

    let sent = 0, failed = 0, skipped = 0, retried = 0;

    for (const row of rows) {
      const map = byCode.get(row.template);

      // No registered, approved template — nothing is wrong, there is just
      // nothing to send against yet.
      const ref = map ? templateRef(map) : null;
      if (!map || !map.active || !ref) {
        await mark(row.id, "skipped");
        skipped++;
        continue;
      }

      const to = e164(row.to_phone);
      if (!to) {
        console.error(`send-sms ${row.id}: unusable number`);
        await mark(row.id, "failed", "unusable number");
        failed++;
        continue;
      }

      /* Claimed immediately before the carrier call and not a line earlier:
         everything above this point is a decision about the row, not a send. */
      if (!(await claim(row.id))) continue;

      const res = await fetch(SENT_API, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [to],
          template: { ...ref, parameters: parameters(row, map.parameter_map) },
          channel: map.channels?.length ? map.channels : ["sms"],
        }),
      });

      if (!res.ok) {
        const why = `provider said ${res.status}`;
        console.error(`sent.dm ${row.id}: ${res.status} ${await res.text()}`);
        /* 4xx that is not a rate limit is the club's mistake and will not get
           better by repeating it; anything else is worth another try. */
        const worthRetrying = res.status === 429 || res.status === 408 || res.status >= 500;
        if (worthRetrying) {
          if (await requeue(row, why)) failed++;
          else retried++;
        } else {
          await mark(row.id, "failed", why);
          failed++;
        }
        continue;
      }

      await mark(row.id, "sent");
      sent++;
    }

    /* `retried` is reported rather than folded into `failed`: a row waiting
       on a backoff has not failed, and a drain that reports it as failed would
       have the operator chasing an outage that is a carrier hiccup. */
    return Response.json({ fetched: rows.length, sent, failed, skipped, retried, sandbox });
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
