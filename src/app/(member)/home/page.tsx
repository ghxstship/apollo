import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Badge, Card, Icon, Stat, StateBlock } from "@/components/ds";
import { CURRENCY, knots, LOGBOOK, PLACE, SURFACES } from "@/lib/brand";
import { logDate, logMeta, price } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { firstName, getMember } from "../data";
import { NoticeLink } from "../inbox/notice-link";
import { KIND_ICON, noticeHref, relTime } from "../relative";

/* Title, nav label and h1 all read the one name from the lexicon. */
export const metadata: Metadata = { title: SURFACES.homePort };

/* How many underway episodes the strip will name. */
const LIVE_LIMIT = 12;

/* The destinations that left the top bar when it was trimmed to a dozen. Each
   is still a page with its own name; this is where a member finds it. Portal,
   Standing and Agreements are not here because they folded into You. */
const ALSO_ABOARD: Array<[string, string, string, string]> = [
  ["/open-deck", "MessageCircle", SURFACES.openDeck, "MEMBERS ONLY · MIND THE CODE"],
  ["/directory", "Users", "Directory", `THE ROSTER · BY ${PLACE.market.toUpperCase()} AND LEAGUE`],
  ["/card", "IdCard", SURFACES.passbook, "SCAN AT THE GANGWAY"],
  ["/itinerary", "Map", "Itinerary", "THE ITINERARY · THE CABIN CARD · THE PORT GUIDE"],
  ["/tonight", "Armchair", "Tonight", "BLIND TABLES FOR SIX"],
  ["/matches", "Heart", "Matches", "A SHARED TABLE · A NAME SAID BACK"],
  ["/vetting", "ShieldCheck", "Vetting", "YOUR FILE · THE PREFERENCE SHEET · THE GATE"],
  ["/regattas", "Trophy", LOGBOOK.regattas, "REGATTAS AND CHALLENGES · BOTH CLOSE ON A DATE"],
  ["/account", "Receipt", "Account", "DUES · RECEIPTS · THE CARD"],
];

/* The city line reads a table. It waits behind its own boundary so the name
   and the greeting paint first. */
async function CityLine() {
  const { supabase, profile } = await getMember();
  const { data: city } = profile?.home_city
    ? await supabase.from("cities").select("name,coordinates").eq("id", profile.home_city).maybeSingle()
    : { data: null };
  return (
    <div className="mbr-mono" style={{ marginTop: 8 }}>
      {/* The club's own city is not the member's. Every fixture with a
          null home_city was being told theirs was Marina del Rey. The
          column keeps its name; the label reads the lexicon. */}
      {city?.name ? city.name.toUpperCase() : `NO HOME ${PLACE.market.toUpperCase()} YET`}
      {city?.coordinates ? ` · ${city.coordinates}` : ""}
    </div>
  );
}

/* The first week, as four facts. Shown to a member holding no pass at all, and
   only then; each line is read from the record — the signature, the sheet,
   the push row, the pass — and the card is gone the moment all four are true.
   There is no dismiss: a checklist a member can close is a checklist nobody
   finishes. */
type FirstWeekItem = { label: string; line: string; href: string; done: boolean };

