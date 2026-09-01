import type { Metadata } from "next";
import { StateBlock } from "@/components/ds";
import { EVENT_CLASS_LABEL, logDate, logTime } from "@/lib/format";
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
  searchParams: Promise<{ voyage?: string }>;
}) {
  const { supabase } = await getOperator();
  const sp = await searchParams;

  /* Today's departures stay on the board for 24 hours; upcoming line up after. */
  const cutoff = new Date(new Date().getTime() - 24 * 3600 * 1000).toISOString();
  const voyagesRes = await supabase
    .from("voyages")
    .select("*")
    .gte("starts_at", cutoff)
    .in("status", ["scheduled", "live", "weather_hold"])
    .order("starts_at", { ascending: true });
  const voyages = must(voyagesRes);

  if (voyages.length === 0) {
    return (
      <div>
        <span className="hm-eyebrow">Gangway</span>
        <h1 className="hm-h1">Boarding.</h1>
        <div className="hm-sec">
          <StateBlock
            status="empty"
            icon="Sailboat"
            title="Nothing on the water."
            detail="No upcoming voyages to board. Set one on the Voyages tab."
          />
        </div>
      </div>
    );
  }

  const voyage = voyages.find((v) => v.id === sp.voyage) ?? voyages[0];

  const rsvpsRes = await supabase
    .from("rsvps")
    .select("*")
    .eq("voyage_id", voyage.id)
    .eq("status", "aboard")
    .order("created_at", { ascending: true });
  const rsvps = must(rsvpsRes);

  const profileIds = rsvps.map((r) => r.profile_id);
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

  const vesselIds = [...new Set(rsvps.map((r) => r.vessel_id).filter((id): id is string => !!id))];
  const vesselsRes = vesselIds.length
    ? await supabase.from("vessels").select("id, name").in("id", vesselIds)
    : { data: [] };
  const vesselById = new Map((must(vesselsRes)).map((v) => [v.id, v.name]));

  /* Guests from rsvp_guests, WITH their own checked_in_at. The roster used to
     render only the host row's guest_names strings, so a guest who scanned
     their own -G1 stub was aboard in the database and ashore on the printed
     list — and the printed list is what an evacuation is read from. */
  const rsvpIds = rsvps.map((r) => r.id);
  const guestsRes = rsvpIds.length
    ? await supabase
        .from("rsvp_guests")
        .select("rsvp_id, name, checked_in_at")
        .in("rsvp_id", rsvpIds)
    : { data: [] };
  const guestsByRsvp = new Map<string, { name: string; aboard: boolean }[]>();
  for (const g of must(guestsRes)) {
    const list = guestsByRsvp.get(g.rsvp_id) ?? [];
    list.push({ name: g.name, aboard: Boolean(g.checked_in_at) });
    guestsByRsvp.set(g.rsvp_id, list);
  }

  /* A daybed is a claim on the sailing, not on the pass — the door needs to
     know who holds one so the crew can point them to it. */
  const daybedsRes = await supabase
    .from("voyage_daybeds")
    .select("rsvp_id")
    .eq("voyage_id", voyage.id);
  const daybedRsvps = new Set(must(daybedsRes).map((d) => d.rsvp_id));

  /* A cabin card prints its own muster station; the pass carries the cabin. */
  const cabinIds = [...new Set(rsvps.map((r) => r.cabin_id).filter((id): id is string => !!id))];
  const cabinsRes = cabinIds.length
    ? await moduleTables(supabase).from("cabins").select("id, name, muster").in("id", cabinIds)
    : { data: [] as CabinRow[], error: null };
  const cabinById = new Map(
    must<CabinRow>(cabinsRes as { data: CabinRow[] | null; error?: { message?: string } | null }).map(
      (c) => [c.id, c]
    )
  );

  /* The door's muster line. A shore night musters at its venue — name and
     address — where a sailing musters at the slip the voyage names. */
  let muster: string | null = voyage.muster ?? null;
  if (voyage.class === "shore" && voyage.venue_id) {
    const { data: venue } = await supabase
      .from("venues")
      .select("name, address")
      .eq("id", voyage.venue_id)
      .maybeSingle();
    if (venue) muster = venue.address ? `${venue.name} · ${venue.address}` : venue.name;
  }

  const rows: GangwayRow[] = rsvps.map((r) => {
    const p = profiles.get(r.profile_id);
    const guestList = guestsByRsvp.get(r.id) ?? (r.guest_names ?? []).map((name: string) => ({ name, aboard: false }));
    const cabin = r.cabin_id ? cabinById.get(r.cabin_id) : undefined;
    return {
      rsvpId: r.id,
      code: r.boarding_code ?? "",
      name: p?.full_name ?? "Unknown sailor",
      memberNo: p?.member_no ?? "GUEST",
      vessel: r.vessel_id ? (vesselById.get(r.vessel_id) ?? "") : "",
      guestNames: guestList.map((g) => g.name),
      guestList,
      guests: r.guests,
      waiverSigned: waiverCurrent.get(r.profile_id) ?? false,
      checkedInAt: r.checked_in_at,
      daybed: daybedRsvps.has(r.id),
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
        voyageId={voyage.id}
        voyageTitle={voyage.title}
        family={EVENT_CLASS_LABEL[voyage.class] ?? "Sea Day"}
        departs={`${logDate(voyage.starts_at, voyage.time_zone)} · ${logTime(voyage.starts_at, voyage.time_zone)}`}
        timeZone={voyage.time_zone}
        muster={muster}
        options={voyages.map((v) => ({
          value: v.id,
          label: `${logDate(v.starts_at, v.time_zone)} · ${logTime(v.starts_at, v.time_zone)} — ${v.title}`,
        }))}
        rows={rows}
      />
    </div>
  );
}
