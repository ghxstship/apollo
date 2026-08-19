import "server-only";
import { CITY_CODES } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

/* The fleet and approved frames are public at the RLS line — boat names and
   photographs meant for the gallery are marketing, not member data — so these
   read with the ordinary anon-scoped client. No service-role key on a public
   page. Everything still fails soft: no rows, no fabrication. */

export interface FleetVessel {
  id: string;
  name: string;
  capacity: number;
  lengthFt: number | null;
  year: number | null;
  cabins: number | null;
}

export interface Frame {
  id: string;
  voyageId: string;
  url: string;
  caption: string | null;
}

export interface FrameGroup {
  voyageId: string;
  slug: string;
  title: string;
  startsAt: string;
  cls: string;
  harborCode: string | null;
  frames: Frame[];
}

function frameUrl(storagePath: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/voyage-media/${storagePath}`;
}

/* Flotilla assignments for a set of sailings, in the Bridge's own order. */
export async function fleetByVoyage(
  voyageIds: string[]
): Promise<Map<string, FleetVessel[]>> {
  const byVoyage = new Map<string, FleetVessel[]>();
  if (voyageIds.length === 0) return byVoyage;
  try {
    const supabase = await createClient();
    const { data: links } = await supabase
      .from("voyage_vessels")
      .select("*")
      .in("voyage_id", voyageIds)
      .order("position", { ascending: true });
    if (!links || links.length === 0) return byVoyage;
    const { data: vessels } = await supabase
      .from("vessels")
      .select("*")
      .in("id", Array.from(new Set(links.map((l) => l.vessel_id))));
    const byId = new Map((vessels ?? []).map((v) => [v.id, v] as const));
    for (const link of links) {
      const v = byId.get(link.vessel_id);
      if (!v) continue;
      const list = byVoyage.get(link.voyage_id) ?? [];
      list.push({
        id: v.id,
        name: v.name,
        capacity: v.capacity,
        lengthFt: v.length_ft,
        year: v.year,
        cabins: v.cabins,
      });
      byVoyage.set(link.voyage_id, list);
    }
  } catch {
    /* Unreachable data is not invented data — the fleet goes unstated. */
  }
  return byVoyage;
}

export async function fleetFor(voyageId: string): Promise<FleetVessel[]> {
  return (await fleetByVoyage([voyageId])).get(voyageId) ?? [];
}

/* Approved frames for one sailing, oldest first — the roll as it was shot. */
export async function framesFor(voyageId: string): Promise<Frame[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("voyage_media")
      .select("*")
      .eq("voyage_id", voyageId)
      .eq("approved", true)
      .order("created_at", { ascending: true });
    return (data ?? []).map((m) => ({
      id: m.id,
      voyageId: m.voyage_id,
      url: frameUrl(m.storage_path),
      caption: m.caption,
    }));
  } catch {
    return [];
  }
}

/* Every approved frame in the club, grouped by sailing, most recent first. */
export async function frameGroups(): Promise<FrameGroup[]> {
  try {
    const supabase = await createClient();
    const { data: media } = await supabase
      .from("voyage_media")
      .select("*")
      .eq("approved", true)
      .order("created_at", { ascending: true });
    if (!media || media.length === 0) return [];

    const voyageIds = Array.from(new Set(media.map((m) => m.voyage_id)));
    const { data: voyages } = await supabase
      .from("voyages")
      .select("*")
      .in("id", voyageIds);
    if (!voyages || voyages.length === 0) return [];

    const harborIds = Array.from(
      new Set(voyages.map((v) => v.harbor_id).filter((id): id is string => !!id))
    );
    const { data: harbors } = await supabase.from("harbors").select("*").in("id", harborIds);
    const harborSlug = new Map((harbors ?? []).map((h) => [h.id, h.slug] as const));

    const groups = new Map<string, FrameGroup>();
    for (const v of voyages) {
      const slug = v.harbor_id ? harborSlug.get(v.harbor_id) : null;
      groups.set(v.id, {
        voyageId: v.id,
        slug: v.slug,
        title: v.title,
        startsAt: v.starts_at,
        cls: v.class,
        harborCode: (slug && CITY_CODES[slug]) || null,
        frames: [],
      });
    }
    for (const m of media) {
      groups.get(m.voyage_id)?.frames.push({
        id: m.id,
        voyageId: m.voyage_id,
        url: frameUrl(m.storage_path),
        caption: m.caption,
      });
    }
    return Array.from(groups.values())
      .filter((g) => g.frames.length > 0)
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  } catch {
    return [];
  }
}
