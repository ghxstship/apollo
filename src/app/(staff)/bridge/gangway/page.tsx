import type { Metadata } from "next";
import { StateBlock } from "@/components/ds";
import { EVENT_CLASS_LABEL, logDate, logTime } from "@/lib/format";
import { getOperator } from "../../data";
import { GangwayConsole, type GangwayRow } from "./gangway-client";

export const metadata: Metadata = { title: "Gangway" };

export default async function GangwayPage({
  searchParams,
}: {
  searchParams: Promise<{ voyage?: string }>;
}) {
  const { supabase } = await getOperator();
  const sp = await searchParams;

  /* Today's departures stay on the board for 24 hours; upcoming line up after. */
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

  const { data: rsvpsData } = await supabase
    .from("rsvps")
    .select("*")
    .eq("voyage_id", voyage.id)
    .eq("status", "aboard")
    .order("created_at", { ascending: true });
  const rsvps = rsvpsData ?? [];

  const profileIds = rsvps.map((r) => r.profile_id);
  const { data: profilesData } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, member_no")
        .in("id", profileIds)
    : { data: [] };
  const profiles = new Map((profilesData ?? []).map((p) => [p.id, p]));

  /* Waiver standing is derived from the signature record, never from a flag on
     the profile — one question, one answer. */
  const { data: waiverData } = profileIds.length
    ? await supabase
        .from("member_waiver_standing")
        .select("profile_id, current")
        .in("profile_id", profileIds)
    : { data: [] };
  const waiverCurrent = new Map(
    (waiverData ?? []).map((w) => [w.profile_id, Boolean(w.current)])
  );

  const vesselIds = [...new Set(rsvps.map((r) => r.vessel_id).filter((id): id is string => !!id))];
  const { data: vesselsData } = vesselIds.length
    ? await supabase.from("vessels").select("id, name").in("id", vesselIds)
    : { data: [] };
  const vesselById = new Map((vesselsData ?? []).map((v) => [v.id, v.name]));

  const rows: GangwayRow[] = rsvps.map((r) => {
    const p = profiles.get(r.profile_id);
    return {
      rsvpId: r.id,
      code: r.boarding_code ?? "",
      name: p?.full_name ?? "Unknown sailor",
      memberNo: p?.member_no ?? "GUEST",
      vessel: r.vessel_id ? (vesselById.get(r.vessel_id) ?? "") : "",
      guestNames: r.guest_names ?? [],
      guests: r.guests,
      waiverSigned: waiverCurrent.get(r.profile_id) ?? false,
      checkedInAt: r.checked_in_at,
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
        departs={`${logDate(voyage.starts_at)} · ${logTime(voyage.starts_at)}`}
        options={voyages.map((v) => ({
          value: v.id,
          label: `${logDate(v.starts_at)} · ${logTime(v.starts_at)} — ${v.title}`,
        }))}
        rows={rows}
      />
    </div>
  );
}
