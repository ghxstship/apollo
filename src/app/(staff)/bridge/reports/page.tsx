import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { Badge, Stat, Table } from "@/components/ds";
import { logDate, logDateTime, price } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import type { Json } from "@/lib/supabase/types";
import { getOperator } from "../../data";
import { must, mustValue } from "../../staff";
import { OutboxTable, type StrandedRow } from "./outbox-client";

export const metadata: Metadata = { title: "Reports" };

/* The outbox columns the retries added (attempts, next_attempt_at —
   20260823151359) are not on the shared row types, so the three reads go
   through the module seam and are typed here, at the boundary. */
type EmailStranded = { id: string; to_email: string; template: string; last_error: string | null; attempts: number | null; created_at: string; status: string };
type SmsStranded = { id: string; to_phone: string; template: string; last_error: string | null; attempts: number | null; created_at: string; status: string };
type PushStranded = { id: string; profile_id: string; title: string; last_error: string | null; attempts: number | null; created_at: string; status: string };

type ChangeRow = {
  id: string;
  table: string;
  action: string;
  what: string;
  who: string;
  at: string;
  diff: string;
  [key: string]: unknown;
};

/* The handful of columns whose name is not the word an operator reads. The log
   named raw columns, which is defensible for an audit trail and stops being so
   the moment the display word and the column word are different things: an
   operator reading "series" on a console that says Series everywhere else has
   to hold two vocabularies at once to know what moved.

   Deliberately short. Every column not listed here prints its own name, which
   is what an audit trail should do — this map exists for the drift the 2026-09
   renames introduced, not to prettify the schema. */
const FIELD_LABEL: Record<string, string> = {
  format: "series",
  experience_class: "setting",
  city_id: "city",
  venue_id: "venue",
  series_id: "edition",
};

/* One line for what a change touched. An update names the keys whose value
   moved; an insert and a delete have no keys to compare, so they say what
   they are. Compared as JSON so a nested value counts once, as one key. */
function diffLine(action: string, before: Json | null, after: Json | null): string {
  if (action === "INSERT") return "new row";
  if (action === "DELETE") return "struck";
  const b = (before && typeof before === "object" && !Array.isArray(before) ? before : {}) as Record<string, Json | undefined>;
  const a = (after && typeof after === "object" && !Array.isArray(after) ? after : {}) as Record<string, Json | undefined>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .map((k) => FIELD_LABEL[k] ?? k);
  if (keys.length === 0) return "no change";
  return keys.length > 6 ? `${keys.slice(0, 6).join(", ")} +${keys.length - 6}` : keys.join(", ");
}

/* The row's own name, when it has one — a title, a name, a label, a key —
   so the log reads "episodes · Night Sail" rather than a uuid. */
function rowName(before: Json | null, after: Json | null, rowId: string | null): string {
  const src = (after ?? before) as Record<string, Json | undefined> | null;
  if (src && typeof src === "object" && !Array.isArray(src)) {
    for (const k of ["title", "name", "label", "key", "slug"]) {
      const v = src[k];
      if (typeof v === "string" && v) return v;
    }
  }
  return rowId ? rowId.slice(0, 8) : "—";
}

type ErrorRow = {
  id: string;
  at: string;
  where: string;
  name: string;
  message: string;
  digest: string;
  [key: string]: unknown;
};

/* One pg_net response as scheduler_health hands it back. The drains answer
   207 when a row gave up and 503 when a key is missing; anything else in the
   500s is the function itself failing. */
type SchedulerRow = {
  id: string;
  created: string;
  statusCode: number | null;
  timedOut: boolean;
  errorMsg: string | null;
  body: string;
  [key: string]: unknown;
};

type SchedulerTone = { tone: "positive" | "caution" | "outline"; label: string; danger: boolean };

function schedulerTone(r: SchedulerRow): SchedulerTone {
  if (r.timedOut) return { tone: "caution", label: "Timed out", danger: true };
  const code = r.statusCode;
  if (code === null) return { tone: "caution", label: r.errorMsg ? "No answer" : "No status", danger: true };
  if (code === 207) return { tone: "caution", label: "207 · gave up on a row", danger: false };
  if (code >= 500) {
    return { tone: "caution", label: `${code} · key missing or failed`, danger: true };
  }
  if (code >= 400) return { tone: "caution", label: `${code} · refused`, danger: true };
  return { tone: "positive", label: String(code), danger: false };
}

