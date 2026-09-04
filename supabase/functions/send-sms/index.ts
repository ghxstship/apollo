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
   creates `un_weather_hold` in the dashboard and this finds it, with no UUID
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sms_outbox?id=eq.${id}&status=in.(pending,sending)`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`mark ${status} failed for ${id}: ${res.status}`);
}

const MAX_ATTEMPTS = 5;
/* Bounded per invocation; the cron runs every five minutes. */
const BATCH = 25;

/* What the log may say about a carrier response. sent.dm's validation errors
   echo the request, and the request carries the number — so anything shaped
   like a phone number or an address is removed before the excerpt is written
   anywhere, and the excerpt is short. */
function scrub(text: string): string {
  return text
    .replace(/[^\s"'<>@,;]+@[^\s"'<>@,;]+/g, "[address]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

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
    /* See send-outbox: the stall rescue measures from the claim. */
    body: JSON.stringify({ status: "sending", claimed_at: new Date().toISOString() }),
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
    /* Fail CLOSED: an empty key used to skip the check entirely. */
    const cronKey = Deno.env.get("CRON_SECRET") || (await secret("CRON_SECRET"));
    if (!cronKey) {
      return Response.json({ error: "the scheduler's key is not on file" }, { status: 503 });
    }
    if (!sameSecret(req.headers.get("x-cron-key"), cronKey)) {
      return Response.json({ error: "not for you" }, { status: 403 });
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

    /* A PostgREST error is a JSON object, not a list, and `.map` on it took
       the whole run down as a 500 with the error text — headers and all — in
       the log. Each read is checked for shape and named on failure. */
    const list = async <T,>(what: string, url: string): Promise<T[]> => {
      const res = await fetch(url, { headers: H });
      if (!res.ok) throw new Error(`${what} read failed: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error(`${what} read returned something that is not a list`);
      return data as T[];
    };
    const [rows, mappings] = await Promise.all([
      list<Row>(
        "sms_outbox",
        `${SUPABASE_URL}/rest/v1/sms_outbox?status=eq.pending&or=(next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()})` +
          `&order=created_at.asc&limit=${BATCH}&select=id,to_phone,template,payload,attempts`,
      ),
      list<Mapping>(
        "sms_templates",
        `${SUPABASE_URL}/rest/v1/sms_templates?select=code,provider_template_id,provider_template_name,channels,parameter_map,active`,
      ),
    ]);

    if (!apiKey) {
      /* The queue waits for the key; it is not drained to prove the key is gone. */
      console.error(`SENT_API_KEY not set — ${rows.length} text(s) left pending.`);
      return Response.json({ fetched: rows.length, skipped: 0, reason: "no api key" }, { status: 503 });
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

    /* One row, start to finish, and nothing it does can take the batch with
       it. A carrier timeout used to throw straight out of the loop, leave the
       row in 'sending' for the stall rescue, and abandon every row behind it —
       and these are day-of messages. */
    const deliver = async (row: Row): Promise<"sent" | "skipped" | "retry" | "failed" | "taken"> => {
      const map = byCode.get(row.template);

      // No registered, approved template — nothing is wrong, there is just
      // nothing to send against yet.
      const ref = map ? templateRef(map) : null;
      if (!map || !map.active || !ref) {
        await mark(row.id, "skipped", `template ${row.template} is not registered with the carrier`);
        return "skipped";
      }

      const to = e164(row.to_phone);
      if (!to) {
        console.error(`send-sms ${row.id}: unusable number`);
        await mark(row.id, "failed", "unusable number");
        return "failed";
      }

      /* Claimed immediately before the carrier call and not a line earlier:
         everything above this point is a decision about the row, not a send. */
      if (!(await claim(row.id))) return "taken";

      let res: Response;
      try {
        res = await fetch(SENT_API, {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [to],
            template: { ...ref, parameters: parameters(row, map.parameter_map) },
            channel: map.channels?.length ? map.channels : ["sms"],
          }),
        });
      } catch (err) {
        /* A timeout or a dropped connection is not a verdict on the message. */
        const why = err instanceof Error && err.name === "TimeoutError" ? "carrier timed out" : "carrier unreachable";
        return (await requeue(row, why)) ? "failed" : "retry";
      }

      if (!res.ok) {
        const note = scrub(await res.text().catch(() => ""));
        const why = `provider said ${res.status}${note ? ` — ${note}` : ""}`;
        console.error(`sent.dm refused ${row.id} (${row.template}): ${res.status}`);
        /* 4xx that is not a rate limit is the club's mistake and will not get
           better by repeating it; anything else is worth another try. */
        const worthRetrying = res.status === 429 || res.status === 408 || res.status >= 500;
        if (worthRetrying) return (await requeue(row, why)) ? "failed" : "retry";
        await mark(row.id, "failed", why);
        return "failed";
      }

      await mark(row.id, "sent");
      return "sent";
    };

    for (const row of rows) {
      let outcome: Awaited<ReturnType<typeof deliver>>;
      try {
        outcome = await deliver(row);
      } catch (err) {
        /* Even the bookkeeping can fail — PostgREST down mid-batch. The row
           is left where it is; the stall rescue and the next run pick it up. */
        console.error(`row ${row.id} (${row.template}) could not be settled: ${err instanceof Error ? err.name : "error"}`);
        outcome = "retry";
      }
      if (outcome === "sent") sent++;
      else if (outcome === "skipped") skipped++;
      else if (outcome === "retry") retried++;
      else if (outcome === "failed") failed++;
    }

    /* `retried` is reported rather than folded into `failed`: a row waiting
       on a backoff has not failed, and a drain that reports it as failed would
       have the operator chasing an outage that is a carrier hiccup. */
    return Response.json({ fetched: rows.length, sent, failed, skipped, retried, sandbox }, { status: failed > 0 ? 207 : 200 });
  } catch (err) {
    /* The message only. An error here can wrap a response body, and a response
       body from PostgREST can wrap a row. */
    console.error(`send-sms: ${err instanceof Error ? err.message : "error"}`);
    return Response.json({ error: "the drain could not run" }, { status: 500 });
  }
});
