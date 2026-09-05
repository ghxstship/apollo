// send-outbox — drains public.email_outbox and delivers via Resend.
// [un] email system: paper canvas, acid rule, producer voice.
// No dependencies beyond fetch; talks to PostgREST directly with the service role key.
//
// The letters live here, in TypeScript. The REGISTRY of which letters exist
// lives in public.email_templates (by migration), and the gate in
// scripts/lib/letters.mjs holds the two in agreement: every code the registry
// lists renders here, every code rendered here is listed there, every key a
// letter requires is supplied by every caller that queues it, and every letter
// is classified transactional or marketing so the footer and the
// List-Unsubscribe header can say the right thing.

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
   Nothing is ever read from the request. Resolved once per invocation. */
let RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
let FROM = Deno.env.get("OUTBOX_FROM") ?? "";
/* Fallback only — the real sender is the OUTBOX_FROM row in Supabase Vault.
   Sending sits on atlvs.pro because Resend verifies one domain per plan and
   unhingedsocial.us is not registered yet. Moving it is one Vault update.

   The display name is QUOTED. RFC 5322 lists [ and ] as specials, so `[un] —
   Shoreside <shore@…>` is not a valid From header — some relays reject it and
   others silently mangle the name. The brackets are part of the mark and are
   not coming off, so they get quoted instead. */
const DEFAULT_FROM = '"[un] — Shoreside" <shore@atlvs.pro>';
/* Member-app origin for email deep links; overridable the same way as FROM. */
const APP_URL = Deno.env.get("APP_URL") || "https://unhingedsocial.us";
/* The club's clock. Every timestamp in a letter used to render in the zone of
   the machine that sent it — which for an edge function is UTC — so a Miami
   call time of 18:00 read "10:00 PM UTC" on every boarding pass ever sent. A
   payload may carry the episode's own time_zone (cities have one, episodes
   inherit it); when it does not, the club zone is used. Mirrors CLUB_ZONE in
   src/lib/brand.ts, which this function cannot import. */
const CLUB_ZONE = Deno.env.get("CLUB_ZONE") || "America/New_York";
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

/* Constant-time over encoded bytes; a length mismatch is a mismatch. */
function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

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
/* One invocation takes at most this many rows. The cron runs every five
   minutes, so a backlog drains at 300 letters an hour, which is above anything
   the club has ever queued in a day and below anything that would trip a
   provider's rate limit. */
const BATCH = 25;

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

/* A time zone the payload names, or the club's. An unknown zone string would
   make Intl throw mid-letter, so it is tried once here and the club's clock is
   the fallback rather than a 500 for the whole batch. */
function zoneOf(p: Record<string, unknown>): string {
  const z = p["time_zone"];
  if (typeof z === "string" && z.trim()) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: z.trim() });
      return z.trim();
    } catch {
      /* fall through to the club's clock */
    }
  }
  return CLUB_ZONE;
}

