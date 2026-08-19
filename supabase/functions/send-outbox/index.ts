// send-outbox — drains public.email_outbox and delivers via Resend.
// No dependencies beyond fetch; talks to PostgREST directly with the service role key.

type OutboxRow = {
  id: string;
  to_email: string;
  template: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
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
   lyre.social is not registered yet. Moving it is one Vault update. */
const DEFAULT_FROM = "LYRE SOCIAL — Shoreside <shore@atlvs.pro>";

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

function shell(bodyHtml: string, inverse = false): string {
  const ink = inverse ? "#F2F2F4" : "#0B0B0C";
  const paper = inverse ? "#0B0B0C" : "#F2F2F4";
  const rule = inverse ? "#2A2A2E" : "#D8D8DC";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper};padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:92%;background:${paper};color:${ink};font-family:${SERIF};">
<tr><td style="padding:0 8px 24px;letter-spacing:0.28em;font-size:13px;color:${ink};">LYRE SOCIAL</td></tr>
<tr><td style="padding:0 8px;border-top:1px solid ${rule};"></td></tr>
<tr><td style="padding:28px 8px;font-size:16px;line-height:1.65;color:${ink};">${bodyHtml}</td></tr>
<tr><td style="padding:0 8px;border-top:1px solid ${rule};"></td></tr>
<tr><td style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:${inverse ? "#9A9AA0" : "#6B6B70"};">You're getting this because you're aboard. Preferences live in the member app.</td></tr>
<tr><td style="padding:14px 8px 0;font-family:${MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${inverse ? "#9A9AA0" : "#6B6B70"};">Strike a chord.</td></tr>
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
    ),
  }),
  "port-invite": (p) => ({
    subject: "Come ashore once, as our guest.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">We read your application and we would like to meet you. Join us for one Port Day, as our guest, before anything is decided.</p>
<p style="margin:0;">Reply with a word and Shoreside will hold you a chair.</p>`,
    ),
  }),
  "welcome-aboard": (p) => ({
    subject: "Welcome aboard.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">Your place in the club is set${p["tier"] ? ` at the ${esc(p["tier"])} tier` : ""}. The manifest arrives each Sunday, and the member app holds the rest.</p>
<p style="margin:0;">The first hundred knots are already in your ledger.</p>`,
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
    subject: `Weather hold: ${String(p["voyage"] ?? "your sailing")}`,
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">${esc(p["voyage"])} is held for weather. Your pass is safe and nothing is charged until we sail.</p>
<p style="margin:0;">We call it by 18:00 the night before${p["starts_at"] ? ` — departure was set for ${esc(when(p["starts_at"]))}` : ""}.</p>`,
    ),
  }),
  "waitlist-release": (p) => ({
    subject: "A pass released to you.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">You were first in order on the waitlist for ${esc(p["voyage"])}${p["starts_at"] ? `, departing ${esc(when(p["starts_at"]))}` : ""}. You're aboard.</p>
<p style="margin:0;">If the tide has turned, release the pass within 48 hours so the next name can take it.</p>`,
    ),
  }),
  "voyage-cancelled": (p) => ({
    subject: `Cancelled: ${String(p["voyage"] ?? "your sailing")}`,
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">The club called it. ${esc(p["voyage"] ?? "Your sailing")} will not sail${p["starts_at"] ? ` — it was set for ${esc(when(p["starts_at"]))}` : ""}.</p>
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
  /* The season's card — what a member actually did between two dates. Figures
     in mono so it reads as a log entry, not a scorecard. Nothing comparative. */
  "season-card": (p) => {
    const marks = Array.isArray(p["marks"]) ? (p["marks"] as unknown[]) : [];
    const row = (label: string, value: unknown) =>
      `<tr><td style="padding:5px 0;color:#6B6B70;width:180px;">${esc(label)}</td>` +
      `<td style="font-family:ui-monospace,Menlo,monospace;letter-spacing:0.06em;">${esc(value)}</td></tr>`;
    return {
      subject: `Your season — ${String(p["season"] ?? "the log")}`,
      html: shell(
        greet(p) +
          `<p style="margin:0 0 20px;">The season is closed. This is what the log holds.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:${SERIF};font-size:15px;line-height:1.7;">
${row("Nautical miles", p["nm_logged"])}
${row("Sailings", p["sailings"])}
${row("Harbors", p["harbors"])}
${row("Crew met", p["crew_met"])}
${row("Knots banked", p["knots_earned"])}
</table>` +
          (p["longest_title"]
            ? `<p style="margin:20px 0 0;">The longest of them was ${esc(p["longest_title"])}${
                p["longest_nm"] ? ` — ${esc(p["longest_nm"])} NM` : ""
              }.</p>`
            : "") +
          (marks.length
            ? `<p style="margin:20px 0 0;">Marks rounded: ${marks.map((m) => esc(m)).join(", ")}.</p>`
            : "") +
          `<p style="margin:20px 0 0;">The log carries. Next season opens shortly.</p>`,
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
      subject: "LORE, Sundays.",
      html: shell(
        greet(p) +
          `<p style="margin:0 0 16px;letter-spacing:0.22em;font-size:13px;">LORE</p>` +
          (list ||
            `<p style="margin:0 0 16px;">This week's reading is up. LORE reads everything — the latest dispatches are in the member app.</p>`) +
          `<p style="margin:0;">Sunday, as always. The manifest rides along.</p>`,
      ),
    };
  },
};

// The Sunday digest was queued as "dispatch-digest" before the rebrand —
// both keys render the LORE digest so queued rows still send.
templates["dispatch-digest"] = templates["lore-digest"];

// "salon" is retired from the brand; rows queued under the old key still send
// as the Port Day invite.
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
  const url = `${REST}?status=eq.pending&order=created_at.asc&limit=25&select=id,to_email,template,payload,status,created_at`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`outbox fetch failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function mark(id: string, status: "sent" | "skipped" | "failed"): Promise<void> {
  // Guarded on status=eq.pending so a concurrent run cannot double-mark a row.
  const body: Record<string, unknown> = { status };
  if (status === "sent") body.sent_at = new Date().toISOString();
  const res = await fetch(`${REST}?id=eq.${id}&status=eq.pending`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`mark ${status} failed for ${id}: ${res.status} ${await res.text()}`);
}

async function sendViaResend(row: OutboxRow): Promise<boolean> {
  const { subject, html } = render(row);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [row.to_email], subject, html }),
  });
  if (!res.ok) console.error(`resend failed for ${row.id} (${row.template}): ${res.status} ${await res.text()}`);
  return res.ok;
}

Deno.serve(async (_req: Request) => {
  try {
    await resolveSecrets();
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
        const ok = await sendViaResend(row);
        await mark(row.id, ok ? "sent" : "failed");
        ok ? sent++ : failed++;
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
