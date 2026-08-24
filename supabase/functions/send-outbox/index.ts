// send-outbox — drains public.email_outbox and delivers via Resend.
// Syrius email system: ivory canvas, gold rule, producer voice.
// No dependencies beyond fetch; talks to PostgREST directly with the service role key.

type OutboxRow = {
  id: string;
  to_email: string;
  template: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  attempts?: number;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
/* Secrets: env first, then Supabase Vault via the service-role-only RPC
   public.get_app_secret — so delivery configures without CLI secret access.
   Resolved once per invocation in the handler. */
let RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
let FROM = Deno.env.get("OUTBOX_FROM") ?? "";
/* Fallback only — the real sender is the OUTBOX_FROM row in Supabase Vault.
   Sending sits on atlvs.pro because Resend verifies one domain per plan and
   syrius.social is not registered yet. Moving it is one Vault update. */
const DEFAULT_FROM = "SYRIUS SOCIAL — Shoreside <shore@atlvs.pro>";
/* Member-app origin for email deep links; overridable the same way as FROM. */
const APP_URL = Deno.env.get("APP_URL") || "https://syrius.social";
/* Derived from the sender rather than hard-coded, so the unsubscribe mailbox
   is always one that actually receives mail for the domain we send from. */
function shoresideAddress(): string {
  const m = FROM.match(/<([^>]+)>/);
  return m ? m[1] : "shore@atlvs.pro";
}

/* The tier as a member reads it. The welcome email used to interpolate the raw
   enum — "set at the regional tier" — which is the schema talking. */
const TIER_LABEL: Record<string, string> = {
  regional: "Regional",
  national: "National",
  global: "Global",
};

async function vaultSecret(name: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_app_secret`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_name: name }),
  });
  if (!res.ok) return "";
  const val = await res.json();
  return typeof val === "string" ? val : "";
}

async function resolveSecrets(): Promise<void> {
  if (!RESEND_API_KEY) RESEND_API_KEY = await vaultSecret("RESEND_API_KEY");
  if (!FROM) FROM = (await vaultSecret("OUTBOX_FROM")) || DEFAULT_FROM;
}

const REST = `${SUPABASE_URL}/rest/v1/email_outbox`;

/* The drain is scheduler-only work. It used to run with verify_jwt off, so any
   caller on the internet could empty the club's queue on demand — and the anon
   key that would have gated it ships in the browser bundle anyway. The cron
   presents a shared secret from the Vault; nobody else can. */
const MAX_ATTEMPTS = 5;

function retryable(status: number): boolean {
  /* 429 is the provider saying "later", not "never" — treating it as final is
     what stranded seventy boarding passes. 5xx is the same shape. */
  return status === 429 || status === 408 || status >= 500;
}

function backoffMinutes(attempts: number): number {
  return Math.min(60 * 6, Math.round(5 * Math.pow(3, Math.max(0, attempts - 1))));
}
const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// ---------- rendering ----------

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function when(v: unknown): string {
  const d = new Date(String(v ?? ""));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const SERIF = `'Marcellus', Georgia, 'Times New Roman', serif`;
const MONO = `'Space Mono', 'Courier New', monospace`;

/* Who the footer is talking to. The first two emails a stranger ever gets —
   application-received and port-invite — carried "you're on the cast" and
   pointed at a member app they have no account for. */
type Audience = "member" | "applicant";

function shell(bodyHtml: string, inverse = false, audience: Audience = "member"): string {
  /* Kit email system: ivory canvas #E9E2D2, warm noir ink, a gold rule, mono
     strap footer. Email-safe stack — Georgia serif, Courier mono. */
  const ink = inverse ? "#F4EFE6" : "#161B21";
  const paper = inverse ? "#101418" : "#E9E2D2";
  const card = inverse ? "#161B21" : "#F4EFE6";
  const rule = inverse ? "#3C2F1A" : "#B98A2F";
  const muted = inverse ? "#9AA3AD" : "#6B6B70";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper};padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:92%;background:${card};color:${ink};font-family:${SERIF};">
<tr><td style="padding:24px 24px 20px;letter-spacing:0.24em;font-size:13px;color:${ink};">SYRIUS SOCIAL</td></tr>
<tr><td style="padding:0 24px;"><div style="border-top:2px solid ${rule};"></div></td></tr>
<tr><td style="padding:28px 24px;font-size:16px;line-height:1.65;color:${ink};">${bodyHtml}</td></tr>
<tr><td style="padding:0 24px;"><div style="border-top:1px solid ${muted}33;"></div></td></tr>
<tr><td style="padding:20px 24px 0;font-size:12px;line-height:1.6;color:${muted};">${audience === "applicant"
  ? "You're getting this because you asked to come aboard. Nothing else follows unless we write again."
  : `You're getting this because you're on the cast. <a href="${APP_URL}/you" style="color:${muted};">Choose what we send you</a>.`}</td></tr>
<tr><td style="padding:14px 24px 24px;font-family:${MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${muted};">The unscripted social experiment.</td></tr>
</table>
</td></tr></table>`;
}

function greet(p: Record<string, unknown>): string {
  const name = p["name"];
  return name ? `<p style="margin:0 0 16px;">${esc(name)},</p>` : "";
}

type Rendered = { subject: string; html: string };

const templates: Record<string, (p: Record<string, unknown>) => Rendered> = {
  "application-received": (p) => ({
    subject: "Received. A person reads it next.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">Your application is with Shoreside. A person reads it next — not a machine, not a scorecard.</p>
<p style="margin:0;">We reply within the week. Until then, the water keeps.</p>`,
      false,
      "applicant",
    ),
  }),
  "port-invite": (p) => ({
    subject: "Come ashore once, as our guest.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">We read your application and we would like to meet you. Join us for one Table, as our guest, before anything is decided.</p>
<p style="margin:0;">Reply with a word and Shoreside will hold you a chair.</p>`,
      false,
      "applicant",
    ),
  }),
  "welcome-aboard": (p) => ({
    subject: "Welcome aboard.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">Your place in the show is set${p["tier"] ? ` at the ${esc(TIER_LABEL[String(p["tier"])] ?? String(p["tier"]))} tier` : ""}. The manifest arrives each Sunday, and the member app holds the rest.</p>
<p style="margin:0 0 20px;">Your first hundred knots are waiting in the ledger — they land the first time you come aboard.</p>
<p style="margin:0;"><a href="${APP_URL}/gangway" style="color:inherit;">Come aboard →</a></p>`,
      true,
    ),
  }),
  "boarding-pass": (p) => ({
    subject: "Your pass is held.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 20px;">Your pass for ${esc(p["voyage"])} is held. Present the code at the gangway.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:${SERIF};font-size:15px;line-height:1.7;">
<tr><td style="padding:2px 0;color:#6B6B70;width:120px;">Code</td><td style="letter-spacing:0.12em;">${esc(p["code"])}</td></tr>
<tr><td style="padding:2px 0;color:#6B6B70;">Muster</td><td>${esc(p["muster"])}</td></tr>
<tr><td style="padding:2px 0;color:#6B6B70;">Departs</td><td>${esc(when(p["starts_at"]))}</td></tr>
</table>
<p style="margin:20px 0 0;">Gangway details land 48 hours before departure.</p>`,
    ),
  }),
  "weather-hold": (p) => ({
    subject: `Weather hold: ${String(p["voyage"] ?? "your charter")}`,
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">${esc(p["voyage"])} is held for weather. Your pass is safe and nothing is charged until we sail.</p>
<p style="margin:0;">We call it by 18:00 the night before${p["starts_at"] ? ` — departure was set for ${esc(when(p["starts_at"]))}` : ""}.</p>`,
    ),
  }),
  /* This letter used to arrive alongside a boarding-pass at the same
     microsecond — two letters for one event, on every promotion there has ever
     been. It is the one that survives, because it is the only one that can say
     WHY a pass suddenly exists, so it now carries what the other one carried:
     the code and the muster. */
  "waitlist-release": (p) => ({
    subject: "A pass released to you.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 20px;">You were first in order on the waitlist for ${esc(p["voyage"])}${p["starts_at"] ? `, departing ${esc(when(p["starts_at"]))}` : ""}. You're aboard.</p>` +
        (p["code"]
          ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:${SERIF};font-size:15px;line-height:1.7;">
<tr><td style="padding:2px 0;color:#6B6B70;width:120px;">Code</td><td style="letter-spacing:0.12em;">${esc(p["code"])}</td></tr>
<tr><td style="padding:2px 0;color:#6B6B70;">Muster</td><td>${esc(p["muster"] ?? "Gangway B-12")}</td></tr>
${p["starts_at"] ? `<tr><td style="padding:2px 0;color:#6B6B70;">Departs</td><td>${esc(when(p["starts_at"]))}</td></tr>` : ""}
</table>`
          : "") +
        `<p style="margin:20px 0 0;">If the tide has turned, release the pass within 48 hours so the next name can take it.</p>`,
    ),
  }),
  "voyage-cancelled": (p) => ({
    subject: `Cancelled: ${String(p["voyage"] ?? "your charter")}`,
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">The club called it. ${esc(p["voyage"] ?? "Your charter")} will not sail${p["starts_at"] ? ` — it was set for ${esc(when(p["starts_at"]))}` : ""}.</p>
<p style="margin:0;">Your account is credited in full. The manifest holds the next open water.</p>`,
    ),
  }),
  "farewell": (p) => ({
    subject: "Fair winds.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">Your departure is logged and the ledger is squared. The club keeps your record, and the roll keeps your name.</p>
<p style="margin:0;">Should you want your place back, a word to Shoreside is enough. Fair winds.</p>`,
      true,
    ),
  }),
  "refund-posted": (p) => ({
    subject: "Refund posted.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">A refund${p["amount"] ? ` of ${esc(p["amount"])}` : ""} is posted to your member account${p["memo"] ? ` — ${esc(p["memo"])}` : ""}.</p>
<p style="margin:0;">It appears in your ledger now and settles with your statement.</p>`,
    ),
  }),
  /* The season's card — the kit's own email: an eyebrow, a figure grid in
     mono, marks won in serif, and one gold pill into the logbook. Figures
     read as a log entry, not a scorecard. Nothing comparative. */
  "season-card": (p) => {
    const marks = Array.isArray(p["marks"]) ? (p["marks"] as unknown[]) : [];
    /* `esc(value ?? 0)` turned a MISSING figure into the number nought and
       stated it as fact. That is how every season card ever sent told its
       member they had made 0 SAILINGS: the payload carries `sailings` and this
       template read `charters`, a key nothing has ever written. Fourteen of
       them went out for real. The Bridge's own copy for this feature says "a
       card reading nought miles is a reproach", which is exactly what it was.

       A key that is absent is not a zero. It renders as an em dash — the card
       declines to make a claim it has no basis for — and only a real 0 from
       the payload prints as 0. */
    const fig = (value: unknown, label: string) =>
      `<td width="33%" style="border-top:1px solid rgba(16,20,24,.2);padding:14px 0;">` +
      `<div style="font-family:${MONO};font-size:22px;color:#101418;font-weight:700;">${
        value === undefined || value === null ? "&mdash;" : esc(value)
      }</div>` +
      `<div style="font-family:${MONO};font-size:9px;letter-spacing:2px;color:#7E8894;padding-top:5px;">${esc(label)}</div></td>`;
    const strap = (label: string) =>
      `<div style="font-family:${MONO};font-size:10px;letter-spacing:2px;color:#7E8894;border-top:1px solid rgba(16,20,24,.2);padding-top:16px;margin-top:6px;">${esc(label)}</div>`;
    return {
      subject: `Your season — ${String(p["season"] ?? "the log")}`,
      html: shell(
        `<div style="font-family:${MONO};font-size:11px;letter-spacing:2px;color:#966E22;text-transform:uppercase;">${esc(p["season"] ?? "The season")} · THE RECORD</div>
<div style="font-family:${SERIF};font-size:30px;line-height:1.2;color:#101418;padding:14px 0 6px;">Your season, on the record.</div>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4A5560;">The season is closed. This is what the log holds. No scripts. No second takes.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
<tr>${fig(p["nm_logged"], "NAUTICAL MILES")}${fig(p["sailings"], "SAILINGS")}${fig(p["harbors"], "HARBORS")}</tr>
<tr>${fig(p["crew_met"], "CREW MET")}${fig(p["knots_earned"], "KNOTS BANKED")}<td width="33%" style="border-top:1px solid rgba(16,20,24,.2);"></td></tr>
</table>` +
          (marks.length
            ? strap("MARKS WON") +
              marks
                .map(
                  (m) =>
                    `<div style="font-family:${SERIF};font-size:17px;color:#101418;padding:8px 0 2px;">${esc(m)}</div>`,
                )
                .join("")
            : "") +
          (p["longest_title"]
            ? strap("LONGEST SAILING") +
              `<div style="font-family:${SERIF};font-size:17px;color:#101418;padding:8px 0 2px;">${esc(p["longest_title"])}${
                p["longest_nm"] ? ` — ${esc(p["longest_nm"])} NM` : ""
              }</div>`
            : "") +
          `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr>
<td style="border-radius:999px;background:#966E22;"><a href="${APP_URL}/card" style="display:inline-block;padding:13px 30px;font-size:14px;color:#F4EFE6;text-decoration:none;border-radius:999px;font-family:${SERIF};">Open your logbook</a></td>
</tr></table>
<p style="margin:14px 0 0;font-size:14px;color:#4A5560;">The log carries. Next season opens shortly.</p>`,
      ),
    };
  },
  "lore-digest": (p) => {
    const items = Array.isArray(p["items"]) ? (p["items"] as Array<Record<string, unknown>>) : [];
    const list = items
      .map(
        (it) =>
          `<p style="margin:0 0 14px;"><b style="font-weight:600;">${esc(it["title"])}</b>${it["dek"] ? `<br/><span style="color:#6B6B70;">${esc(it["dek"])}</span>` : ""}</p>`,
      )
      .join("");
    return {
      subject: "Episodes, Sundays.",
      html: shell(
        greet(p) +
          `<p style="margin:0 0 16px;letter-spacing:0.22em;font-size:13px;">EPISODES</p>` +
          (list ||
            `<p style="margin:0 0 16px;">This week's reading is up. Episodes keep what the cameras kept — the latest are in the member app.</p>`) +
          `<p style="margin:0;">Sunday, as always. The manifest rides along.</p>`,
      ),
    };
  },
};

