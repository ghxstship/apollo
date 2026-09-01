import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Icon, Stat, StateBlock } from "@/components/ds";
import { CURRENCY, knots, SURFACES } from "@/lib/brand";
import { logDate, logMeta } from "@/lib/format";
import { firstName, getMember } from "../data";
import { KIND_ICON, relTime } from "../relative";

export const metadata: Metadata = { title: "Harbor" };

/* How many underway sailings the strip will name. */
const LIVE_LIMIT = 12;

export default async function HarborPage() {
  const { supabase, user, profile, zone } = await getMember();
  const nowIso = new Date().toISOString();

  const [harborRes, rsvpsRes, liveRes, balanceRes, wordRes, planRes, usageRes] =
    await Promise.all([
      profile?.home_harbor
        ? supabase.from("harbors").select("name,coordinates").eq("id", profile.home_harbor).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("rsvps").select("voyage_id").eq("profile_id", user.id).eq("status", "aboard"),
      supabase.from("voyages").select("id,title").eq("status", "live").limit(LIVE_LIMIT),
      supabase.from("fathoms_balance").select("balance").eq("profile_id", user.id).maybeSingle(),
      supabase
        .from("notifications")
        .select("id,kind,title,body,read,created_at")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(2),
      profile?.plan_id
        ? supabase.from("membership_plans").select("events_per_month").eq("id", profile.plan_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("member_pass_usage").select("month,passes_used").eq("profile_id", user.id),
    ]);

  /* The next pass is the soonest upcoming sailing this member is aboard —
     asked for by id, rather than reading every upcoming sailing in the club
     and searching it for one of theirs. */
  const aboardIds = (rsvpsRes.data ?? []).map((r) => r.voyage_id);
  const nextBerthRes = aboardIds.length
    ? await supabase
        .from("voyages")
        .select("id,title,media,blurb,starts_at,distance_nm,time_zone")
        .in("id", aboardIds)
        .gte("starts_at", nowIso)
        .in("status", ["scheduled", "live", "weather_hold"])
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const harbor = harborRes.data;
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
  const passLine =
    allowance > 0
      ? `${passesUsed} OF ${allowance} PASSES USED · ${now
          .toLocaleString("en-US", { month: "long" })
          .toUpperCase()}`
      : null;

  return (
    <div>
      <div className="ls-rise">
        <span className="mbr-eyebrow">Home harbor</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          Fair winds, {firstName(profile)}.
        </h1>
        <div className="mbr-mono" style={{ marginTop: 8 }}>
          {/* The club's own harbour is not the member's. Every fixture with a
              null home_harbor was being told theirs was Marina del Rey. */}
          {harbor?.name ? harbor.name.toUpperCase() : "NO HOME HARBOR YET"}
          {harbor?.coordinates ? ` · ${harbor.coordinates}` : ""}
        </div>
      </div>

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
                  href="/manifest"
                  className="ls-btn ls-btn--ghost ls-btn--sm ls-btn--inverse"
                >
                  Manifest <Icon name="ArrowUpRight" size={14} />
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
            detail="The manifest is open. Passes are few by design."
            action={
              <Link href="/manifest" className="ls-btn ls-btn--outline ls-btn--sm">
                View voyages
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
          </div>
          <div className="hbr-links" style={{ gridTemplateColumns: "1fr" }}>
            <Link href="/open-deck" className="hbr-link">
              <Icon name="MessageCircle" size={18} style={{ color: "var(--text-2)" }} />
              <div>
                <b>{SURFACES.openDeck}</b>
                <span>MEMBERS ONLY · MIND THE CODE</span>
              </div>
            </Link>
            <Link href="/directory" className="hbr-link">
              <Icon name="Users" size={18} style={{ color: "var(--text-2)" }} />
              <div>
                <b>Directory</b>
                <span>THE ROSTER · BY HARBOR AND LEAGUE</span>
              </div>
            </Link>
            <Link href="/portal" className="hbr-link">
              <Icon name="Compass" size={18} style={{ color: "var(--text-2)" }} />
              <div>
                <b>Member portal</b>
                <span>KNOTS · REWARDS · REFERRALS</span>
              </div>
            </Link>
            <Link href="/card" className="hbr-link">
              <Icon name="IdCard" size={18} style={{ color: "var(--text-2)" }} />
              <div>
                <b>{SURFACES.passbook}</b>
                <span>SCAN AT THE GANGWAY</span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section className="mbr-sec ls-rise-3">
        <span className="mbr-eyebrow">The Word</span>
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
              <Link key={n.id} href="/inbox">
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
              </Link>
            ))}
          </div>
        )}
        <div className="ls-double-rule" style={{ marginTop: 20 }}></div>
        <div className="mbr-mono" style={{ marginTop: 10 }}>
          SHIP&apos;S LOG · {logDate(nowIso, zone)} · ALL WELL
        </div>
      </section>
    </div>
  );
}
