import type { Metadata } from "next";
import { logDate, logTime } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { SEGMENTS, type Segment, type SegmentCapacityRow } from "@/lib/vetting";
import { getOperator } from "../../data";
import { must, mustValue } from "../../staff";
import {
  CompositionPanel,
  NoSailings,
  VoyagePicker,
  type QueueLine,
} from "./composition-client";

export const metadata: Metadata = { title: "Composition" };

interface QueueEntry {
  segment: Segment;
  offered_at: string | null;
  claim_expires_at: string | null;
  claimed_at: string | null;
  released_at: string | null;
}

export default async function CompositionPage({
  searchParams,
}: {
  searchParams: Promise<{ voyage?: string }>;
}) {
  const { supabase } = await getOperator();
  const db = moduleTables(supabase);
  const sp = await searchParams;

  /* Sailings that can still take a seat. A composition on a completed sailing
     changes nothing anyone can act on, so the picker does not offer one. */
  const cutoff = new Date(new Date().getTime() - 24 * 3600 * 1000).toISOString();
  const voyagesRes = await supabase
    .from("voyages")
    .select(
      "id, title, starts_at, time_zone, berths_total, held_passes, status, hull_ceiling_heads, hull_certificate"
    )
    .gte("starts_at", cutoff)
    .in("status", ["scheduled", "live", "weather_hold"])
    .order("starts_at", { ascending: true });
  const voyages = must(voyagesRes);

  if (voyages.length === 0) {
    return (
      <div>
        <span className="hm-eyebrow">Composition</span>
        <h1 className="hm-h1">The ratio gate.</h1>
        <div className="hm-sec">
          <NoSailings />
        </div>
      </div>
    );
  }

  const voyage = voyages.find((v) => v.id === sp.voyage) ?? voyages[0];

  const [capsRes, queueRes, defaultCeilingRes] = await Promise.all([
    db.from("voyage_segment_capacity").select("*").eq("voyage_id", voyage.id),
    db
      .from("waitlist_entries")
      .select("segment, offered_at, claim_expires_at, claimed_at, released_at")
      .eq("voyage_id", voyage.id),
    /* The club's certified heads, read rather than retyped: the trigger reads
       coalesce(voyage.hull_ceiling_heads, club_setting('hull_ceiling_heads')),
       and the screen has to show the same figure it will be refused against. */
    supabase.rpc("club_setting", { p_key: "hull_ceiling_heads" }),
  ]);

  const rows = (must(capsRes as { data: SegmentCapacityRow[] | null; error: null })).slice();
  const entries = must(queueRes as { data: QueueEntry[] | null; error: null });
  const clubCeiling = mustValue<number>(
    defaultCeilingRes as { data: number | null; error?: { message?: string } | null },
    0
  );

  /* Waiting: in the line, never offered, still live. Offered: written to and
     the six hours are still running. Counted apart because a segment with one
     person waiting and an offer already out has nothing to offer — that seat is
     spoken for until the claim expires.

     The third count is the one that matters here. `released_at` is only ever
     stamped by lapse_stale_waitlist_offers, which is not on cron, is not
     executable by `authenticated`, and runs only inside offer_the_next_place
     and claim_your_place — so between an offer expiring and the next time
     somebody presses a button, a dead offer still carries offered_at with no
     released_at. Counting outstanding offers by those two flags alone reports a
     seat as spoken for hours after it stopped being spoken for, and hides the
     Offer button from the crew who could free it. Reading the clock instead
     makes every figure on this screen true the moment it is true, with no
     scheduler in the picture at all. */
  const now = new Date().getTime();
  const live = (e: QueueEntry) => !e.claimed_at && !e.released_at;
  const running = (e: QueueEntry) =>
    !!e.claim_expires_at && new Date(e.claim_expires_at).getTime() > now;
  const lines: QueueLine[] = SEGMENTS.map((segment) => {
    const mine = entries.filter((e) => e.segment === segment && live(e));
    return {
      segment,
      waiting: mine.filter((e) => !e.offered_at).length,
      offered: mine.filter((e) => !!e.offered_at && running(e)).length,
      lapsed: mine.filter((e) => !!e.offered_at && !running(e)).length,
      claimed: entries.filter((e) => e.segment === segment && !!e.claimed_at).length,
    };
  });

  const hull = Math.max((voyage.berths_total ?? 0) - (voyage.held_passes ?? 0), 0);

  return (
    <div>
      <span className="hm-eyebrow">Composition</span>
      <h1 className="hm-h1">The ratio gate.</h1>
      <p className="hm-lede">
        A sailing is ratio-gated when it carries a composition, and not
        otherwise. Setting these three ceilings is what turns the gate on: from
        then on every pass must name its segment, must pass the vetting file,
        and is counted against the ceiling and against the hull.
      </p>

      <div className="hm-sec">
        <VoyagePicker
          options={voyages.map((v) => ({
            value: v.id,
            label: `${logDate(v.starts_at, v.time_zone)} · ${logTime(v.starts_at, v.time_zone)} — ${v.title}`,
          }))}
          value={voyage.id}
        />
      </div>

      <CompositionPanel
        key={voyage.id}
        voyageId={voyage.id}
        voyageTitle={voyage.title}
        hull={hull}
        hullCeiling={voyage.hull_ceiling_heads}
        hullCertificate={voyage.hull_certificate}
        clubCeiling={clubCeiling}
        rows={rows}
        lines={lines}
      />

      <p className="hm-note">
        The line is served from here or from the member&apos;s own capacity
        panel — one function, either surface. An offer writes once and stands
        for six hours; after that it lapses and passes to the next in order.
      </p>
    </div>
  );
}