// The Sunday digest was queued as "dispatch-digest" before the rebrand —
// legacy keys still render the Episodes digest so queued rows send.
templates["dispatch-digest"] = templates["lore-digest"];
templates["episode-digest"] = templates["lore-digest"];

// "salon" is retired from the brand; rows queued under the old key still send
// as the Table invite.
templates["salon-invite"] = templates["port-invite"];

function render(row: OutboxRow): Rendered {
  const p = row.payload ?? {};
  const fn = templates[row.template];
  if (fn) return fn(p);
  return {
    subject: "A word from Shoreside.",
    html: shell(greet(p) + `<p style="margin:0;">Shoreside has an update for you in the member app.</p>`),
  };
}

// ---------- outbox plumbing ----------

async function fetchPending(): Promise<OutboxRow[]> {
  const now = new Date().toISOString();
  const url =
    `${REST}?status=eq.pending&or=(next_attempt_at.is.null,next_attempt_at.lte.${now})` +
    `&order=created_at.asc&limit=25&select=id,to_email,template,payload,status,created_at,attempts`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`outbox fetch failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

/* Claim before sending. Marking after the provider call stops two runs
   double-MARKING a row; it does not stop them double-SENDING it. */
async function claim(id: string): Promise<boolean> {
  const res = await fetch(`${REST}?id=eq.${id}&status=eq.pending`, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=representation" },
    body: JSON.stringify({ status: "sending" }),
  });
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length === 1;
}

async function requeue(row: OutboxRow, why: string): Promise<void> {
  const attempts = (row.attempts ?? 0) + 1;
  const terminal = attempts >= MAX_ATTEMPTS;
  await fetch(`${REST}?id=eq.${row.id}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(
      terminal
        ? { status: "failed", attempts, last_error: `${why} (gave up after ${attempts})` }
        : {
            status: "pending",
            attempts,
            last_error: why,
            next_attempt_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
          },
    ),
  });
}

