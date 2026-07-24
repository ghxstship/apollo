import type { Metadata } from "next";
import { Stat, StateBlock } from "@/components/ds";
import { logDate, logTime } from "@/lib/format";
import { conditionsLine, getOperator, readConditions } from "../../data";
import { RosterTable, VoyagePicker, type RosterRow } from "./roster-client";

export const metadata: Metadata = { title: "Manifests" };

export default async function ManifestsPage({
  searchParams,
}: {
  searchParams: Promise<{ voyage?: string }>;
}) {
  const { supabase } = await getOperator();
  const sp = await searchParams;

  /* Upcoming sailings — keep today's earlier departures on the board. */
  const cutoff = new Date(new Date().getTime() - 24 * 3600 * 1000).toISOString();
  const { data: voyagesData } = await supabase
    .from("voyages")
    .select("*")
    .gte("starts_at", cutoff)
    .in("status", ["scheduled", "live", "weather_hold"])
    .order("starts_at", { ascending: true });
  const voyages = voyagesData ?? [];

  if (voyages.length === 0) {
    return (
      <div>
        <span className="hm-eyebrow">Manifests</span>
        <h1 className="hm-h1">The gangway.</h1>
        <div className="hm-sec">
          <StateBlock
            status="empty"
            icon="Sailboat"
            title="Nothing on the water."
            detail="No upcoming voyages to muster. Set one on the Voyages tab."
          />
        </div>
      </div>
    );
  }

  const voyage = voyages.find((v) => v.id === sp.voyage) ?? voyages[0];

  const { data: rsvpsData } = await supabase
    .from("rsvps")
    .select("*")
    .eq("voyage_id", voyage.id)
    .neq("status", "not_going")
    .order("created_at", { ascending: true });
  const rsvps = rsvpsData ?? [];

  const profileIds = rsvps.map((r) => r.profile_id);
  const { data: profilesData } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, member_no, avatar_tone, waiver_signed_at")
        .in("id", profileIds)
    : { data: [] };
  const profiles = new Map((profilesData ?? []).map((p) => [p.id, p]));

  const ordered = [
    ...rsvps.filter((r) => r.status === "aboard"),
    ...rsvps.filter((r) => r.status === "waitlist"),
  ];

  const rows: RosterRow[] = ordered.map((r) => {
    const p = profiles.get(r.profile_id);
    return {
      rsvpId: r.id,
      name: p?.full_name ?? "Unknown sailor",
      tone: p?.avatar_tone ?? "sand",
      memberNo: p?.member_no ?? "GUEST",
      guests: r.guests,
      boardingCode: r.boarding_code ?? "",
      status: r.status as "aboard" | "waitlist",
      checkedInAt: r.checked_in_at,
      waiverMissing: !p?.waiver_signed_at,
    };
  });

  const aboard = rsvps.filter((r) => r.status === "aboard");
  const checked = aboard.filter((r) => r.checked_in_at).length;
  const waitlist = rsvps.filter((r) => r.status === "waitlist");
  const firstInOrder = waitlist.length
    ? (profiles.get(waitlist[0].profile_id)?.full_name ?? "Unknown sailor")
    : null;
  const muster = voyage.muster ?? "—";
  const conditions = readConditions(voyage.conditions);

  return (
    <div>
      <span className="hm-eyebrow">Manifests</span>
      <h1 className="hm-h1">
        {logDate(voyage.starts_at)}&apos;s manifest — {voyage.title.replace(/\.+$/, "")}.
      </h1>

      <div className="hm-sec" style={{ marginTop: 20 }}>
        <VoyagePicker
          options={voyages.map((v) => ({
            value: v.id,
            label: `${logDate(v.starts_at)} · ${logTime(v.starts_at)} — ${v.title}`,
          }))}
          value={voyage.id}
        />
      </div>

      <div className="hm-row">
        <Stat
          size="sm"
          label="Aboard"
          value={`${checked} / ${aboard.length}`}
          sub={`MUSTER ${muster.toUpperCase()}`}
        />
        <Stat
          size="sm"
          label="Waitlist"
          value={waitlist.length}
          sub={firstInOrder ? `${firstInOrder.toUpperCase()} FIRST IN ORDER` : "NOBODY HOLDING"}
        />
        <Stat
          size="sm"
          label="Conditions"
          value={conditions.wind ?? "—"}
          sub={conditionsLine({ ...conditions, wind: undefined })}
        />
      </div>

      <RosterTable rows={rows} muster={muster} />
    </div>
  );
}
