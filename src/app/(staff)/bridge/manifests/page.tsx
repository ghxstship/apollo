import type { Metadata } from "next";
import { Stat, StateBlock } from "@/components/ds";
import { logDate, logTime } from "@/lib/format";
import { memberMark } from "@/lib/membership";
import { conditionsLine, getOperator, readConditions } from "../../data";
import { must } from "../../staff";
import {
  AddToManifest,
  FleetStrip,
  RosterTable,
  EpisodePicker,
  type FleetVessel,
  type RosterRow,
} from "./roster-client";

export const metadata: Metadata = { title: "Manifests" };

export default async function ManifestsPage({
  searchParams,
}: {
  searchParams: Promise<{ episode?: string }>;
}) {
  const { supabase } = await getOperator();
  const sp = await searchParams;

  /* Upcoming episodes — keep today's earlier departures on the board. */
  const cutoff = new Date(new Date().getTime() - 24 * 3600 * 1000).toISOString();
  const episodesRes = await supabase
    .from("episodes")
    .select("*")
    .gte("starts_at", cutoff)
    .in("status", ["scheduled", "live", "weather_hold"])
    .order("starts_at", { ascending: true });
  const episodes = must(episodesRes);

  if (episodes.length === 0) {
    return (
      <div>
        <span className="hm-eyebrow">Manifests</span>
        <h1 className="hm-h1">The gangway.</h1>
        <div className="hm-sec">
          <StateBlock
            status="empty"
            icon="Sailboat"
            title="Nothing on the water."
            detail="No upcoming episodes to muster. Set one on the Episodes tab."
          />
        </div>
      </div>
    );
  }

  const episode = episodes.find((v) => v.id === sp.episode) ?? episodes[0];

  const passesRes = await supabase
    .from("passes")
    .select("*")
    .eq("episode_id", episode.id)
    .neq("status", "not_going")
    .order("created_at", { ascending: true });
  const passes = must(passesRes);

  const profileIds = passes.map((r) => r.profile_id);
  const profilesRes = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, member_no, avatar_tone, on_camera")
        .in("id", profileIds)
    : { data: [] };
  const profiles = new Map((must(profilesRes)).map((p) => [p.id, p]));

  /* Derived from the signature record; the profile carries no waiver flag. */
  const waiverRes = profileIds.length
    ? await supabase
        .from("member_waiver_standing")
        .select("profile_id, current")
        .in("profile_id", profileIds)
    : { data: [] };
  const waiverCurrent = new Map(
    (must(waiverRes)).map((w) => [w.profile_id, Boolean(w.current)])
  );

  /* Active members for the box-office picker — anyone can be walked on. */
  const membersRes = await supabase
    .from("profiles")
    .select("id, full_name, member_no")
    .eq("status", "active")
    .order("full_name", { ascending: true });
  const memberOptions = (must(membersRes)).map((m) => ({
    value: m.id,
    label: `${m.full_name ?? "Unnamed"}${m.member_no ? ` — ${memberMark(m.member_no)}` : ""}`,
  }));

  /* The flotilla for this episode — yachts in position order, fill from
     passes.vessel_id (aboard berths only). */
  const voyageVesselsRes = await supabase
    .from("episode_vessels")
    .select("vessel_id, position")
    .eq("episode_id", episode.id)
    .order("position", { ascending: true });
  const vesselIds = (must(voyageVesselsRes)).map((vv) => vv.vessel_id);
  const vesselsRes = vesselIds.length
    ? await supabase.from("vessels").select("id, name, capacity").in("id", vesselIds)
    : { data: [] };
  const vesselById = new Map((must(vesselsRes)).map((v) => [v.id, v]));

  /* Per-guest filming consent, captured when the guest signed. The sheet used
     to derive off-camera from the HOST's profile alone, so a guest who declined
     never reached the floor at all. */
  const rsvpIds = passes.map((r) => r.id);
  const guestRowsRes = rsvpIds.length
    ? await supabase
        .from("pass_guests")
        .select("rsvp_id, name, on_camera")
        .in("rsvp_id", rsvpIds)
    : { data: [] };
  const guestsByPass = new Map<string, Array<{ name: string; onCamera: boolean }>>();
  for (const g of must(guestRowsRes)) {
    if (!g.rsvp_id) continue;
    guestsByPass.set(g.rsvp_id, [
      ...(guestsByPass.get(g.rsvp_id) ?? []),
      { name: g.name, onCamera: g.on_camera !== false },
    ]);
  }

  const aboardPasses = passes.filter((r) => r.status === "aboard");
  const fleet: FleetVessel[] = (must(voyageVesselsRes))
    .map((vv) => vesselById.get(vv.vessel_id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .map((v) => ({
      id: v.id,
      name: v.name,
      capacity: v.capacity,
      filled: aboardPasses.filter((r) => r.vessel_id === v.id).length,
    }));
  const unassigned = aboardPasses.filter((r) => !r.vessel_id).length;

  const ordered = [
    ...passes.filter((r) => r.status === "aboard"),
    ...passes.filter((r) => r.status === "waitlist"),
  ];

  const rows: RosterRow[] = ordered.map((r) => {
    const p = profiles.get(r.profile_id);
    return {
      passId: r.id,
      name: p?.full_name ?? "Unknown sailor",
      tone: p?.avatar_tone ?? "sand",
      memberNo: memberMark(p?.member_no) || "GUEST",
      guests: r.guests,
      guestNames: r.guest_names ?? [],
      guestParty: guestsByPass.get(r.id) ?? [],
      comp: r.comp,
      boardingCode: r.boarding_code ?? "",
      status: r.status as "aboard" | "waitlist",
      checkedInAt: r.checked_in_at,
      waiverMissing: !(waiverCurrent.get(r.profile_id) ?? false),
      offCamera: p ? p.on_camera === false : false,
      vesselId: r.vessel_id,
    };
  });

  const aboard = passes.filter((r) => r.status === "aboard");
  const checked = aboard.filter((r) => r.checked_in_at).length;
  const waitlist = passes.filter((r) => r.status === "waitlist");
  const firstInOrder = waitlist.length
    ? (profiles.get(waitlist[0].profile_id)?.full_name ?? "Unknown sailor")
    : null;
  const muster = episode.muster ?? "—";
  const conditions = readConditions(episode.conditions);

  return (
    <div>
      <span className="hm-eyebrow">Manifests</span>
      <h1 className="hm-h1">
        {logDate(episode.starts_at, episode.time_zone)}&apos;s manifest — {episode.title.replace(/\.+$/, "")}.
      </h1>

      <div className="hm-sec" style={{ marginTop: 20 }}>
        <EpisodePicker
          options={episodes.map((v) => ({
            value: v.id,
            label: `${logDate(v.starts_at, v.time_zone)} · ${logTime(v.starts_at, v.time_zone)} — ${v.title}`,
          }))}
          value={episode.id}
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

      <FleetStrip episodeId={episode.id} vessels={fleet} unassigned={unassigned} />

      <AddToManifest episodeId={episode.id} voyageTitle={episode.title} members={memberOptions} />

      <RosterTable rows={rows} muster={muster} vessels={fleet} />
    </div>
  );
}
