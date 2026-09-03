import type { Metadata } from "next";
import { StateBlock } from "@/components/ds";
import { SETTING_LABEL, logDate, logTime } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { getOperator } from "../../data";
import { GangwayConsole, type GangwayRow } from "./gangway-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Gangway" };

/* cabins.muster landed in 20260825065942 and the shared type file has not
   caught up — read through the module seam and type it at the boundary. */
type CabinRow = { id: string; name: string; muster: string | null };

export default async function GangwayPage({
  searchParams,
}: {
  searchParams: Promise<{ episode?: string }>;
}) {
  const { supabase } = await getOperator();
  const sp = await searchParams;

  /* Today's departures stay on the board for 24 hours; upcoming line up after. */
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
        <span className="hm-eyebrow">Gangway</span>
        <h1 className="hm-h1">Boarding.</h1>
        <div className="hm-sec">
          <StateBlock
            status="empty"
            icon="CalendarDays"
            title="Nobody to board."
            detail="No upcoming episodes to board. Set one on the Episodes tab."
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
    .eq("status", "aboard")
    .order("created_at", { ascending: true });
  const passes = must(passesRes);

  const profileIds = passes.map((r) => r.profile_id);
  const profilesRes = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, member_no")
        .in("id", profileIds)
    : { data: [] };
  const profiles = new Map((must(profilesRes)).map((p) => [p.id, p]));

  /* Waiver standing is derived from the signature record, never from a flag on
     the profile — one question, one answer. */
  const waiverRes = profileIds.length
    ? await supabase
        .from("member_waiver_standing")
        .select("profile_id, current")
        .in("profile_id", profileIds)
    : { data: [] };
  const waiverCurrent = new Map(
    (must(waiverRes)).map((w) => [w.profile_id, Boolean(w.current)])
  );

  const vesselIds = [...new Set(passes.map((r) => r.vessel_id).filter((id): id is string => !!id))];
  const vesselsRes = vesselIds.length
    ? await supabase.from("vessels").select("id, name").in("id", vesselIds)
    : { data: [] };
  const vesselById = new Map((must(vesselsRes)).map((v) => [v.id, v.name]));

  /* Guests from pass_guests, WITH their own checked_in_at. The roster used to
     render only the host row's guest_names strings, so a guest who scanned
     their own -G1 stub was aboard in the database and ashore on the printed
     list — and the printed list is what an evacuation is read from. */
  const rsvpIds = passes.map((r) => r.id);
  const guestsRes = rsvpIds.length
    ? await supabase
        .from("pass_guests")
        .select("rsvp_id, name, checked_in_at")
        .in("rsvp_id", rsvpIds)
    : { data: [] };
  const guestsByPass = new Map<string, { name: string; aboard: boolean }[]>();
  for (const g of must(guestsRes)) {
    const list = guestsByPass.get(g.rsvp_id) ?? [];
    list.push({ name: g.name, aboard: Boolean(g.checked_in_at) });
    guestsByPass.set(g.rsvp_id, list);
  }

  /* A daybed is a claim on the episode, not on the pass — the door needs to
     know who holds one so the crew can point them to it. */
  const daybedsRes = await supabase
    .from("episode_daybeds")
    .select("rsvp_id")
    .eq("episode_id", episode.id);
  const daybedPasses = new Set(must(daybedsRes).map((d) => d.rsvp_id));

  /* A cabin card prints its own muster station; the pass carries the cabin. */
  const cabinIds = [...new Set(passes.map((r) => r.cabin_id).filter((id): id is string => !!id))];
  const cabinsRes = cabinIds.length
    ? await moduleTables(supabase).from("cabins").select("id, name, muster").in("id", cabinIds)
    : { data: [] as CabinRow[], error: null };
  const cabinById = new Map(
    must<CabinRow>(cabinsRes as { data: CabinRow[] | null; error?: { message?: string } | null }).map(
      (c) => [c.id, c]
    )
  );

  /* What the door calls this episode: the series' own name, the way it reads
     on a member's card. An episode with no series falls back to where it
     happens — afloat or ashore — which is the fact the crew at the top of the
     gangway actually needs. */
  let identity = SETTING_LABEL[episode.setting] ?? SETTING_LABEL.shore;
  if (episode.series) {
    const { data: formatRow } = await moduleTables(supabase)
      .from("series")
      .select("label")
      .eq("slug", episode.series)
      .maybeSingle();
    const label = (formatRow as { label?: string } | null)?.label;
    if (label) identity = label;
  }

  /* The door's muster line. A shore night musters at its venue — name and
     address — where an afloat episode musters at the slip it names. */
  let muster: string | null = episode.muster ?? null;
  if (episode.setting === "shore" && episode.venue_id) {
    const { data: venue } = await supabase
      .from("venues")
      .select("name, address")
      .eq("id", episode.venue_id)
      .maybeSingle();
    if (venue) muster = venue.address ? `${venue.name} · ${venue.address}` : venue.name;
  }

  const rows: GangwayRow[] = passes.map((r) => {
    const p = profiles.get(r.profile_id);
    const guestList = guestsByPass.get(r.id) ?? (r.guest_names ?? []).map((name: string) => ({ name, aboard: false }));
    const cabin = r.cabin_id ? cabinById.get(r.cabin_id) : undefined;
    return {
      passId: r.id,
      code: r.boarding_code ?? "",
      name: p?.full_name ?? "Unknown sailor",
      memberNo: p?.member_no ?? "GUEST",
      vessel: r.vessel_id ? (vesselById.get(r.vessel_id) ?? "") : "",
      guestNames: guestList.map((g) => g.name),
      guestList,
      guests: r.guests,
      waiverSigned: waiverCurrent.get(r.profile_id) ?? false,
      checkedInAt: r.checked_in_at,
      daybed: daybedPasses.has(r.id),
      cabin: cabin?.name ?? null,
      cabinMuster: cabin?.muster ?? null,
    };
  });

  return (
    <div>
      <span className="hm-eyebrow">Gangway</span>
      {/* Stable statement; event state lives in the mono line below (client,
          so the aboard count ticks live). */}
      <h1 className="hm-h1">Boarding.</h1>
      <p className="hm-lede">Scan a pass or type its code.</p>

      <GangwayConsole
        episodeId={episode.id}
        voyageTitle={episode.title}
        identity={identity}
        departs={`${logDate(episode.starts_at, episode.time_zone)} · ${logTime(episode.starts_at, episode.time_zone)}`}
        timeZone={episode.time_zone}
        muster={muster}
        options={episodes.map((v) => ({
          value: v.id,
          label: `${logDate(v.starts_at, v.time_zone)} · ${logTime(v.starts_at, v.time_zone)} — ${v.title}`,
        }))}
        rows={rows}
      />
    </div>
  );
}