async function mark(id: string, status: "sent" | "skipped" | "failed"): Promise<void> {
  /* The row was claimed into 'sending' before the provider call, so that is the
     state we are moving it out of. Guarding on 'pending' here would have left
     every successfully sent row stuck mid-flight. */
  const body: Record<string, unknown> = { status };
  if (status === "sent") body.sent_at = new Date().toISOString();
  const res = await fetch(`${REST}?id=eq.${id}&status=in.(pending,sending)`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`mark ${status} failed for ${id}: ${res.status} ${await res.text()}`);
}

async function sendViaResend(row: OutboxRow): Promise<{ ok: boolean; status: number }> {
  const { subject, html } = render(row);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    /* There was no List-Unsubscribe header of any kind, on any letter,
       including a weekly bulk one. Mail clients look for this to offer their
       own unsubscribe control, and its absence is both a deliverability
       problem and a reader being given no way out that does not involve
       hunting through an app they may not be signed into.

       A URL, not one-click POST: RFC 8058 one-click requires an endpoint that
       acts on an unauthenticated POST, and this club does not have one. Naming
       a capability we do not have would be worse than naming none — the client
       would report success for something that never happened. */
    body: JSON.stringify({
      from: FROM,
      to: [row.to_email],
      subject,
      html,
      headers: {
        "List-Unsubscribe": `<${APP_URL}/you>, <mailto:${shoresideAddress()}?subject=unsubscribe>`,
      },
    }),
  });
  if (!res.ok) console.error(`resend failed for ${row.id} (${row.template}): ${res.status} ${await res.text()}`);
  return { ok: res.ok, status: res.status };
}

