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

/* One line for what a change touched. An update names the keys whose value
   moved; an insert and a delete have no keys to compare, so they say what
   they are. Compared as JSON so a nested value counts once, as one key. */
function diffLine(action: string, before: Json | null, after: Json | null): string {
  if (action === "INSERT") return "new row";
  if (action === "DELETE") return "struck";
  const b = (before && typeof before === "object" && !Array.isArray(before) ? before : {}) as Record<string, Json | undefined>;
  const a = (after && typeof after === "object" && !Array.isArray(after) ? after : {}) as Record<string, Json | undefined>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
    (k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null)
  );
  if (keys.length === 0) return "no change";
  return keys.length > 6 ? `${keys.slice(0, 6).join(", ")} +${keys.length - 6}` : keys.join(", ");
}

/* The row's own name, when it has one — a title, a name, a label, a key —
   so the log reads "voyages · Night Sail" rather than a uuid. */
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
    voyagesRes,
    capacityRes,
    ledgerRes,
    rollRes,
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
  ] = await Promise.all([
    supabase.from("profiles").select("status, joined_at"),
    supabase.from("voyages").select("id, title, distance_nm, kind, status, starts_at"),
    supabase.from("voyage_capacity").select("*"),
    supabase
      .from("account_ledger")
      .select("delta_cents, created_at")
      .lt("delta_cents", 0)
      .gte("created_at", seasonStart),
    supabase.from("member_roll").select("invite_code"),
    supabase.from("fathoms_ledger").select("voyage_id, delta").not("voyage_id", "is", null),
    /* notifications is member-private and has no staff policy, so counting it
       directly returned the operator's own notices — 0 weather, while 14 had
       gone out. The definer returns the number and never the rows. */
    supabase.rpc("notice_count", { p_kind: "weather" }),
    /* Counted in the database: PostgREST caps a response at 1000, and these
       queues are past it, so counting fetched rows froze every figure. */
    supabase.rpc("delivery_health"),
    supabase.from("voyage_vessels").select("voyage_id, vessel_id, position"),
    supabase.from("vessels").select("id, capacity"),
    supabase
      .from("rsvps")
      .select("voyage_id, vessel_id")
      .eq("status", "aboard")
      .not("vessel_id", "is", null),
    supabase
      .from("account_ledger")
      .select("voyage_id, delta_cents")
      .not("voyage_id", "is", null),
    supabase.from("subscriptions").select("status, interval, plan_id, updated_at"),
    supabase.from("membership_plans").select("id, price_cents, annual_price_cents"),
    supabase
      .from("installment_plans")
      .select("total_cents, down_payment_cents, installments, paid_count, status"),

    supabase.from("pass_transfers").select("status"),
    supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("comp", true),
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
  ]);

  /* Members */
  const profiles = must(profilesRes);
  const activeMembers = profiles.filter((p) => p.status === "active").length;
  const newThisSeason = profiles.filter((p) => p.joined_at >= seasonStart).length;

  /* Berth fill — past + live, non-cancelled */
  const voyages = must(voyagesRes);
  const capacity = new Map(
    (must(capacityRes)).filter((c) => c.voyage_id).map((c) => [c.voyage_id as string, c])
  );
  const sailed = voyages.filter(
    (v) =>
      v.status !== "cancelled" &&
      (v.status === "completed" || v.status === "live" || v.starts_at <= nowIso)
  );
  const sailedAboard = sailed.reduce((t, v) => t + (capacity.get(v.id)?.aboard ?? 0), 0);
  const sailedBerths = sailed.reduce(
    (t, v) => t + (capacity.get(v.id)?.berths_total ?? 0),
    0
  );
  const fillPct = sailedBerths ? Math.round((sailedAboard / sailedBerths) * 100) : 0;

  /* House account — charge volume this season */
  const houseCents = (must(ledgerRes)).reduce((t, l) => t + Math.abs(l.delta_cents), 0);

  /* Referrals */
  const roll = must(rollRes);
  const referred = roll.filter((r) => r.invite_code).length;
  const referralPct = roll.length ? Math.round((referred / roll.length) * 100) : 0;

  /* Knots paid per voyage (the ledger table keeps its legacy name) */
  const knotsByVoyage = new Map<string, number>();
  for (const f of must(knotsRes)) {
    if (!f.voyage_id || f.delta <= 0) continue;
    knotsByVoyage.set(f.voyage_id, (knotsByVoyage.get(f.voyage_id) ?? 0) + f.delta);
  }

  /* Per-yacht fill — flotilla voyages only. */
  const vesselCapacity = new Map((must(vesselsRes)).map((v) => [v.id, v.capacity]));
  const berthsByVessel = new Map<string, number>();
  for (const r of must(berthRes)) {
    const key = `${r.voyage_id}:${r.vessel_id}`;
    berthsByVessel.set(key, (berthsByVessel.get(key) ?? 0) + 1);
  }
  const flotillaByVoyage = new Map<string, Array<{ vessel_id: string; position: number }>>();
  for (const vv of must(flotillaRes)) {
    const list = flotillaByVoyage.get(vv.voyage_id) ?? [];
    list.push(vv);
    flotillaByVoyage.set(vv.voyage_id, list);
  }
  const perYachtLine = (voyageId: string): string => {
    const list = (flotillaByVoyage.get(voyageId) ?? []).sort((a, b) => a.position - b.position);
    if (list.length === 0) return "—";
    return list
      .map(
        (vv) =>
          `${berthsByVessel.get(`${voyageId}:${vv.vessel_id}`) ?? 0}/${vesselCapacity.get(vv.vessel_id) ?? 0}`
      )
      .join(" · ");
  };

  /* Net revenue per voyage — pass and deposit charges, add-ons, credits,
     and refunds all carry the voyage_id; the sum is the net. */
  const revenueByVoyage = new Map<string, number>();
  for (const l of must(voyageLedgerRes)) {
    if (!l.voyage_id) continue;
    revenueByVoyage.set(l.voyage_id, (revenueByVoyage.get(l.voyage_id) ?? 0) + l.delta_cents);
  }

  /* Holds */
  const holdsLive = voyages.filter((v) => v.status === "weather_hold").length;
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

  const fillRows: FillRow[] = voyages
    .filter((v) => v.status !== "cancelled")
    .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
    .map((v) => {
      const c = capacity.get(v.id);
      return {
        id: v.id,
        title: v.title,
        fill: `${c?.aboard ?? 0}/${c?.berths_total ?? 0}`,
        perYacht: perYachtLine(v.id),
        nm: v.distance_nm != null ? String(v.distance_nm) : "—",
        knots: (knotsByVoyage.get(v.id) ?? 0).toLocaleString("en-US"),
        revenue: netDollars(revenueByVoyage.get(v.id) ?? 0),
      };
    });

  return (
    <div>
      <span className="hm-eyebrow">Reports</span>
      <h1 className="hm-h1">The season, in numbers.</h1>

      <div className="hm-row">
        <Stat
          label="Members"
          value={activeMembers}
          sub={`+${newThisSeason} THIS SEASON`}
        />
        <Stat
          label="Pass fill"
          value={`${fillPct}%`}
          sub={`${sailed.length} VOYAGES SAILED OR LIVE`}
        />
        <Stat
          label="House revenue"
          value={houseCents ? price(houseCents) : "$0"}
          sub="CHARGES THIS SEASON"
        />
        <Stat
          label="Referral joins"
          value={`${referralPct}%`}
          sub={`${referred} OF ${roll.length} ON THE ROLL`}
        />
      </div>

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
        <h2>Voyage by voyage.</h2>
        <div className="hm-panel">
          <Table
            rowKey={(r: FillRow) => r.id}
            columns={[
              { key: "title", label: "Voyage" },
              { key: "fill", label: "Fill", mono: true, width: 90 },
              { key: "perYacht", label: "Per yacht", mono: true, width: 140 },
              { key: "nm", label: "NM", mono: true, width: 70 },
              { key: "knots", label: "Knots paid", mono: true, width: 110 },
              { key: "revenue", label: "Revenue", mono: true, width: 100 },
            ]}
            rows={fillRows}
          />
          {fillRows.length === 0 ? (
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: 13 }}>
              No voyages on the books yet.
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
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: 13 }}>
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
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: 13 }}>
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
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: 13 }}>
              The scheduler has not answered yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
