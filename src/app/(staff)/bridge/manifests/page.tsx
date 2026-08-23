import type { Metadata } from "next";
import { Stat, StateBlock } from "@/components/ds";
import { logDate, logTime } from "@/lib/format";
import { conditionsLine, getOperator, readConditions } from "../../data";
import {
  AddToManifest,
  FleetStrip,
  RosterTable,
  VoyagePicker,
  type FleetVessel,
  type RosterRow,
} from "./roster-client";

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
        .select("id, full_name, member_no, avatar_tone, on_camera")
        .in("id", profileIds)
    : { data: [] };
  const profiles = new Map((profilesData ?? []).map((p) => [p.id, p]));

  /* Derived from the signature record; the profile carries no waiver flag. */
  const { data: waiverData } = profileIds.length
    ? await supabase
        .from("member_waiver_standing")
        .select("profile_id, current")
        .in("profile_id", profileIds)
    : { data: [] };
  const waiverCurrent = new Map(
    (waiverData ?? []).map((w) => [w.profile_id, Boolean(w.current)])
  );

  /* Active members for the box-office picker — anyone can be walked on. */
  const { data: membersData } = await supabase
    .from("profiles")
    .select("id, full_name, member_no")
    .eq("status", "active")
    .order("full_name", { ascending: true });
  const memberOptions = (membersData ?? []).map((m) => ({
    value: m.id,
    label: `${m.full_name ?? "Unnamed"}${m.member_no ? ` — ${m.member_no}` : ""}`,
  }));

  /* The flotilla for this voyage — yachts in position order, fill from
     rsvps.vessel_id (aboard berths only). */
  const { data: voyageVessels } = await supabase
    .from("voyage_vessels")
    .select("vessel_id, position")
    .eq("voyage_id", voyage.id)
    .order("position", { ascending: true });
  const vesselIds = (voyageVessels ?? []).map((vv) => vv.vessel_id);
  const { data: vesselsData } = vesselIds.length
    ? await supabase.from("vessels").select("id, name, capacity").in("id", vesselIds)
    : { data: [] };
  const vesselById = new Map((vesselsData ?? []).map((v) => [v.id, v]));

  const aboardRsvps = rsvps.filter((r) => r.status === "aboard");
  const fleet: FleetVessel[] = (voyageVessels ?? [])
    .map((vv) => vesselById.get(vv.vessel_id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .map((v) => ({
      id: v.id,
      name: v.name,
      capacity: v.capacity,
      filled: aboardRsvps.filter((r) => r.vessel_id === v.id).length,
    }));
  const unassigned = aboardRsvps.filter((r) => !r.vessel_id).length;

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
      guestNames: r.guest_names ?? [],
      comp: r.comp,
      boardingCode: r.boarding_code ?? "",
      status: r.status as "aboard" | "waitlist",
      checkedInAt: r.checked_in_at,
      waiverMissing: !(waiverCurrent.get(r.profile_id) ?? false),
      offCamera: p ? p.on_camera === false : false,
      vesselId: r.vessel_id,
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
        {logDate(voyage.starts_at, voyage.time_zone)}&apos;s manifest — {voyage.title.replace(/\.+$/, "")}.
      </h1>

      <div className="hm-sec" style={{ marginTop: 20 }}>
        <VoyagePicker
          options={voyages.map((v) => ({
            value: v.id,
            label: `${logDate(v.starts_at, v.time_zone)} · ${logTime(v.starts_at, v.time_zone)} — ${v.title}`,
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

      <FleetStrip voyageId={voyage.id} vessels={fleet} unassigned={unassigned} />

      <AddToManifest voyageId={voyage.id} voyageTitle={voyage.title} members={memberOptions} />

      <RosterTable rows={rows} muster={muster} vessels={fleet} />
    </div>
  );
}