Deno.serve(async (req: Request) => {
  try {
    await resolveSecrets();

    /* Scheduler only. The anon key is public, so it proves nothing. */
    const cronKey = Deno.env.get("CRON_SECRET") || (await vaultSecret("CRON_SECRET"));
    if (cronKey && req.headers.get("x-cron-key") !== cronKey) {
      return new Response(JSON.stringify({ error: "not for you" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const rows = await fetchPending();
    let sent = 0, skipped = 0, failed = 0;

    if (!RESEND_API_KEY) {
      if (rows.length > 0) {
        console.log(`RESEND_API_KEY not set — marking ${rows.length} pending email(s) skipped so the queue drains.`);
      }
      for (const row of rows) {
        await mark(row.id, "skipped");
        skipped++;
      }
    } else {
      for (const row of rows) {
        /* Claim first: marking after the send stops double-marking, not
           double-sending. A row another run already took is skipped. */
        if (!(await claim(row.id))) continue;

        const outcome = await sendViaResend(row);
        if (outcome.ok) {
          await mark(row.id, "sent");
          sent++;
        } else if (retryable(outcome.status)) {
          await requeue(row, `provider said ${outcome.status}`);
          skipped++;
        } else {
          await fetch(`${REST}?id=eq.${row.id}`, {
            method: "PATCH",
            headers: HEADERS,
            body: JSON.stringify({
              status: "failed",
              attempts: (row.attempts ?? 0) + 1,
              last_error: `provider said ${outcome.status}`,
            }),
          });
          failed++;
        }
      }
    }

    return new Response(JSON.stringify({ fetched: rows.length, sent, skipped, failed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