function when(v: unknown, zone: string): string {
  const d = new Date(String(v ?? ""));
  if (isNaN(d.getTime())) return "";
  /* The year only when it is not this one — a boarding pass for Friday does
     not need to say which year, a season card sent in January about a
     December episode does. */
  const thisYear = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric" }).format(new Date());
  const thatYear = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric" }).format(d);
  return d.toLocaleString("en-US", {
    timeZone: zone,
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(thisYear === thatYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/* The call time of an episode, in its own zone. */
function stamp(p: Record<string, unknown>): string {
  return when(p["starts_at"], zoneOf(p));
}

/* The plain-text half of every letter, derived from the HTML so the two can
   never disagree. Mail without a text part is scored as bulk by the filters
   that matter and is unreadable in the clients that strip markup. Links keep
   their address in brackets so a text-only reader can still get where the
   letter points. */
function toText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const plain = label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      return plain && plain !== href ? `${plain} (${href})` : href;
    })
    .replace(/<\/(p|div|tr|h[1-6]|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* Mail has no webfonts worth relying on, so this is the token stack's own
   fallback chain and nothing more: Instrument Serif if the reader happens to
   have it, Georgia otherwise — which is the fallback --font-editorial names. */
const SERIF = `'Instrument Serif', Georgia, 'Times New Roman', serif`;
const MONO = `'Space Mono', 'Courier New', monospace`;

/* Who the footer is talking to. The first two emails a stranger ever gets —
   application-received and port-invite — carried "you're on the cast" and
   pointed at a member app they have no account for. */
type Audience = "member" | "applicant";

/* What the law calls the letter. A transactional letter is about something
   the reader did or holds — a pass, a card, an application — and goes to
   everyone it concerns whatever their switches say. A marketing letter is one
   the club chose to send, and the reader must be able to stop it: the Sunday
   Log, the season's card, and the win-back. The footer and the
   List-Unsubscribe header both read from this. */
type Kind = "transactional" | "marketing";

type ShellOptions = { inverse?: boolean; audience?: Audience; kind?: Kind };

function shell(bodyHtml: string, opts: ShellOptions = {}): string {
  const { inverse = false, audience = "member", kind = "transactional" } = opts;
  /* Kit email system: ivory canvas, warm noir ink, an acid rule, mono strap
     footer. Email-safe stack — Georgia serif, Courier mono. */
  const ink = inverse ? "#F1F1ED" : "#141414";
  const paper = inverse ? "#0D0D0D" : "#EDEDEA";
  const card = inverse ? "#1C1C1C" : "#F7F7F4";
  const rule = inverse ? "#2F9410" : "#3EC317";
  const muted = inverse ? "#A6A6A0" : "#4F4F4C";
  const why = audience === "applicant"
    ? "You're getting this because you asked to come aboard. Nothing else follows unless we write again."
    : kind === "marketing"
      ? `You're getting this because you're on the cast. <a href="${APP_URL}/you" style="color:${muted};">Choose what we send you</a> — this one can be switched off there, and a reply saying stop does the same.`
      : `A notice about your membership or a pass you hold — it goes to everyone it concerns. <a href="${APP_URL}/you" style="color:${muted};">The rest of what we send is yours to choose</a>.`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper};padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:92%;background:${card};color:${ink};font-family:${SERIF};">
<tr><td style="padding:24px 24px 20px;letter-spacing:0.24em;font-size:13px;color:${ink};">[un]</td></tr>
<tr><td style="padding:0 24px;"><div style="border-top:2px solid ${rule};"></div></td></tr>
<tr><td style="padding:28px 24px;font-size:16px;line-height:1.65;color:${ink};">${bodyHtml}</td></tr>
<tr><td style="padding:0 24px;"><div style="border-top:1px solid ${muted}33;"></div></td></tr>
<tr><td style="padding:20px 24px 0;font-size:12px;line-height:1.6;color:${muted};">${why}</td></tr>
<tr><td style="padding:14px 24px 24px;font-family:${MONO};font-size:10px;letter-spacing:0.18em;color:${muted};">[un] anything goes here</td></tr>
</table>
</td></tr></table>`;
}

function greet(p: Record<string, unknown>): string {
  const name = p["name"];
  return name ? `<p style="margin:0 0 16px;">${esc(name)},</p>` : "";
}

/* The detail block on a pass: label · value rows. A row whose value is empty
   is left out — a boarding pass reading "Code:" followed by nothing is worse
   than one that says less. */
/* An exotic night runs on another clock than the member's own. When the
   payload names a home_time_zone that differs from the episode's, the call
   time is said twice — the episode's, then the member's. */
function homeClock(p: Record<string, unknown>): string {
  const home = p["home_time_zone"];
  if (typeof home !== "string" || !home.trim() || home.trim() === zoneOf(p)) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: home.trim() });
  } catch {
    return "";
  }
  const at = when(p["starts_at"], home.trim());
  return at ? ` <span style="color:#6B6B70;">(${esc(at)} where you are)</span>` : "";
}

/* An odyssey's legs, when the payload carries them: day, place, hour. */
function legsTable(p: Record<string, unknown>): string {
  const legs = Array.isArray(p["legs"]) ? (p["legs"] as Array<Record<string, unknown>>) : [];
  if (!legs.length) return "";
  const zone = zoneOf(p);
  const rows = legs
    .filter((l) => l && typeof l === "object")
    .map((l) => [
      `Day ${esc(l["day"] ?? "")}`,
      `${esc(l["place"] ?? "")}${l["starts_at"] ? ` · ${esc(when(l["starts_at"], zone))}` : ""}`,
    ] as [string, string]);
  return `<p style="margin:20px 0 6px;font-weight:600;">The legs</p>` + details(rows);
}

function details(rows: Array<[string, string]>): string {
  const kept = rows.filter(([, value]) => value.trim() !== "");
  if (!kept.length) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:${SERIF};font-size:15px;line-height:1.7;">
${kept
    .map(
      ([label, value]) =>
        `<tr><td style="padding:2px 0;color:#6B6B70;width:120px;">${esc(label)}</td><td${label === "Code" ? ' style="letter-spacing:0.12em;"' : ""}>${value}</td></tr>`,
    )
    .join("\n")}
</table>`;
}

function link(href: string, label: string): string {
  return `<a href="${href}" style="color:inherit;">${label}</a>`;
}

type Rendered = { subject: string; html: string };

const templates: Record<string, (p: Record<string, unknown>) => Rendered> = {
  /* A crew application is answered by a person too, and by a different one —
     this goes to whoever is hiring, not to Shoreside. The role rides in the
     payload so the letter can name what they applied for; a candidate who
     applied for two should be able to tell the two replies apart. */
  "crew-application-received": (p) => ({
    subject: p["role"] ? `Received — ${String(p["role"])}.` : "Received. A person reads it next.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">Your application${p["role"] ? ` for <strong>${esc(String(p["role"]))}</strong>` : ""} is with us. A person reads it — not a machine, not a scorecard.</p>
<p style="margin:0 0 16px;">We reply either way, inside the week. If it takes longer than that, chase us; the delay will be ours.</p>
<p style="margin:0;">Nothing else follows unless we write again.</p>`,
      { audience: "applicant" },
    ),
  }),
  "application-received": (p) => ({
    subject: "Received. A person reads it next.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">Your application is with Shoreside. A person reads it next — not a machine, not a scorecard.</p>
<p style="margin:0;">We reply within the week. Until then, the water keeps.</p>`,
      { audience: "applicant" },
    ),
  }),
  "port-invite": (p) => ({
    subject: "Come ashore once, as our guest.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">We read your application and we would like to meet you. Join us for one Table, as our guest, before anything is decided.</p>
<p style="margin:0;">Reply with a word and Shoreside will hold you a chair.</p>`,
      { audience: "applicant" },
    ),
  }),
  "welcome-aboard": (p) => ({
    subject: "Welcome aboard.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">Your place in the show is set${p["tier"] ? ` at the ${esc(TIER_LABEL[String(p["tier"])] ?? String(p["tier"]))} tier` : ""}. The Log arrives each Sunday, and the member app holds the rest.</p>
<p style="margin:0 0 20px;">Your first hundred knots are waiting in the ledger — they land the first time you come aboard.</p>
<p style="margin:0;">${link(`${APP_URL}/gangway`, "Come aboard →")}</p>`,
      { inverse: true },
    ),
  }),
  /* Half the schedule is ashore, so the row that names the hour is a CALL
     TIME — the show's own word for when the cast is due, afloat or at a
     venue — and not a departure. The muster is where; the call time is when. */
  "boarding-pass": (p) => ({
    subject: "Your pass is held.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 20px;">Your pass for ${esc(p["voyage"])} is held. Present the code at the gangway.</p>` +
        details([
          ["Code", esc(p["code"])],
          ["Muster", esc(p["muster"])],
          ["Call time", esc(stamp(p)) + homeClock(p)],
        ]) +
        `<p style="margin:20px 0 0;">Gangway details land 48 hours before call time.</p>`,
    ),
  }),
  /* The letter every confirmation promised for weeks before anything sent it:
     "Gangway details land 48 hours before…". Queued by carry_the_clock at
     T-48h, once per pass. */
  "gangway-details": (p) => ({
    subject: "Gangway details — 48 hours out.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 20px;">Two days to ${esc(p["voyage"])}. Here is everything the gangway asks for.</p>` +
        details([
          ["Muster", esc(p["muster"])],
          ["Call time", esc(stamp(p)) + homeClock(p)],
          ["Code", esc(p["code"])],
        ]) +
        legsTable(p) +
        `<p style="margin:20px 0 0;">Riviera Chic, sun up, phones down. Your member card boards you — brightness up at the gangway, and the crew knows the rest.</p>`,
    ),
  }),
  "weather-hold": (p) => ({
    subject: `Weather hold: ${String(p["voyage"] ?? "your episode")}`,
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">${esc(p["voyage"] ?? "Your episode")} is held for weather. Your pass is safe and nothing more is charged until it runs.</p>
<p style="margin:0;">We call it by 18:00 the night before${p["starts_at"] ? ` — call time was set for ${esc(stamp(p))}` : ""}.</p>`,
    ),
  }),
  /* This letter used to arrive alongside a boarding-pass at the same
     microsecond — two letters for one moment, on every promotion there has
     ever been. It is the one that survives, because it is the only one that
     can say WHY a pass suddenly exists, so it now carries what the other one
     carried: the code and the muster. */
  "waitlist-release": (p) => ({
    subject: "A pass released to you.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 20px;">You were first in order on the waitlist for ${esc(p["voyage"])}${p["starts_at"] ? `, call time ${esc(stamp(p))}` : ""}. You're aboard.</p>` +
        details([
          ["Code", esc(p["code"])],
          ["Muster", esc(p["muster"])],
          ["Call time", esc(stamp(p))],
        ]) +
        `<p style="margin:20px 0 0;">If the tide has turned, release the pass within 48 hours so the next name can take it.</p>`,
    ),
  }),
  /* The code is plumbing — the column and the caller both say voyage — but
     the letter says episode, and "will not run" rather than "will not sail":
     half the schedule is ashore, and an episode at a venue does not sail. */
  "voyage-cancelled": (p) => ({
    subject: `Cancelled: ${String(p["voyage"] ?? "your episode")}`,
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">The club called it. ${esc(p["voyage"] ?? "Your episode")} will not run${p["starts_at"] ? ` — it was set for ${esc(stamp(p))}` : ""}.</p>
<p style="margin:0;">Your account is credited in full. The next one is in ${link(`${APP_URL}/passes`, "Passes")}.</p>`,
    ),
  }),
  "farewell": (p) => ({
    subject: "Fair winds.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">Your departure is logged and the ledger is squared. The club keeps your record, and the roll keeps your name.</p>
<p style="margin:0;">Should you want your place back, a word to Shoreside is enough. Fair winds.</p>`,
      { inverse: true },
    ),
  }),
  /* Dunning. The trigger for this has fired since August — a subscriptions
     trigger calls run_automations('dues_failed') and the Bridge exposes the
     rule — but no letter existed, and a migration enforces that an automation
     cannot name a letter that does not exist. So the rule could not be created
     and involuntary churn went unworked.

     Written to be answerable, not shameful: a failed card is almost always a
     card, not a decision, and the member is usually the last to know.

     The dunning ladder (run_dunning) sends this on day 0 and day 7 and passes
     holds_on, the date the standing pauses; when it is there the letter says
     it, because a reminder that knows the date and keeps it to itself is not
     a reminder. */
  "dues-failed": (p) => ({
    subject: "Your card didn't go through.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">The card on file was declined for this month's dues. It is nearly always the card rather than the money — an expiry, a new number, a bank being careful.</p>
<p style="margin:0 0 16px;">Nothing changes today. We try again in a few days, and your standing holds while we do${p["holds_on"] ? ` — until ${esc(String(p["holds_on"]))}, when it pauses if the dues are still unsettled` : ""}.</p>
<p style="margin:0;">${link(`${APP_URL}/account`, "Update the card")} and it settles itself.</p>`,
    ),
  }),
  "card-expiring": (p) => ({
    subject: "The card on file expires soon.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">The card we hold for your dues expires${p["expires"] ? ` at the end of ${esc(p["expires"])}` : " shortly"}. Replacing it now means nothing skips.</p>
<p style="margin:0;">${link(`${APP_URL}/account`, "Update it here")} — it takes a minute.</p>`,
    ),
  }),
  /* The last letter before a standing is held. It says the date, because a
     final notice that does not is not a notice. */
  "final-notice": (p) => ({
    subject: "Last word before your standing pauses.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">We have not been able to settle this month's dues, and we have tried a few times now.</p>
<p style="margin:0 0 16px;">If it is still outstanding${p["holds_on"] ? ` on ${esc(String(p["holds_on"]))}` : " in a few days"}, your standing pauses — passes you already hold stay yours, and nothing else is charged.</p>
<p style="margin:0;">If something has changed, write to us rather than letting it lapse. ${link(`${APP_URL}/account`, "Settle it here")}.</p>`,
    ),
  }),
  /* The letter after the silence. A membership held for dues sits there
     indefinitely — the hold notice is sent once and nothing ever follows, so
     the club's position is "we stopped charging you and never mentioned it
     again", which is how an involuntary lapse becomes a permanent one.

     Written as a door rather than an invoice. Somebody whose card failed four
     months ago does not need the amount restated; they need to know the club
     kept their place and that coming back is one click. */
  "win-back": (p) => ({
    subject: "Your place is still here.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">Your membership has been on hold since the dues stopped clearing. We have not given the place away.</p>
<p style="margin:0 0 16px;">Your knots are where you left them and your tier is intact${p["knots"] ? ` — ${esc(String(p["knots"]))} of them` : ""}. Nothing has been charged in the meantime.</p>
<p style="margin:0 0 16px;">If it was the card, it is a minute to fix. If it was the year you were having, that is a fine reason too, and the door works the same either way.</p>
<p style="margin:0;">${link(`${APP_URL}/account`, "Pick it back up")}, or write back and tell us to stop asking — we will.</p>`,
      { kind: "marketing" },
    ),
  }),
  "refund-posted": (p) => ({
    subject: "Refund posted.",
    html: shell(
      greet(p) +
        `<p style="margin:0 0 16px;">A refund${p["amount"] ? ` of ${esc(p["amount"])}` : ""} is posted to your member account${p["memo"] ? ` — ${esc(p["memo"])}` : ""}.</p>
<p style="margin:0;">It appears in ${link(`${APP_URL}/account`, "your ledger")} now and settles with your statement.</p>`,
    ),
  }),
  /* The season's card — the kit's own email: an eyebrow, a figure grid in
     mono, marks won in serif, and one gold pill into the logbook. Figures
     read as a log entry, not a scorecard. Nothing comparative. */
  "season-card": (p) => {
    const marks = Array.isArray(p["marks"]) ? (p["marks"] as unknown[]) : [];
    /* `esc(value ?? 0)` turned a MISSING figure into the number nought and
       stated it as fact. That is how every season card ever sent told its
       member they had made 0 of everything: the template read keys that
       nothing has ever written — first `charters`, then `sailings` and
       `harbors` after send_season_cards was renamed out from under it and
       started building `episodes` and `cities`. Fourteen of them went out for
       real. The Bridge's own copy for this feature says "a card reading nought
       miles is a reproach", which is exactly what it was.

       The labels moved with the keys. HARBORS was a banned term set in caps on
       every card, and SAILINGS was the retired event noun in the same row.

       A key that is absent is not a zero. It renders as an em dash — the card
       declines to make a claim it has no basis for — and only a real 0 from
       the payload prints as 0. */
    const fig = (value: unknown, label: string) =>
      `<td width="33%" style="border-top:1px solid rgba(16,20,24,.2);padding:14px 0;">` +
      `<div style="font-family:${MONO};font-size:22px;color:#141414;font-weight:700;">${
        value === undefined || value === null ? "&mdash;" : esc(value)
      }</div>` +
      `<div style="font-family:${MONO};font-size:9px;letter-spacing:2px;color:#7E8894;padding-top:5px;">${esc(label)}</div></td>`;
    const strap = (label: string) =>
      `<div style="font-family:${MONO};font-size:10px;letter-spacing:2px;color:#7E8894;border-top:1px solid rgba(16,20,24,.2);padding-top:16px;margin-top:6px;">${esc(label)}</div>`;
    return {
      subject: `Your season — ${String(p["season"] ?? "the log")}`,
      html: shell(
        `<div style="font-family:${MONO};font-size:11px;letter-spacing:2px;color:#2F9410;text-transform:uppercase;">${esc(p["season"] ?? "The season")} · THE RECORD</div>
<div style="font-family:${SERIF};font-size:30px;line-height:1.2;color:#141414;padding:14px 0 6px;">Your season, on the record.</div>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4A5560;">The season is closed. This is what the log holds. No scripts. Nothing staged.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
<tr>${fig(p["nm_logged"], "NAUTICAL MILES")}${fig(p["episodes"], "EPISODES")}${fig(p["cities"], "CITIES")}</tr>
<tr>${fig(p["crew_met"], "CAST MET")}${fig(p["knots_earned"], "KNOTS BANKED")}<td width="33%" style="border-top:1px solid rgba(16,20,24,.2);"></td></tr>
</table>` +
          (marks.length
            ? strap("MARKS WON") +
              marks
                .map(
                  (m) =>
                    `<div style="font-family:${SERIF};font-size:17px;color:#141414;padding:8px 0 2px;">${esc(m)}</div>`,
                )
                .join("")
            : "") +
          (p["longest_title"]
            ? strap("LONGEST EPISODE") +
              `<div style="font-family:${SERIF};font-size:17px;color:#141414;padding:8px 0 2px;">${esc(p["longest_title"])}${
                p["longest_nm"] ? ` — ${esc(p["longest_nm"])} NM` : ""
              }</div>`
            : "") +
          `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr>
<td style="border-radius:999px;background:#3EC317;"><a href="${APP_URL}/card" style="display:inline-block;padding:13px 30px;font-size:14px;color:#0D0D0D;text-decoration:none;border-radius:999px;font-family:${SERIF};">Open your logbook</a></td>
</tr></table>
<p style="margin:14px 0 0;font-size:14px;color:#4A5560;">The log carries. Next season opens shortly.</p>`,
        { kind: "marketing" },
      ),
    };
  },
  /* A broadcast from the Bridge: send_broadcast picks an audience and queues
     the staff-written title and body verbatim. The letter is the shell around
     a person's words — paragraphs on blank lines, nothing invented — and it
     is marketing by classification: the club chose to send it, so the reader
     is told how to stop the next one. The lexicon gate reads this file, not
     the Bridge's text box; what an operator types is theirs to keep in
     voice. */
  "bridge-word": (p) => {
    const paragraphs = String(p["body"] ?? "")
      .split(/\n\s*\n/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para, i, all) =>
        `<p style="margin:0 0 ${i === all.length - 1 ? 0 : 16}px;">${esc(para).replace(/\n/g, "<br/>")}</p>`,
      )
      .join("");
    return {
      subject: String(p["title"] ?? "A word from Shoreside."),
      html: shell(greet(p) + paragraphs, { kind: "marketing" }),
    };
  },
  /* After the night wraps. Queued once by the_night_asks_for_its_frames, to
     every member who was aboard, checked in and in frame, when the episode
     goes to completed. The pipeline — upload during Live, the Bridge's
     approval queue, consent per member — has existed since August; this is
     the ask that was missing.

     Transactional, deliberately. It concerns a pass the reader held and used
     and a record they are already part of; it goes once, to everyone it
     concerns, and sells nothing. The control that fits it is not an
     unsubscribe but the one the trigger already reads: a member who steps
     out of frame at /you is never asked, and the letter says so. The frames
     upload lives on /live, which is where the letter points. */
  "frames-wanted": (p) => {
    const episode = String(p["episode"] ?? p["voyage"] ?? "The night");
    const slug = p["slug"];
    const page = typeof slug === "string" && slug.trim() ? `${APP_URL}/episodes/${encodeURIComponent(slug.trim())}` : "";
    return {
      subject: `Frames wanted — ${episode}.`,
      html: shell(
        greet(p) +
          `<p style="margin:0 0 16px;">${page ? link(page, esc(episode)) : esc(episode)} has wrapped. You were aboard and in frame, and the record is missing what you saw.</p>
<p style="margin:0 0 16px;">Send what you shot — a frame at a time, straight from your phone. It lands in the queue for the Bridge's eye, and nobody sees it until the Bridge clears it. Once cleared it reaches ${link(`${APP_URL}/gallery`, "the gallery")}, credited to you by name.</p>
<p style="margin:0 0 16px;">${link(`${APP_URL}/live`, "Send the frames →")}</p>
<p style="margin:0;">If you would rather the night stayed yours, send nothing. You can step out of frame at any time in ${link(`${APP_URL}/you`, "your settings")}, and we do not ask again.</p>`,
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
    /* The Sunday digest names itself. Since the rename an Episode is an EVENT,
       and the written record — which its own standfirst already called the Log
       — took that name back. A letter subject-lined "Episodes, Sundays." now
       promises a schedule and delivers an essay. */
    return {
      subject: "The Log, Sundays.",
      html: shell(
        greet(p) +
          `<p style="margin:0 0 16px;letter-spacing:0.22em;font-size:13px;">THE LOG</p>` +
          (list ||
            `<p style="margin:0 0 16px;">This week's reading is up. The Log keeps what the week kept — the latest is in ${link(`${APP_URL}/log`, "the member app")}.</p>`) +
          `<p style="margin:0;">Sunday, as always. The week ahead rides along.</p>`,
        { kind: "marketing" },
      ),
    };
  },
};

// The Sunday digest was queued as "dispatch-digest" before the rebrand, and as
// "episode-digest" before the Log took its name back — legacy keys still
// render the Log digest so queued rows send.
templates["dispatch-digest"] = templates["lore-digest"];
templates["episode-digest"] = templates["lore-digest"];

// "salon" is retired from the brand; rows queued under the old key still send
// as the Table invite.
templates["salon-invite"] = templates["port-invite"];

/* The classification, per code. A code that is not here is a gate failure
   (scripts/lib/letters.mjs), because a letter nobody has classified is a
   letter whose footer and headers are guesses. Marketing letters carry
   List-Unsubscribe; transactional ones do not, so a mail client's one-click
   control is never offered on a receipt it cannot honour. */
const LETTER_KIND: Record<string, Kind> = {
  "crew-application-received": "transactional",
  "application-received": "transactional",
  "port-invite": "transactional",
  "salon-invite": "transactional",
  "welcome-aboard": "transactional",
  "boarding-pass": "transactional",
  "gangway-details": "transactional",
  "weather-hold": "transactional",
  "waitlist-release": "transactional",
  "voyage-cancelled": "transactional",
  "farewell": "transactional",
  "dues-failed": "transactional",
  "card-expiring": "transactional",
  "final-notice": "transactional",
  "refund-posted": "transactional",
  "frames-wanted": "transactional",
  "win-back": "marketing",
  "bridge-word": "marketing",
  "season-card": "marketing",
  "lore-digest": "marketing",
  "dispatch-digest": "marketing",
  "episode-digest": "marketing",
};

/* The keys a letter cannot do without. A boarding pass with no code is not a
   boarding pass, and sending it anyway — which is what happened when an
   automation rule named this letter with a payload of {name, episode} — is a
   real letter, correctly addressed, that tells the member nothing. A row
   missing one of these is marked failed with the key named in last_error,
   where the Bridge shows it. Everything not listed here is optional and the
   letter degrades on purpose. The gate proves every literal caller supplies
   these. */
const REQUIRES: Record<string, string[]> = {
  "boarding-pass": ["voyage", "code"],
  "gangway-details": ["voyage", "code"],
  "weather-hold": ["voyage"],
  "waitlist-release": ["voyage"],
  "voyage-cancelled": ["voyage"],
  "refund-posted": ["amount"],
  "season-card": ["season"],
  "bridge-word": ["title", "body"],
  /* A frames request that cannot name the night is a request for nothing in
     particular; the trigger writes the title under both keys. */
  "frames-wanted": ["episode"],
};

function missingKeys(code: string, p: Record<string, unknown>): string[] {
  return (REQUIRES[code] ?? []).filter((k) => {
    const v = p[k];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  });
}

type Refused = { refused: string };

/* Unknown codes used to fall through to a content-free "A word from
   Shoreside." — a real letter, correctly addressed, saying nothing, sent to a
   member because somebody mistyped a code in a form. The registry stops an
   automation naming one; queue_email does not check. The sender is the last
   gate and it now refuses rather than improvises. */
function render(row: OutboxRow): Rendered | Refused {
  const p = row.payload ?? {};
  const fn = templates[row.template];
  if (!fn) return { refused: `no such letter: ${row.template}` };
  const missing = missingKeys(row.template, p);
  if (missing.length) return { refused: `letter ${row.template} needs ${missing.join(", ")}` };
  return fn(p);
}

// ---------- outbox plumbing ----------

async function fetchPending(): Promise<OutboxRow[]> {
  const now = new Date().toISOString();
  const url =
    `${REST}?status=eq.pending&or=(next_attempt_at.is.null,next_attempt_at.lte.${now})` +
    `&order=created_at.asc&limit=${BATCH}&select=id,to_email,template,payload,status,created_at,attempts`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`outbox fetch failed: ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("outbox fetch returned something that is not a list");
  return rows;
}

/* Addresses that bounced hard or complained. Recorded by the resend-events
   function into public.email_suppressions; read here so a suppressed address
   is skipped before Resend is asked, and the row says why. The table arrives
   by migration — until it exists this returns an empty set and says so once,
   so a missing table is a note in the log and not a stalled queue. */
async function suppressed(addresses: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!addresses.length) return out;
  const list = addresses.map((a) => `"${a.toLowerCase().replace(/"/g, "")}"`).join(",");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/email_suppressions?email=in.(${encodeURIComponent(list)})&select=email,reason`,
    { headers: HEADERS },
  );
  if (res.status === 404) {
    console.warn("email_suppressions is not on file yet — bounces and complaints are not being honoured");
    return out;
  }
  if (!res.ok) {
    console.error(`suppression read failed: ${res.status}`);
    return out;
  }
  const rows = await res.json();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (typeof r?.email === "string") out.set(r.email.toLowerCase(), String(r.reason ?? "suppressed"));
    }
  }
  return out;
}

