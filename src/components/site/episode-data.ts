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
  episodeId: string;
  url: string;
  caption: string | null;
}

export interface FrameGroup {
  episodeId: string;
  slug: string;
  title: string;
  startsAt: string;
  cls: string;
  cityCode: string | null;
  frames: Frame[];
}

/* The bucket is private: an unapproved frame, or one pulled for consent, must
   not be fetchable by anyone who guesses its path. What the gallery shows is a
   short-lived signed URL the server mints for a frame that HAS been cleared. */
const FRAME_URL_TTL_SECONDS = 60 * 60;

/* Exported because the Bridge needs the same signing the gallery does — the
   bucket is private, so a path is not a URL anywhere. */
export async function signFrames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[]
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;
  const { data } = await supabase.storage
    .from("episode-media")
    .createSignedUrls(paths, FRAME_URL_TTL_SECONDS);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
  }
  return signed;
}

/* Flotilla assignments for a set of episodes, in the Bridge's own order. */
export async function fleetByEpisode(
  episodeIds: string[]
): Promise<Map<string, FleetVessel[]>> {
  const byEpisode = new Map<string, FleetVessel[]>();
  if (episodeIds.length === 0) return byEpisode;
  try {
    const supabase = await createClient();
    const { data: links } = await supabase
      .from("episode_vessels")
      .select("episode_id,vessel_id,position")
      .in("episode_id", episodeIds)
      .order("position", { ascending: true });
    if (!links || links.length === 0) return byEpisode;
    const { data: vessels } = await supabase
      .from("vessels")
      .select("id,name,capacity,length_ft,year,cabins")
      .in("id", Array.from(new Set(links.map((l) => l.vessel_id))));
    const byId = new Map((vessels ?? []).map((v) => [v.id, v] as const));
    for (const link of links) {
      const v = byId.get(link.vessel_id);
      if (!v) continue;
      const list = byEpisode.get(link.episode_id) ?? [];
      list.push({
        id: v.id,
        name: v.name,
        capacity: v.capacity,
        lengthFt: v.length_ft,
        year: v.year,
        cabins: v.cabins,
      });
      byEpisode.set(link.episode_id, list);
    }
  } catch {
    /* Unreachable data is not invented data — the fleet goes unstated. */
  }
  return byEpisode;
}

export async function fleetFor(episodeId: string): Promise<FleetVessel[]> {
  return (await fleetByEpisode([episodeId])).get(episodeId) ?? [];
}

/* Approved frames for one episode, oldest first — the roll as it was shot. */
export async function framesFor(episodeId: string): Promise<Frame[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("episode_media")
      .select("id,episode_id,storage_path,caption")
      .eq("episode_id", episodeId)
      .eq("approved", true)
      .order("created_at", { ascending: true });
    const signed = await signFrames(supabase, (data ?? []).map((m) => m.storage_path));
    return (data ?? [])
      .filter((m) => signed.has(m.storage_path))
      .map((m) => ({
        id: m.id,
        episodeId: m.episode_id,
        url: signed.get(m.storage_path) as string,
        caption: m.caption,
      }));
  } catch {
    return [];
  }
}

/* The gallery shows this many frames at most — the newest, then grouped by
   episode. Every approved frame in the club was being read and signed on each
   render before this, and createSignedUrls is one storage call per render
   whose cost grows with the list. */
export const GALLERY_FRAME_LIMIT = 48;

/* The newest approved frames in the club, grouped by episode, most recent
   episode first; inside a group the roll runs oldest first, as it was shot. */
export async function frameGroups(limit = GALLERY_FRAME_LIMIT): Promise<FrameGroup[]> {
  try {
    const supabase = await createClient();
    const { data: media } = await supabase
      .from("episode_media")
      .select("id,episode_id,storage_path,caption")
      .eq("approved", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!media || media.length === 0) return [];
    /* Newest-first is the cut; oldest-first is the reading order. */
    media.reverse();

    const episodeIds = Array.from(new Set(media.map((m) => m.episode_id)));
    const { data: episodes } = await supabase
      .from("episodes")
      .select("id,slug,title,starts_at,setting,city_id")
      .in("id", episodeIds);
    if (!episodes || episodes.length === 0) return [];

    const harborIds = Array.from(
      new Set(episodes.map((v) => v.city_id).filter((id): id is string => !!id))
    );
    const { data: cities } = harborIds.length
      ? await supabase.from("cities").select("id,slug").in("id", harborIds)
      : { data: [] as Array<{ id: string; slug: string }> };
    const citySlug = new Map((cities ?? []).map((h) => [h.id, h.slug] as const));

    const groups = new Map<string, FrameGroup>();
    for (const v of episodes) {
      const slug = v.city_id ? citySlug.get(v.city_id) : null;
      groups.set(v.id, {
        episodeId: v.id,
        slug: v.slug,
        title: v.title,
        startsAt: v.starts_at,
        cls: v.setting,
        cityCode: (slug && CITY_CODES[slug]) || null,
        frames: [],
      });
    }
    const signedAll = await signFrames(supabase, media.map((m) => m.storage_path));
    for (const m of media) {
      const url = signedAll.get(m.storage_path);
      if (!url) continue;
      groups.get(m.episode_id)?.frames.push({
        id: m.id,
        episodeId: m.episode_id,
        url,
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