function FirstWeek({ items }: { items: FirstWeekItem[] }) {
  const done = items.filter((i) => i.done).length;
  return (
    <section className="mbr-sec ls-rise-1">
      <div className="hbr-first">
        <div className="hbr-first__head">
          <span className="mbr-eyebrow">Your first week</span>
          <span className="mbr-mono">
            {done} OF {items.length} DONE
          </span>
        </div>
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={"hbr-first__row" + (it.done ? " hbr-first__row--done" : "")}
            aria-label={`${it.label} — ${it.done ? "done" : "to do"}`}
          >
            <span className="hbr-first__ic">
              <Icon name={it.done ? "CircleCheck" : "Circle"} size={18} />
            </span>
            <span>
              <b>{it.label}</b>
              <span className="hbr-first__line">{it.line}</span>
            </span>
            <span className="hbr-first__state">{it.done ? "DONE" : "OPEN"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

async function HomeBody() {
  const { supabase, user, profile, zone } = await getMember();
  const nowIso = new Date().toISOString();
  const db = moduleTables(supabase);

  const [passesRes, liveRes, balanceRes, wordRes, planRes, usageRes, creditRes, anyPassRes] =
    await Promise.all([
      supabase.from("passes").select("episode_id").eq("profile_id", user.id).eq("status", "aboard"),
      supabase.from("episodes").select("id,title").eq("status", "live").limit(LIVE_LIMIT),
      supabase.from("knots_balance").select("balance").eq("profile_id", user.id).maybeSingle(),
      supabase
        .from("notifications")
        .select("id,kind,title,body,read,created_at,href")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(2),
      profile?.plan_id
        ? supabase.from("membership_plans").select("events_per_month,monthly_credit_cents").eq("id", profile.plan_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("member_pass_usage").select("month,passes_used").eq("profile_id", user.id),
      supabase.rpc("pass_credit_left", {}),
      /* Any pass at all, any standing — the first-week card's whole condition. */
      supabase.from("passes").select("id", { count: "exact", head: true }).eq("profile_id", user.id),
    ]);

  /* The next pass is the soonest upcoming episode this member is aboard —
     asked for by id, rather than reading every upcoming episode in the club
     and searching it for one of theirs. */
  const aboardIds = (passesRes.data ?? []).map((r) => r.episode_id);
  const nextBerthRes = aboardIds.length
    ? await supabase
        .from("episodes")
        .select("id,title,media,blurb,starts_at,distance_nm,time_zone")
        .in("id", aboardIds)
        .gte("starts_at", nowIso)
        .in("status", ["scheduled", "live", "weather_hold"])
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  /* The four facts, read only for a member with no pass — the card is not
     shown to anyone else, so nobody else pays for the reads. */
  const noPasses = (anyPassRes.count ?? 0) === 0;
  let firstWeek: FirstWeekItem[] | null = null;
  if (noPasses) {
    const [waiverRes, sheetRes, pushRes] = await Promise.all([
      supabase.from("member_waiver_standing").select("current").eq("profile_id", user.id).maybeSingle(),
      db.from("preference_sheets").select("completed_at").eq("profile_id", user.id).maybeSingle(),
      supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("profile_id", user.id),
    ]);
    const sheet = (sheetRes.data ?? null) as { completed_at: string | null } | null;
    firstWeek = [
      {
        label: "Sign the waiver",
        line: "Needed before you board. Kept with the exact wording you agreed to.",
        href: "/you#you-agreements",
        done: waiverRes.data?.current === true,
      },
      {
        label: "Finish the Preference Sheet",
        line: "What you drink, what you will not do on camera, who you sit near.",
        href: "/vetting",
        done: !!sheet?.completed_at,
      },
      {
        label: "Turn on push",
        line: "Weather holds and pass releases reach this device the moment they are called.",
        href: "/you#you-word",
        done: (pushRes.count ?? 0) > 0,
      },
      {
        label: "Book a first night",
        line: "Every episode ahead, and the pass on each one.",
        href: "/passes",
        done: false,
      },
    ];
    if (firstWeek.every((i) => i.done)) firstWeek = null;
  }

  const nextBerth = nextBerthRes.data ?? null;
  const live = liveRes.data ?? [];
  const balance = balanceRes.data?.balance ?? 0;
  const word = wordRes.data ?? [];

  const nowMs = Date.parse(nowIso);
  const daysOut = nextBerth
    ? Math.max(0, Math.ceil((Date.parse(nextBerth.starts_at) - nowMs) / 86400000))
    : 0;

  /* Pass meter — this calendar month's usage against the plan allowance. */
  const now = new Date(nowIso);
  const allowance = planRes.data?.events_per_month ?? 0;
  const passesUsed =
    (usageRes.data ?? []).find((u) => {
      if (!u.month) return false;
      const m = new Date(u.month);
      return m.getUTCFullYear() === now.getUTCFullYear() && m.getUTCMonth() === now.getUTCMonth();
    })?.passes_used ?? 0;
  /* Model C plans carry a credit, not a count; the count stays for any plan
     that still meters that way. */
  const creditCents = planRes.data?.monthly_credit_cents ?? 0;
  const creditLeft = typeof creditRes.data === "number" ? creditRes.data : 0;
  const monthName = now.toLocaleString("en-US", { month: "long" }).toUpperCase();
  const passLine =
    creditCents > 0
      ? `${creditLeft > 0 ? price(creditLeft) : "$0"} OF ${price(creditCents)} CREDIT LEFT · ${monthName}`
      : allowance > 0
        ? `${passesUsed} OF ${allowance} PASSES USED · ${monthName}`
        : null;

  return (
    <>
      {firstWeek ? <FirstWeek items={firstWeek} /> : null}

      <section className="mbr-sec ls-rise-1">
        {nextBerth ? (
          <Card
            tone="sea"
            media={nextBerth.media}
            eyebrow={`Your next pass · T-${daysOut} ${daysOut === 1 ? "day" : "days"}`}
            title={nextBerth.title}
            meta={[
              ...logMeta(nextBerth.starts_at, nextBerth.distance_nm, nextBerth.time_zone),
              ...(passLine ? [passLine] : []),
            ]}
            footer={
              <>
                <Badge tone="positive">Aboard</Badge>
                <Link
                  href="/passes"
                  className="ls-btn ls-btn--ghost ls-btn--sm ls-btn--inverse"
                >
                  Passes <Icon name="ArrowUpRight" size={14} />
                </Link>
              </>
            }
          >
            {nextBerth.blurb}
          </Card>
        ) : (
          <StateBlock
            status="empty"
            icon="Sailboat"
            title="No passes held."
            detail="The season is open. Passes are few by design."
            action={
              /* The destination's NAME, as the nav sets it — /passes was
                 reached under three different labels across two pages. */
              <Link href="/passes" className="ls-btn ls-btn--outline ls-btn--sm">
                Passes
              </Link>
            }
          />
        )}
      </section>

      {live.length > 0 ? (
        <section className="mbr-sec ls-rise-2">
          <span className="mbr-eyebrow">Underway now</span>
          <div className="hbr-live">
            {live.map((v) => (
              <Link key={v.id} href="/live" className="mbr-plain">
                <div className="hbr-live__row">
                  <span className="ls-live mbr-mono" style={{ color: "var(--neon-cyan)" }}>
                    LIVE
                  </span>
                  <b>{v.title}</b>
                  <Icon name="ArrowUpRight" size={16} style={{ color: "var(--text-3)" }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mbr-sec ls-rise-2">
        <div className="ls-grid-2">
          <div style={{ border: "1px solid var(--line-faint)", background: "var(--surface-card)", padding: 24 }}>
            <Stat label={CURRENCY.name} value={knots(balance)} sub="MORE KNOTS, FARTHER WATER" />
            <Link href="/you#you-knots" className="mbr-mono" style={{ display: "inline-block", marginTop: 12 }}>
              THE LEDGER AND WHAT KNOTS BUY →
            </Link>
          </div>
          <div className="hbr-links" style={{ gridTemplateColumns: "1fr" }}>
            {ALSO_ABOARD.slice(0, 3).map(([href, icon, label, line]) => (
              <Link key={href} href={href} className="hbr-link">
                <Icon name={icon} size={18} style={{ color: "var(--text-2)" }} />
                <div>
                  <b>{label}</b>
                  <span>{line}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mbr-sec ls-rise-3">
        <span className="mbr-eyebrow">Also aboard</span>
        <div className="hbr-links">
          {ALSO_ABOARD.slice(3).map(([href, icon, label, line]) => (
            <Link key={href} href={href} className="hbr-link">
              <Icon name={icon} size={18} style={{ color: "var(--text-2)" }} />
              <div>
                <b>{label}</b>
                <span>{line}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mbr-sec ls-rise-3">
        <span className="mbr-eyebrow">Inbox</span>
        {word.length === 0 ? (
          <StateBlock
            status="empty"
            icon="Radio"
            bare
            title="Quiet water."
            detail="Weather, passes, and knots land here."
          />
        ) : (
          <div className="hbr-word">
            {word.map((n) => (
              <NoticeLink key={n.id} id={n.id} href={noticeHref(n.kind, n.href)} read={n.read}>
                <span className="wrd-ic">
                  <Icon name={KIND_ICON[n.kind] ?? "Radio"} size={15} />
                </span>
                <div>
                  <b>{n.title}</b>
                  {n.body ? <p>{n.body}</p> : null}
                </div>
                <span className="wrd-t">
                  {!n.read ? <span className="ls-live" role="img" aria-label="Unread"></span> : null}
                  {relTime(n.created_at)}
                </span>
              </NoticeLink>
            ))}
          </div>
        )}
        <div className="ls-double-rule" style={{ marginTop: 20 }}></div>
        <div className="mbr-mono" style={{ marginTop: 10 }}>
          SHIP&apos;S LOG · {logDate(nowIso, zone)} · ALL WELL
        </div>
      </section>
    </>
  );
}

export default async function HomePortPage() {
  const { profile } = await getMember();

  return (
    <div>
      <div className="ls-rise">
        {/* The greeting was the h1 and the page had no name on it at all. The
            name is the h1 now — it matches the route, the nav and the title —
            and the welcome moved up into the eyebrow, where it still lands
            first and still says the member’s name. */}
        <span className="mbr-eyebrow">Fair winds, {firstName(profile)}</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          {SURFACES.homePort}.
        </h1>
        <Suspense fallback={<div className="mbr-mono" style={{ marginTop: 8 }}>—</div>}>
          <CityLine />
        </Suspense>
      </div>

      {/* No loading.tsx under (member) — the group is redirect-gated and a
          loading file answers 200 before the gate has said its 3xx. The slow
          reads sit behind this boundary instead. */}
      <Suspense
        fallback={
          <section className="mbr-sec">
            <StateBlock status="loading" />
          </section>
        }
      >
        <HomeBody />
      </Suspense>
    </div>
  );
}