/* Claim before sending. Marking after the provider call stops two runs
   double-MARKING a row; it does not stop them double-SENDING it. */
async function claim(id: string): Promise<boolean> {
  const res = await fetch(`${REST}?id=eq.${id}&status=eq.pending`, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=representation" },
    /* Stamped here, because the stall rescue measures from when a sender took
       the row. It used to measure from created_at, so a letter written twenty
       minutes ago and claimed a second ago — in a live call to Resend right
       now — was rescued and sent twice. */
    body: JSON.stringify({ status: "sending", claimed_at: new Date().toISOString() }),
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

async function mark(row: OutboxRow, status: "sent" | "skipped" | "failed", why?: string): Promise<void> {
  /* The row was claimed into 'sending' before the provider call, so that is the
     state we are moving it out of. Guarding on 'pending' here would have left
     every successfully sent row stuck mid-flight. */
  const body: Record<string, unknown> = { status };
  if (status === "sent") body.sent_at = new Date().toISOString();
  if (status === "failed") body.attempts = (row.attempts ?? 0) + 1;
  if (why) body.last_error = why;
  const res = await fetch(`${REST}?id=eq.${row.id}&status=in.(pending,sending)`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`mark ${status} failed for ${row.id}: ${res.status}`);
}

/* What the log may say about a provider response: the status and a short,
   scrubbed excerpt. Resend's validation errors echo the request — which
   carries the address and the letter — so the excerpt has anything shaped
   like an address removed before it is written anywhere. */
function scrub(text: string): string {
  return text.replace(/[^\s"'<>@,;]+@[^\s"'<>@,;]+/g, "[address]").replace(/\s+/g, " ").slice(0, 160);
}

async function sendViaResend(row: OutboxRow, letter: Rendered): Promise<{ ok: boolean; status: number; note: string }> {
  const kind = LETTER_KIND[row.template] ?? "transactional";
  const headers: Record<string, string> = {
    /* Gmail collapses letters with the same subject into a thread unless each
       carries its own reference. Two boarding passes for two episodes are not
       one conversation. */
    "X-Entity-Ref-ID": row.id,
  };
  /* Only a letter the reader can actually stop names a way to stop it. A URL,
     not one-click POST: RFC 8058 one-click requires an endpoint that acts on
     an unauthenticated POST, and this club does not have one. Naming a
     capability we do not have would be worse than naming none — the client
     would report success for something that never happened. */
  if (kind === "marketing") {
    headers["List-Unsubscribe"] = `<${APP_URL}/you>, <mailto:${shoresideAddress()}?subject=unsubscribe>`;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      /* The same row sent twice — a retry after a timeout that actually
         landed — is one letter at Resend, not two. */
      "Idempotency-Key": `outbox/${row.id}/${row.attempts ?? 0}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [row.to_email],
      subject: letter.subject,
      html: letter.html,
      text: toText(letter.html),
      headers,
      tags: [{ name: "letter", value: row.template }],
    }),
  });
  let note = "";
  if (!res.ok) {
    note = scrub(await res.text().catch(() => ""));
    console.error(`resend refused ${row.id} (${row.template}): ${res.status}`);
  }
  return { ok: res.ok, status: res.status, note };
}

/* One row, start to finish, and nothing it does can take the batch with it. A
   render that throws, a network error, a timeout — each used to escape the
   loop, leave the row in 'sending' for the stall rescue to find a quarter of
   an hour later, and abandon every row behind it. */
async function deliver(row: OutboxRow, blocked: Map<string, string>): Promise<"sent" | "skipped" | "retry" | "failed" | "taken"> {
  const stop = blocked.get(row.to_email.toLowerCase());
  if (stop) {
    await mark(row, "skipped", `address suppressed — ${stop}`);
    return "skipped";
  }
  const letter = render(row);
  if ("refused" in letter) {
    await mark(row, "failed", letter.refused);
    return "failed";
  }
  /* Claim first: marking after the send stops double-marking, not
     double-sending. A row another run already took is skipped. */
  if (!(await claim(row.id))) return "taken";
  try {
    const outcome = await sendViaResend(row, letter);
    if (outcome.ok) {
      await mark(row, "sent");
      return "sent";
    }
    const why = `provider said ${outcome.status}${outcome.note ? ` — ${outcome.note}` : ""}`;
    if (retryable(outcome.status)) {
      await requeue(row, why);
      return "retry";
    }
    await mark(row, "failed", why);
    return "failed";
  } catch (err) {
    /* A timeout or a dropped connection is not a verdict on the letter. */
    const why = err instanceof Error && err.name === "TimeoutError" ? "provider timed out" : "provider unreachable";
    await requeue(row, why);
    return "retry";
  }
}

Deno.serve(async (req: Request) => {
  try {
    await resolveSecrets();

    /* Scheduler only. The anon key is public, so it proves nothing. */
    /* Fail CLOSED. An empty key — Vault blip, missing row — used to skip the
       check entirely and reopen the drain to anyone with the public anon key. */
    const cronKey = Deno.env.get("CRON_SECRET") || (await vaultSecret("CRON_SECRET"));
    if (!cronKey) {
      return Response.json({ error: "the scheduler's key is not on file" }, { status: 503 });
    }
    if (!sameSecret(req.headers.get("x-cron-key"), cronKey)) {
      return Response.json({ error: "not for you" }, { status: 403 });
    }
    const rows = await fetchPending();
    let sent = 0, skipped = 0, retried = 0, failed = 0;

    if (!RESEND_API_KEY) {
      /* Leave the queue standing. Marking rows skipped to "drain" a queue with
         no key destroyed real letters during a key rotation; a queue that waits
         is a queue that sends when the key is back. */
      console.error(`RESEND_API_KEY not set — ${rows.length} letter(s) left pending.`);
      return Response.json({ fetched: rows.length, sent: 0, skipped: 0, retried: 0, failed: 0, reason: "no api key" }, { status: 503 });
    }

    const blocked = await suppressed(rows.map((r) => r.to_email));

    for (const row of rows) {
      let outcome: Awaited<ReturnType<typeof deliver>>;
      try {
        outcome = await deliver(row, blocked);
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

    /* A run that gave up on a letter is not a clean run. pg_net records the
       status, and a 207 is what a watcher can see; 200 said every run was fine.
       `retried` is reported apart from `failed`: a row waiting on a backoff has
       not failed, and a drain that says it has sends the operator chasing an
       outage that is a provider hiccup. */
    return Response.json({ fetched: rows.length, sent, skipped, retried, failed }, { status: failed > 0 ? 207 : 200 });
  } catch (err) {
    /* The message only. An error here can wrap a response body, and a response
       body from PostgREST can wrap a row. */
    console.error(`send-outbox: ${err instanceof Error ? err.message : "error"}`);
    return Response.json({ error: "the drain could not run" }, { status: 500 });
  }
});