/* The body is JSON from the drain; the first line of it is the excerpt. */
function excerpt(body: string | null, max = 140): string {
  if (!body) return "—";
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

type FillRow = {
  id: string;
  title: string;
  fill: string;
  perYacht: string;
  nm: string;
  knots: string;
  revenue: string;
  [key: string]: unknown;
};

/* Net house dollars — charges land negative in the ledger, credits positive,
   so revenue is the negated sum. Shown as positive net dollars. */
function netDollars(cents: number): string {
  const net = -cents;
  const abs = Math.abs(net);
  return `${net < 0 ? "−" : ""}$${(abs / 100).toFixed(abs % 100 ? 2 : 0)}`;
}

export default async function ReportsPage() {
  const { supabase } = await getOperator();

  const seasonStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const nowIso = new Date().toISOString();

  const [
    profilesRes,
    episodesRes,
    capacityRes,
    ledgerRes,
    rollRes,
    reconRes,
    planCreditRes,
    disputeRes,
    lapsedRes,
    knotsRes,
    weatherRes,
    outboxRes,
    flotillaRes,
    vesselsRes,
    berthRes,
    voyageLedgerRes,
    subsRes,
    plansRes,
    installmentsRes,
    transfersRes,
    compsRes,
    emailStrandedRes,
    smsStrandedRes,
    pushStrandedRes,
    changesRes,
    errorsRes,
    schedulerRes,
    cohortsRes,
    funnelRes,
    valueRes,
  ] = await Promise.all([
    supabase.from("profiles").select("status, joined_at"),
    supabase.from("episodes").select("id, title, distance_nm, kind, status, starts_at"),
    supabase.from("episode_capacity").select("*"),
    supabase
      .from("account_ledger")
      .select("delta_cents, created_at, service_date")
      .lt("delta_cents", 0)
      .gte("created_at", seasonStart),
    supabase.from("member_roll").select("invite_code"),
    /* Exceptions only, both directions — see the view. Empty is the answer an
       operator wants and the one they have never been able to get. */
    supabase.from("stripe_reconciliation").select("*").limit(50),
    /* Passes paid for with membership credit. The dues that bought the credit
       are already in Billed; counting the pass at full price on top counts the
       same money twice. The figure is kept and named rather than silently
       netted, because which one is the top line is an accounting position. */
    supabase
      .from("account_ledger")
      .select("delta_cents")
      .eq("kind", "plan_credit")
      .gte("created_at", seasonStart),
    /* Disputes. The webhook has recorded them since 2026-09-03 under their own
       ledger kind and nothing on the Bridge showed one — a chargeback the
       club never sees is money gone with a deadline attached. */
    supabase
      .from("account_ledger")
      .select("stripe_ref, delta_cents, memo, created_at")
      .eq("kind", "dispute")
      .order("created_at", { ascending: false })
      .limit(50),
    /* The people behind the churn number. Reports has counted churn since it
       shipped and never once said who. */
    supabase.from("lapsed_members").select("*").order("held_since", { ascending: true }).limit(50),
    supabase.from("knots_ledger").select("episode_id, delta").not("episode_id", "is", null),
    /* notifications is member-private and has no staff policy, so counting it
       directly returned the operator's own notices — 0 weather, while 14 had
       gone out. The definer returns the number and never the rows. */
    supabase.rpc("notice_count", { p_kind: "weather" }),
    /* Counted in the database: PostgREST caps a response at 1000, and these
       queues are past it, so counting fetched rows froze every figure. */
    supabase.rpc("delivery_health"),
    supabase.from("episode_vessels").select("episode_id, vessel_id, position"),
    supabase.from("vessels").select("id, capacity"),
    supabase
      .from("passes")
      .select("episode_id, vessel_id")
      .eq("status", "aboard")
      .not("vessel_id", "is", null),
    supabase
      .from("account_ledger")
      .select("episode_id, delta_cents")
      .not("episode_id", "is", null),
    supabase.from("subscriptions").select("status, interval, plan_id, updated_at"),
    supabase.from("membership_plans").select("id, price_cents, annual_price_cents"),
    supabase
      .from("installment_plans")
      .select("total_cents, down_payment_cents, installments, paid_count, status"),

    supabase.from("pass_transfers").select("status"),
    supabase.from("passes").select("id", { count: "exact", head: true }).eq("comp", true),
    /* A failed letter was a number and nothing else. `failed` is terminal — the
       drain reads only `pending` — so a row that gave up sat there with no
       address, no template and no reason on any screen, and the migration that
       added the retries said "nothing surfaced that". Nothing still did.

       All three channels now, failed AND skipped, each with a way back into
       the queue. Skipped email excludes the fixture hold-back: there are well
       over a thousand of those, correctly held, and they would bury the one
       real member's letter this list exists to show. */
    moduleTables(supabase)
      .from("email_outbox")
      .select("id, to_email, template, last_error, attempts, created_at, status")
      .in("status", ["failed", "skipped", "sending"])
      /* A null last_error must survive: `not ilike` on null is null, which
         excludes — and a row that gave up with no reason is the one to see. */
      .or("last_error.is.null,last_error.not.ilike.%fixture%")
      .order("created_at", { ascending: false })
      .limit(20),
    moduleTables(supabase)
      .from("sms_outbox")
      .select("id, to_phone, template, last_error, attempts, created_at, status")
      .in("status", ["failed", "skipped", "sending"])
      /* A null last_error must survive: `not ilike` on null is null, which
         excludes — and a row that gave up with no reason is the one to see. */
      .or("last_error.is.null,last_error.not.ilike.%fixture%")
      .order("created_at", { ascending: false })
      .limit(20),
    moduleTables(supabase)
      .from("push_outbox")
      .select("id, profile_id, title, last_error, attempts, created_at, status")
      .in("status", ["failed", "skipped", "sending"])
      .order("created_at", { ascending: false })
      .limit(20),
    /* The record of who did what — record_the_change() writes it on the
       tables the Bridge keeps; the Bridge reads it. */
    supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(50),
    /* What the app itself failed on — the error boundary and route handlers
       write app_errors; the Bridge reads the last fifty. */
    supabase.from("app_errors").select("*").order("at", { ascending: false }).limit(50),
    /* The last fifty answers the drains gave pg_net. A quiet 200 is the norm;
       207 and 503 are the two the drains use to say something is wrong. */
    supabase.rpc("scheduler_health", { p_limit: 50 }),
    /* Three views added 2026-09-04. Cohorts by the month joined; the
       application funnel by stage; and what each member has paid, from which
       the dues-per-member figures below are read. */
    supabase.from("membership_cohorts").select("*").order("cohort", { ascending: false }).limit(24),
    supabase.from("application_funnel").select("*"),
    supabase.from("member_value").select("profile_id, dues_cents, spend_cents"),
  ]);

  /* Cohorts. Lapsed is held for dues; the percentage is of the cohort. */
  const cohorts = must(cohortsRes)
    .filter((c) => c.cohort)
    .map((c) => {
      const joined = c.joined ?? 0;
      const lapsed = c.lapsed ?? 0;
      return {
        cohort: c.cohort as string,
        joined,
        activeNow: c.active_now ?? 0,
        lapsed,
        lapsedPct: joined ? Math.round((lapsed / joined) * 100) : 0,
        paused: c.paused ?? 0,
        departed: c.departed ?? 0,
      };
    });

  /* The funnel, in the order an application moves. */
  const FUNNEL_ORDER = ["received", "review", "invited", "aboard", "declined"];
  const FUNNEL_LABEL: Record<string, string> = {
    received: "Received",
    review: "In review",
    invited: "Invited ashore",
    aboard: "Aboard",
    declined: "Declined",
  };
  const funnelRows = must(funnelRes)
    .filter((f) => f.stage)
    .sort((a, b) => FUNNEL_ORDER.indexOf(a.stage as string) - FUNNEL_ORDER.indexOf(b.stage as string));
  const funnelTotal = funnelRows.reduce((n, f) => n + (f.applicants ?? 0), 0);

  /* Dues per member, from member_value: one row per member who has ever been
     charged. Mean is the sum over those members; the median is the middle
     member's figure. Neither is a lifetime value — it is what has been paid to
     date by people who have paid anything, and it is labelled as that. */
  const duesFigures = must(valueRes)
    .map((v) => v.dues_cents ?? 0)
    .sort((a, b) => a - b);
  const payers = duesFigures.filter((n) => n > 0);
  const meanDues = payers.length ? Math.round(payers.reduce((n, v) => n + v, 0) / payers.length) : 0;
  const medianDues = payers.length
    ? payers.length % 2
      ? payers[(payers.length - 1) / 2]
      : Math.round((payers[payers.length / 2 - 1] + payers[payers.length / 2]) / 2)
    : 0;
  const spendTotal = must(valueRes).reduce((n, v) => n + (v.spend_cents ?? 0), 0);
  const chargedMembers = duesFigures.length;

  /* Members */
  const profiles = must(profilesRes);
  const activeMembers = profiles.filter((p) => p.status === "active").length;
  const newThisSeason = profiles.filter((p) => p.joined_at >= seasonStart).length;

  /* Berth fill — past + live, non-cancelled */
  const episodes = must(episodesRes);
  const capacity = new Map(
    (must(capacityRes)).filter((c) => c.episode_id).map((c) => [c.episode_id as string, c])
  );
  const sailed = episodes.filter(
    (v) =>
      v.status !== "cancelled" &&
      (v.status === "completed" || v.status === "live" || v.starts_at <= nowIso)
  );
  const sailedAboard = sailed.reduce((t, v) => t + (capacity.get(v.id)?.aboard ?? 0), 0);
  const sailedBerths = sailed.reduce(
    (t, v) => t + (capacity.get(v.id)?.passes_total ?? 0),
    0
  );
  const fillPct = sailedBerths ? Math.round((sailedAboard / sailedBerths) * 100) : 0;

  /* House account — charge volume this season */
  /* BILLED and EARNED are two different questions and this report only ever
     asked the first. A season of fifty-two episodes is sold months ahead, so a
     pass sold in September for a March episode was September revenue — which
     made House revenue a cash-collected figure wearing a revenue label.

     service_date says when the club owes the thing. Anything dated ahead of
     today is money taken for a night that has not happened: a liability, not
     income. A row with no service_date is delivered on the spot — a bar tab, a
     shop order — and is earned when it is billed. */
  const ledgerRows = must(ledgerRes);
  const houseCents = ledgerRows.reduce((t, l) => t + Math.abs(l.delta_cents), 0);
  const todayISO = new Date().toISOString().slice(0, 10);
  const deferredCents = ledgerRows
    .filter((l) => l.service_date != null && l.service_date > todayISO)
    .reduce((t, l) => t + Math.abs(l.delta_cents), 0);
  const earnedCents = houseCents - deferredCents;
  /* Net of plan credit: what members paid cash for, once the pass a credit
     covered is not counted on top of the dues that bought the credit. */
  const planCreditCents = must(planCreditRes).reduce((t, l) => t + Math.max(0, l.delta_cents), 0);
  const netCents = Math.max(0, houseCents - planCreditCents);

  /* Referrals */
  const roll = must(rollRes);
  const recon = must(reconRes);
  /* Open disputes: the hold posted and no win posted back against the same
     payment. Net by intent — a dispute the club won nets to zero. */
  const disputes = must(disputeRes);
  const heldByIntent = new Map<string, number>();
  for (const d of disputes) {
    const k = d.stripe_ref ?? d.memo ?? "";
    heldByIntent.set(k, (heldByIntent.get(k) ?? 0) + d.delta_cents);
  }
  const openDisputes = [...heldByIntent.values()].filter((v) => v < 0);
  const heldCents = openDisputes.reduce((t, v) => t - v, 0);
  const lapsed = must(lapsedRes);
  const referred = roll.filter((r) => r.invite_code).length;
  const referralPct = roll.length ? Math.round((referred / roll.length) * 100) : 0;

  /* Knots paid per episode (the ledger table keeps its legacy name) */
  const knotsByEpisode = new Map<string, number>();
  for (const f of must(knotsRes)) {
    if (!f.episode_id || f.delta <= 0) continue;
    knotsByEpisode.set(f.episode_id, (knotsByEpisode.get(f.episode_id) ?? 0) + f.delta);
  }

  /* Per-yacht fill — flotilla episodes only. */
  const vesselCapacity = new Map((must(vesselsRes)).map((v) => [v.id, v.capacity]));
  const berthsByVessel = new Map<string, number>();
  for (const r of must(berthRes)) {
    const key = `${r.episode_id}:${r.vessel_id}`;
    berthsByVessel.set(key, (berthsByVessel.get(key) ?? 0) + 1);
  }
  const flotillaByEpisode = new Map<string, Array<{ vessel_id: string; position: number }>>();
  for (const vv of must(flotillaRes)) {
    const list = flotillaByEpisode.get(vv.episode_id) ?? [];
    list.push(vv);
    flotillaByEpisode.set(vv.episode_id, list);
  }
  const perYachtLine = (episodeId: string): string => {
    const list = (flotillaByEpisode.get(episodeId) ?? []).sort((a, b) => a.position - b.position);
    if (list.length === 0) return "—";
    return list
      .map(
        (vv) =>
          `${berthsByVessel.get(`${episodeId}:${vv.vessel_id}`) ?? 0}/${vesselCapacity.get(vv.vessel_id) ?? 0}`
      )
      .join(" · ");
  };

  /* Net revenue per episode — pass and deposit charges, add-ons, credits,
     and refunds all carry the episode_id; the sum is the net. */
  const revenueByEpisode = new Map<string, number>();
  for (const l of must(voyageLedgerRes)) {
    if (!l.episode_id) continue;
    revenueByEpisode.set(l.episode_id, (revenueByEpisode.get(l.episode_id) ?? 0) + l.delta_cents);
  }

  /* Holds */
  const holdsLive = episodes.filter((v) => v.status === "weather_hold").length;
  const weatherNotices = mustValue<number>(weatherRes as { data: number | null; error?: { message?: string } | null }, 0);

  /* Outbox health, counted in the database rather than in the first page of
     rows the API happened to return. */
  type Health = { channel: string; status: string; n: number };
  const health = mustValue<Health[]>(outboxRes as { data: Health[] | null; error?: { message?: string } | null }, []);
  const tally = (channel: string, status: string) =>
    Number(health.find((h) => h.channel === channel && h.status === status)?.n ?? 0);
  const outboxCount = (s: string) => tally("email", s);
  /* The raw template slug is an internal key, and one of them still carries a
     word the lexicon retired — printing it straight onto a staff screen put a
     dead brand back on a page and the e2e lexicon gate caught it, correctly.
     Staff get the letter's name; the slug stays in the database. */
  const letterName = (template: string): string => {
    const named: Record<string, string> = {
      "lore-digest": "Episodes, Sundays",
      "dispatch-digest": "Episodes, Sundays",
      "episode-digest": "Episodes, Sundays",
    };
    return named[template] ?? template.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  };
  const emailStranded = must<EmailStranded>(emailStrandedRes as { data: EmailStranded[] | null; error?: { message?: string } | null });
  const smsStranded = must<SmsStranded>(smsStrandedRes as { data: SmsStranded[] | null; error?: { message?: string } | null });
  const pushStranded = must<PushStranded>(pushStrandedRes as { data: PushStranded[] | null; error?: { message?: string } | null });
  const changes = must(changesRes);
  const appErrors = must(errorsRes);
  type SchedulerHealth = { id: number; status_code: number | null; timed_out: boolean | null; error_msg: string | null; created: string; body: string | null };
  const scheduler = mustValue<SchedulerHealth[]>(
    schedulerRes as { data: SchedulerHealth[] | null; error?: { message?: string } | null },
    []
  );

  const errorRows: ErrorRow[] = appErrors.map((e) => ({
    id: String(e.id),
    at: logDateTime(e.at, CLUB_ZONE),
    where: [e.method, e.route ?? e.path].filter(Boolean).join(" ") || "—",
    name: e.name ?? (e.kind ?? "Error"),
    message: e.message,
    digest: e.digest ?? "—",
  }));

  const schedulerRows: SchedulerRow[] = scheduler.map((r) => ({
    id: String(r.id),
    created: logDateTime(r.created, CLUB_ZONE),
    statusCode: r.status_code,
    timedOut: !!r.timed_out,
    errorMsg: r.error_msg,
    body: excerpt(r.body ?? r.error_msg),
  }));
  const schedulerTrouble = schedulerRows.filter((r) => schedulerTone(r).tone !== "positive").length;

  /* Names for the people on the pushes and in the log, one read. */
  const nameIds = [
    ...new Set([
      ...pushStranded.map((p) => p.profile_id),
      ...changes.map((c) => c.actor_id).filter((id): id is string => !!id),
    ]),
  ];
  const namesRes = nameIds.length
    ? await supabase.from("profiles").select("id, full_name, member_no").in("id", nameIds)
    : { data: [] };
  const nameOf = new Map(must(namesRes).map((p) => [p.id, p.full_name ?? p.member_no ?? "A member"]));

  const asState = (s: string): StrandedRow["status"] =>
    s === "failed" || s === "skipped" ? s : "sending";
  const stranded: StrandedRow[] = [
    ...emailStranded.map((r) => ({
      key: `email:${r.id}`,
      table: "email_outbox" as const,
      id: r.id,
      channel: "Email" as const,
      letter: letterName(r.template),
      recipient: r.to_email,
      status: asState(r.status),
      lastError: r.last_error,
      attempts: r.attempts ?? 0,
      queued: logDate(r.created_at, CLUB_ZONE),
      createdAt: r.created_at,
    })),
    ...smsStranded.map((r) => ({
      key: `sms:${r.id}`,
      table: "sms_outbox" as const,
      id: r.id,
      channel: "SMS" as const,
      letter: letterName(r.template),
      recipient: r.to_phone,
      status: asState(r.status),
      lastError: r.last_error,
      attempts: r.attempts ?? 0,
      queued: logDate(r.created_at, CLUB_ZONE),
      createdAt: r.created_at,
    })),
    ...pushStranded.map((r) => ({
      key: `push:${r.id}`,
      table: "push_outbox" as const,
      id: r.id,
      channel: "Push" as const,
      letter: r.title,
      recipient: nameOf.get(r.profile_id) ?? "A member",
      status: asState(r.status),
      lastError: r.last_error,
      attempts: r.attempts ?? 0,
      queued: logDate(r.created_at, CLUB_ZONE),
      createdAt: r.created_at,
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const changeRows: ChangeRow[] = changes.map((c) => ({
    id: String(c.id),
    table: c.table_name,
    action: c.action === "INSERT" ? "Added" : c.action === "DELETE" ? "Struck" : "Changed",
    what: rowName(c.before, c.after, c.row_id),
    who: c.actor_id ? (nameOf.get(c.actor_id) ?? "A member") : "The machine",
    at: logDateTime(c.at, CLUB_ZONE),
    diff: diffLine(c.action, c.before, c.after),
  }));

  /* Dues that recur — a year's plan carries one twelfth of itself each month,
     so the two intervals can sit in the same number. */
  const planPrice = new Map(
    (must(plansRes)).map((p) => [p.id, p])
  );
  const subs = must(subsRes);
  const mrrCents = subs
    .filter((sub) => sub.status === "active")
    .reduce((total, sub) => {
      const plan = sub.plan_id ? planPrice.get(sub.plan_id) : undefined;
      if (!plan) return total;
      if (sub.interval === "year") {
        const annual = plan.annual_price_cents ?? plan.price_cents * 12;
        return total + Math.round(annual / 12);
      }
      return total + plan.price_cents;
    }, 0);
  const duesPaying = subs.filter((sub) => sub.status === "active").length;
  const churned = subs.filter(
    (sub) => sub.status === "canceled" && sub.updated_at >= seasonStart
  ).length;
  const duesAtRisk = subs.filter((sub) => sub.status === "past_due").length;

  /* What is still to be drawn on the plans people are paying down. */
  const installments = (must(installmentsRes)).filter((p) => p.status === "active");
  /* The same slice draw_installments actually takes: the remainder is spread
     over installments - 1 draws, because the down payment is the first of the
     n. Dividing by n valued a draw at three quarters of what the cron charges,
     so the operator's exposure figure was wrong in the club's favour. */
  const exposureCents = installments.reduce((total, p) => {
    const slices = Math.max(1, p.installments - 1);
    const per = Math.ceil((p.total_cents - p.down_payment_cents) / slices);
    /* paid_count counts the down payment as one, so drawn slices are one fewer. */
    const drawn = p.down_payment_cents + per * Math.max(0, p.paid_count - 1);
    return total + Math.max(0, p.total_cents - drawn);
  }, 0);

  /* Delivery health — the three channels the cron drains. */
  const healthLine = (channel: string) =>
    `${tally(channel, "sent")} SENT · ${tally(channel, "skipped")} SKIPPED · ${tally(channel, "failed")} FAILED`;

  /* Passes that moved hands, and passes that cost nothing. */
  const transfers = must(transfersRes);
  const transfersAccepted = transfers.filter((t) => t.status === "accepted").length;
  const transfersOffered = transfers.filter((t) => t.status === "offered").length;
  const compedPasses = compsRes.count ?? 0;

  const fillRows: FillRow[] = episodes
    .filter((v) => v.status !== "cancelled")
    .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
    .map((v) => {
      const c = capacity.get(v.id);
      return {
        id: v.id,
        title: v.title,
        fill: `${c?.aboard ?? 0}/${c?.passes_total ?? 0}`,
        perYacht: perYachtLine(v.id),
        nm: v.distance_nm != null ? String(v.distance_nm) : "—",
        knots: (knotsByEpisode.get(v.id) ?? 0).toLocaleString("en-US"),
        revenue: netDollars(revenueByEpisode.get(v.id) ?? 0),
      };
    });

  return (
    <div>
      <span className="hm-eyebrow">Reports</span>
      <h1 className="hm-h1">The season, in numbers.</h1>

      {/* What needs reading, before what is merely true. Holds, past-due dues,
          failed letters and an unhappy scheduler were each a small Stat in the
          same weight as Complimentary passes, and the scheduler's trouble was a
          trailing clause in a paragraph six screens down. A season that is
          entirely well shows nothing here at all. */}
      {(() => {
        const failedLetters =
          outboxCount("failed") + tally("push", "failed") + tally("sms", "failed");
        const attention: Array<[string, number, string]> = [
          ["Weather holds live", holdsLive, "caution"],
          ["Dues past due", duesAtRisk, "danger"],
          ["Letters gave up", failedLetters, "danger"],
          ["Drains needing a read", schedulerTrouble, "caution"],
        ];
        const live = attention.filter(([, n]) => n > 0);
        if (live.length === 0) return null;
        return (
          <div className="hm-attention" role="status">
            <span className="hm-attention__label">Needs reading</span>
            <div className="hm-row">
              {live.map(([label, n, tone]) => (
                <Stat
                  key={label}
                  size="sm"
                  label={label}
                  value={<span style={{ color: `var(--${tone})` }}>{n}</span>}
                />
              ))}
            </div>
          </div>
        );
      })()}

      <div className="hm-row">
        <Stat
          label="Members"
          value={activeMembers}
          sub={`+${newThisSeason} THIS SEASON`}
        />
        <Stat
          label="Pass fill"
          value={`${fillPct}%`}
          sub={`${sailed.length} EPISODES SAILED OR LIVE`}
        />
        <Stat
          label="Earned"
          value={earnedCents ? price(earnedCents) : "$0"}
          sub="NIGHTS ALREADY RUN"
        />
        <Stat
          label="Deferred"
          value={deferredCents ? price(deferredCents) : "$0"}
          sub="TAKEN FOR NIGHTS AHEAD"
        />
        <Stat
          label="Billed"
          value={houseCents ? price(houseCents) : "$0"}
          sub="CHARGES THIS SEASON · GROSS OF CREDIT"
        />
        <Stat
          label="Net of credit"
          value={netCents ? price(netCents) : "$0"}
          sub={`${price(planCreditCents)} OF PASSES PAID BY PLAN CREDIT`}
        />
        <Stat
          label="Referral joins"
          value={`${referralPct}%`}
          sub={`${referred} OF ${roll.length} ON THE ROLL`}
        />
      </div>

      {/* The churn number, as people. Reports has counted churn since it
          shipped and never said who — and a lapse is the recoverable kind:
          nobody chose it, a card did. */}
      <section className="hm-sec">
        <span className="hm-eyebrow">Held for dues</span>
        {lapsed.length === 0 ? (
          <p className="hm-note">Nobody is held for dues. Every membership is either running or was ended on purpose.</p>
        ) : (
          <div className="hm-recon">
            {lapsed.map((m) => (
              <div key={m.profile_id} className="hm-recon__row">
                <Badge tone={(m.days_held ?? 0) > 90 ? "outline" : "caution"}>
                  {m.days_held}d
                </Badge>
                <span>{m.full_name ?? "A member"}</span>
                <span className="hm-mono">{m.plan_label ?? "—"}</span>
                {m.written_to ? (
                  <span className="hm-mono">WRITTEN TO</span>
                ) : (
                  <span className="hm-mono hm-recon__due">NOT YET WRITTEN</span>
                )}
                <span className="hm-mono hm-recon__amt">
                  {m.was_paying_cents ? price(m.was_paying_cents) + "/MO" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reconciliation. stripe_events has been write-only since it shipped —
          the webhook inserts a row so delivery is idempotent and nothing ever
          reads it back — so nobody could answer whether every Stripe event
          reached the ledger, or whether every ledger row claiming a Stripe
          object actually has one. Exceptions only; silence is the good answer
          and is stated rather than left blank. */}
      <section className="hm-sec">
        <span className="hm-eyebrow">Stripe against the book</span>
        {recon.length === 0 ? (
          <p className="hm-note">
            Nothing unmatched. Every Stripe event that moves money has a ledger
            row, and every row naming a Stripe object has an event behind it.
          </p>
        ) : (
          <div className="hm-recon">
            {recon.map((r) => (
              <div key={`${r.issue}-${r.stripe_id}`} className="hm-recon__row">
                <Badge tone={r.issue === "unmatched" ? "danger" : "caution"}>
                  {r.issue === "unmatched" ? "No event" : "Not posted"}
                </Badge>
                <span className="hm-mono">{r.stripe_id}</span>
                <span>{r.detail}</span>
                <span className="hm-mono hm-recon__amt">
                  {r.delta_cents != null ? price(Math.abs(r.delta_cents)) : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Disputes, as a list, because each one is a deadline. */}
      <section className="hm-sec">
        <span className="hm-eyebrow">Disputed by the bank</span>
        {disputes.length === 0 ? (
          <p className="hm-note">No charge has been disputed. When one is, it is listed here the minute Stripe says so.</p>
        ) : (
          <>
            <p className="hm-note">
              {openDisputes.length === 0
                ? "Every dispute on record has closed in the club’s favour."
                : `${openDisputes.length} open · ${price(heldCents)} held by the bank. Evidence is answered in Stripe.`}
            </p>
            <div className="hm-recon">
              {disputes.map((d) => (
                <div key={`${d.stripe_ref}-${d.created_at}`} className="hm-recon__row">
                  <Badge tone={d.delta_cents < 0 ? "danger" : "positive"}>
                    {d.delta_cents < 0 ? "Held" : "Returned"}
                  </Badge>
                  <span className="hm-mono">{d.stripe_ref ?? "—"}</span>
                  <span>{d.memo ?? ""}</span>
                  <span className="hm-mono hm-recon__amt">{price(Math.abs(d.delta_cents))}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="hm-row">
        <Stat
          size="sm"
          label="Holds"
          value={holdsLive}
          sub={`${weatherNotices} WEATHER NOTICES SENT`}
        />
        <Stat
          size="sm"
          label="Passes moved"
          value={transfersAccepted}
          sub={`${transfersOffered} OFFERED AND WAITING`}
        />
        <Stat size="sm" label="Complimentary passes" value={compedPasses} sub="COMPED, ALL SEASONS" />
      </div>

      <section className="hm-sec">
        <h2>Dues, and what is still owed.</h2>
        <p className="hm-note">
          Annual plans count as a twelfth a month, so both intervals sit in one number.
        </p>
        <div className="hm-row">
          <Stat
            label="Dues each month"
            value={mrrCents ? price(mrrCents) : "$0"}
            sub={`${duesPaying} PAYING · ${duesAtRisk} PAST DUE`}
          />
          <Stat label="Left this season" value={churned} sub="DUES ENDED SINCE JANUARY" />
          <Stat
            label="Still to draw"
            value={exposureCents ? price(exposureCents) : "$0"}
            sub={`${installments.length} PLANS RUNNING`}
          />
        </div>
      </section>

      <section className="hm-sec">
        <h2>Dues per member, to date.</h2>
        <p className="hm-note">
          What members who have paid any dues have paid so far — not a lifetime figure, since most
          of them are still paying. Median is the middle member; mean is the sum over paying
          members. Spend is passes, deposits, add-ons, galley and shop, across every charged member.
        </p>
        <div className="hm-row">
          <Stat label="Median dues paid" value={medianDues ? price(medianDues) : "$0"} sub={`PER PAYING MEMBER · ${payers.length} HAVE PAID DUES`} />
          <Stat label="Mean dues paid" value={meanDues ? price(meanDues) : "$0"} sub="PER PAYING MEMBER · TO DATE" />
          <Stat label="Spend beyond dues" value={spendTotal ? price(spendTotal) : "$0"} sub={`ACROSS ${chargedMembers} CHARGED MEMBERS`} />
        </div>
      </section>

      <section className="hm-sec">
        <h2>Cohorts.</h2>
        <p className="hm-note">
          Members by the month they joined, and where each month stands now. Lapsed is held for dues
          — the recoverable kind — as a share of the cohort.
        </p>
        {cohorts.length === 0 ? (
          <p className="hm-empty">Nobody on the roll yet.</p>
        ) : (
          <div className="hm-panel">
            <Table
              rowKey={(r: (typeof cohorts)[number]) => r.cohort}
              minWidth={560}
              columns={[
                { key: "cohort", label: "Joined", mono: true, width: 120, render: (r) => r.cohort.slice(0, 7) },
                { key: "joined", label: "Joined", mono: true, align: "end", width: 90 },
                { key: "activeNow", label: "Active now", mono: true, align: "end", width: 110 },
                {
                  key: "lapsedPct",
                  label: "Lapsed",
                  mono: true,
                  align: "end",
                  width: 120,
                  render: (r) => (
                    <span className={r.lapsedPct >= 25 ? "hm-recon__due" : undefined}>
                      {r.lapsed} · {r.lapsedPct}%
                    </span>
                  ),
                },
                { key: "paused", label: "Paused", mono: true, align: "end", width: 90 },
                { key: "departed", label: "Departed", mono: true, align: "end", width: 100 },
              ]}
              rows={cohorts}
            />
          </div>
        )}
      </section>

      <section className="hm-sec">
        <h2>The application funnel.</h2>
        <p className="hm-note">
          Every application ever filed, by the stage it stands at, with this year&apos;s beside it.
          A stage is where an application IS, so the rows sum to the whole and not to a flow.
        </p>
        {funnelRows.length === 0 ? (
          <p className="hm-empty">No applications on file.</p>
        ) : (
          <div className="hm-funnel">
            {funnelRows.map((f) => {
              const n = f.applicants ?? 0;
              const pct = funnelTotal ? Math.round((n / funnelTotal) * 100) : 0;
              return (
                <div className="hm-funnel__row" key={f.stage}>
                  <span className="hm-funnel__stage">{FUNNEL_LABEL[f.stage as string] ?? f.stage}</span>
                  <span className="hm-funnel__bar" aria-hidden="true">
                    <span className="hm-funnel__fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="hm-mono hm-funnel__n">
                    {n} · {pct}% · {f.this_year ?? 0} THIS YEAR
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="hm-sec">
        <h2>What got through.</h2>
        <p className="hm-note">
          Three channels, all drained on a schedule. Pending is the queue; failed and skipped are
          the ones to read — Requeue puts a row back in the water for the next drain.
        </p>
        {stranded.length > 0 ? <OutboxTable rows={stranded} /> : null}
        <div className="hm-row">
          <Stat
            size="sm"
            label="Email"
            value={outboxCount("pending")}
            /* "Skipped" was one number covering two unrelated things: a fixture
               address the guard correctly held back, and a real member's letter
               skipped for a reason nobody chose. There are well over a thousand
               of the first, so the number could only ever be ignored — and a
               real member's suppressed letter would sit in the middle of it,
               invisible. Held-back fixtures are shown last and quietly. */
            sub={
              `PENDING · ${outboxCount("sent")} SENT · ${outboxCount("failed")} FAILED` +
              (outboxCount("skipped_real") > 0 ? ` · ${outboxCount("skipped_real")} SKIPPED` : "") +
              ` · ${outboxCount("held_back_fixture")} HELD (FIXTURES)`
            }
          />
          <Stat
            size="sm"
            label="Push"
            value={tally("push", "pending")}
            sub={`PENDING · ${healthLine("push")}`}
          />
          <Stat
            size="sm"
            label="SMS"
            value={tally("sms", "pending")}
            sub={`PENDING · ${healthLine("sms")}`}
          />
        </div>
      </section>

      <section className="hm-sec">
        <h2>Episode by episode.</h2>
        <div className="hm-panel">
          <Table
            rowKey={(r: FillRow) => r.id}
            columns={[
              { key: "title", label: "Episode" },
              { key: "fill", label: "Fill", mono: true, width: 90 },
              { key: "perYacht", label: "Per yacht", mono: true, width: 140 },
              { key: "nm", label: "NM", mono: true, width: 70 },
              { key: "knots", label: "Knots paid", mono: true, width: 110 },
              { key: "revenue", label: "Revenue", mono: true, width: 100 },
            ]}
            rows={fillRows}
          />
          {fillRows.length === 0 ? (
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
              No episodes on the books yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="hm-sec">
        <h2>Recent changes.</h2>
        <p className="hm-note">
          The last fifty writes to the tables the Bridge keeps — who, what, when, and which
          fields moved. The machine is a cron or a definer acting on its own.
        </p>
        <div className="hm-panel">
          <Table
            rowKey={(r: ChangeRow) => r.id}
            columns={[
              { key: "at", label: "When", mono: true, width: 140 },
              { key: "who", label: "Who", width: 160 },
              { key: "action", label: "Did", width: 90 },
              { key: "table", label: "Table", mono: true, width: 150 },
              { key: "what", label: "Row" },
              { key: "diff", label: "Fields moved", mono: true },
            ]}
            rows={changeRows}
          />
          {changeRows.length === 0 ? (
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
              Nothing recorded yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="hm-sec">
        <h2>Errors.</h2>
        <p className="hm-note">
          The last fifty times the app failed on somebody — when, on which route, and
          what it said. The digest is the code Next prints on the member&apos;s screen,
          so a member quoting one can be matched to the line here.
        </p>
        <div className="hm-panel">
          <Table
            rowKey={(r: ErrorRow) => r.id}
            columns={[
              { key: "at", label: "When", mono: true, width: 140 },
              { key: "where", label: "Route", mono: true, width: 220 },
              { key: "name", label: "Name", width: 140 },
              { key: "message", label: "Message" },
              { key: "digest", label: "Digest", mono: true, width: 120 },
            ]}
            rows={errorRows}
          />
          {errorRows.length === 0 ? (
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
              Nothing has failed that the app knows of.
            </p>
          ) : null}
        </div>
      </section>

      <section className="hm-sec">
        <h2>Scheduler.</h2>
        <p className="hm-note">
          The last fifty answers the drains gave the scheduler. A quiet 200 is the norm.
          207 means a drain gave up on one row — it is in the outbox list above with a
          Requeue. A 503 means a key is missing from the vault, and nothing sends until
          it is put back.
          {schedulerTrouble > 0 ? ` ${schedulerTrouble} of these ${schedulerTrouble === 1 ? "needs" : "need"} reading.` : ""}
        </p>
        <div className="hm-panel">
          <Table
            rowKey={(r: SchedulerRow) => r.id}
            columns={[
              { key: "created", label: "When", mono: true, width: 140 },
              {
                key: "statusCode",
                label: "Answer",
                width: 220,
                render: (r: SchedulerRow) => {
                  const t = schedulerTone(r);
                  return (
                    <Badge
                      tone={t.tone}
                      /* The badge set has no danger tone; a failed drain wears
                         the danger colour on the caution frame. */
                      style={t.danger ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}
                    >
                      {t.label}
                    </Badge>
                  );
                },
              },
              {
                key: "body",
                label: "What it said",
                mono: true,
                render: (r: SchedulerRow) => (
                  <span title={r.errorMsg ?? undefined}>{r.body}</span>
                ),
              },
            ]}
            rows={schedulerRows}
          />
          {schedulerRows.length === 0 ? (
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
              The scheduler has not answered yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
