import type { Metadata } from "next";
import { StateBlock } from "@/components/ds";
import { SETTING_LABEL, logDate, logDateTime, logTime } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { getDoor } from "../../data";
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
  /* getDoor, not getOperator: this is the one Bridge screen a hired door may
     hold. Staff see the whole board; a door sees the episodes they hold a
     grant for and nothing else, and every action below asks the database
     again before it stamps. */
  const { supabase, staff, grants } = await getDoor();
  const sp = await searchParams;

  /* Today's departures stay on the board for 24 hours; upcoming line up after. */
  const cutoff = new Date(new Date().getTime() - 24 * 3600 * 1000).toISOString();
  let episodesQuery = supabase
    .from("episodes")
    .select("*")
    .gte("starts_at", cutoff)
    .in("status", ["scheduled", "live", "weather_hold"])
    .order("starts_at", { ascending: true });
  /* A door's board is their grants. An empty list is filtered to nothing
     rather than to everything — `in()` with no values matches no row. */
  if (!staff) episodesQuery = episodesQuery.in("id", grants.map((g) => g.episode_id));
  const episodes = must(await episodesQuery);

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
            detail={
              staff
                ? "No upcoming episodes to board. Set one on the Episodes tab."
                : "No episode on the board for your door tonight. If that's wrong, hail Shoreside."
            }
          />
        </div>
      </div>
    );
  }

  const episode = episodes.find((v) => v.id === sp.episode) ?? episodes[0];
  const grant = staff ? null : grants.find((g) => g.episode_id === episode.id) ?? null;

  const passesRes = await supabase
    .from("passes")
    .select("*")
    .eq("episode_id", episode.id)
    .eq("status", "aboard")
    .order("created_at", { ascending: true });
  const passes = must(passesRes);

  const profileIds = passes.map((r) => r.profile_id);
  /* Names. Staff read profiles; a door is not staff, and profiles is "own
     profile or staff", so a door reads the directory view instead — the name a
     member has agreed other members may see. A member who opted out of the
     directory reads as "A member" to the door, and the number stays blank:
     that is the view's rule and it is the right one for a hired door. (A
     definer that hands the door its own episode's names is the fix; see the
     door role's SQL notes.) */
  const profilesRes = !profileIds.length
    ? { data: [] as Array<{ id: string; full_name: string | null; member_no: string | null }> }
    : staff
      ? await supabase.from("profiles").select("id, full_name, member_no").in("id", profileIds)
      : { data: [] as Array<{ id: string; full_name: string | null; member_no: string | null }> };
  /* A door is not staff and not the directory: door_manifest names everyone
     on the episode it was granted, opted-out or not, with their waiver state. */
  const doorRows = staff
    ? []
    : (await Promise.all(episodes.map((e) => supabase.rpc("door_manifest", { p_episode: e.id }))))
        .flatMap((r) => r.data ?? []);
  const profiles = new Map(
    [
      ...must(profilesRes),
      ...doorRows.map((d) => ({ id: d.profile_id, full_name: d.full_name, member_no: d.member_no })),
    ].map((p) => [p.id, p])
  );

  /* Waiver standing is derived from the signature record, never from a flag on
     the profile — one question, one answer. The view is security_invoker over
     signatures, which a door cannot read for anyone but themselves, so for a
     door the standing is UNKNOWN — null, never false. Printing "Missing" for a
     whole manifest the door cannot see would be a confident wrong answer; the
     database still refuses an unsigned member at the stamp. */
  const waiverRes = staff && profileIds.length
    ? await supabase
        .from("member_waiver_standing")
        .select("profile_id, current")
        .in("profile_id", profileIds)
    : { data: [] as Array<{ profile_id: string | null; current: boolean | null }> };
  const waiverCurrent = new Map<string | null, boolean>(
    (must(waiverRes)).map((w) => [w.profile_id, Boolean(w.current)])
  );
  for (const d of doorRows) waiverCurrent.set(d.profile_id, d.waiver_current);

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
      /* A door's directory read may carry no number for a listed member's
         row; that is a member, not a guest, so it does not say GUEST. */
      memberNo: p?.member_no ?? (staff ? "GUEST" : "MEMBER"),
      vessel: r.vessel_id ? (vesselById.get(r.vessel_id) ?? "") : "",
      guestNames: guestList.map((g) => g.name),
      guestList,
      guests: r.guests,
      waiverSigned: waiverCurrent.has(r.profile_id) ? (waiverCurrent.get(r.profile_id) ?? false) : staff ? false : null,
      checkedInAt: r.checked_in_at,
      daybed: daybedPasses.has(r.id),
      cabin: cabin?.name ?? null,
      cabinMuster: cabin?.muster ?? null,
      standby: r.standby,
    };
  });

  return (
    <div>
      <span className="hm-eyebrow">Gangway</span>
      {/* Stable statement; event state lives in the mono line below (client,
          so the aboard count ticks live). */}
      <h1 className="hm-h1">Boarding.</h1>
      <p className="hm-lede">Scan a pass or type its code.</p>
      {/* The door's own header: which episode the grant is for and when it
          runs out. Staff already have the Bridge around them; a door has this
          line and the console, and nothing else to follow. */}
      {grant ? (
        <p className="hm-note ls-mono-data">
          THE DOOR · {episode.title.replace(/\.+$/, "").toUpperCase()} · GRANT RUNS OUT{" "}
          {logDateTime(grant.expires_at, episode.time_zone).toUpperCase()}
        </p>
      ) : null}

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
