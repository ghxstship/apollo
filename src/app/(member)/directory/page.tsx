import type { Metadata } from "next";
import Link from "next/link";
import { CLUB_ZONE, CITY_CODES, PLACE } from "@/lib/brand";
import { roman, yearIn } from "@/lib/format";
import { getMember } from "../data";
import { DirectoryList, type DirectoryMember, type CityOption } from "./roster";

export const metadata: Metadata = { title: "Directory" };

const TONES = new Set(["ink", "sea", "gold", "sand"]);

/* The roster arrives a page at a time — 120 names, alphabetical — and "Show
   more" widens the window rather than paging away from what is already on
   screen, so the client-side search keeps working over everything loaded.
   Before this the page read every listed member, every league row and every
   engagement row in the club on each visit. */
const PAGE_SIZE = 120;
const MAX_PAGES = 10;

function toneOf(t: string | null | undefined): "ink" | "sea" | "gold" | "sand" {
  return t && TONES.has(t) ? (t as "ink" | "sea" | "gold" | "sand") : "ink";
}

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase, user } = await getMember();
  const { show } = await searchParams;
  const pages = Math.min(MAX_PAGES, Math.max(1, Math.floor(Number(show)) || 1));
  const limit = PAGE_SIZE * pages;

  const [profilesRes, citiesRes, affinityRes] = await Promise.all([
    supabase
      .from("member_directory")
      .select("id,full_name,handle,avatar_tone,home_city,joined_at,interests", { count: "exact" })
      .eq("in_directory", true)
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .range(0, limit - 1),
    supabase.from("cities").select("id,slug,name").order("position", { ascending: true }),
    supabase.from("member_affinity").select("other_id,shared").eq("profile_id", user.id),
  ]);

  const profiles = profilesRes.data ?? [];
  const total = profilesRes.count ?? profiles.length;
  const ids = profiles.map((p) => p.id);

  /* League and engagement only for the names on the page. */
  const [leagueRes, engagementRes] = await Promise.all([
    ids.length
      ? supabase.from("member_league").select("profile_id,league,league_name").in("profile_id", ids)
      : Promise.resolve({
          data: [] as Array<{ profile_id: string | null; league: number | null; league_name: string | null }>,
        }),
    ids.length
      ? supabase.from("member_engagement").select("profile_id,passes").in("profile_id", ids)
      : Promise.resolve({ data: [] as Array<{ profile_id: string | null; passes: number | null }> }),
  ]);

  const cities = citiesRes.data ?? [];
  const cityById = new Map(cities.map((h) => [h.id, h]));
  const leagueById = new Map(
    (leagueRes.data ?? [])
      .filter((r) => r.profile_id)
      .map((r) => [r.profile_id as string, r])
  );
  const passesById = new Map(
    (engagementRes.data ?? [])
      .filter((r) => r.profile_id)
      .map((r) => [r.profile_id as string, r.passes ?? 0])
  );
  const sharedById = new Map(
    (affinityRes.data ?? [])
      .filter((r) => r.other_id)
      .map((r) => [r.other_id as string, r.shared ?? 0])
  );

  const members: DirectoryMember[] = profiles.map((p) => {
    const city = p.home_city ? cityById.get(p.home_city) : null;
    const joinedYear = p.joined_at ? yearIn(p.joined_at, CLUB_ZONE) : yearIn(new Date().toISOString(), CLUB_ZONE);
    return {
      id: p.id,
      name: p.full_name ?? "A member",
      handle: p.handle,
      tone: toneOf(p.avatar_tone),
      harborId: city?.id ?? "",
      harborName: city?.name ?? `No home ${PLACE.market.toLowerCase()}`,
      cityCode: city ? CITY_CODES[city.slug] ?? "" : "",
      league: leagueById.get(p.id)?.league ?? 1,
      leagueName: leagueById.get(p.id)?.league_name ?? "First League — Harborline",
      passes: passesById.get(p.id) ?? 0,
      joined: roman(joinedYear),
      /* The roster prints a Roman year and sorts on the real date — the
         printed form loses the month, and "newest aboard" needs it. */
      joinedMs: p.joined_at ? Date.parse(p.joined_at) : 0,
      interests: p.interests ?? [],
      shared: sharedById.get(p.id) ?? 0,
      self: p.id === user.id,
    };
  });

  const cityOptions: CityOption[] = cities.map((h) => ({ id: h.id, name: h.name }));
  const more = total > members.length && pages < MAX_PAGES;

  return (
    <div style={{ maxWidth: 820, marginInline: "auto" }}>
      {/* The roster was the h1 and Directory only the eyebrow, so the page and
          the nav disagreed. Name on top; the roster opens the standfirst. */}
      <span className="mbr-eyebrow">By {PLACE.market.toLowerCase()} and league</span>
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        Directory.
      </h1>
      <p className="dir-lede">
        The roster — everyone who chose to be listed. Search a name, a handle, or
        what they turn up for.
      </p>
      <DirectoryList members={members} cities={cityOptions} total={total} />
      {more ? (
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20, flexWrap: "wrap" }}>
          <Link
            href={`/directory?show=${pages + 1}`}
            scroll={false}
            className="ls-btn ls-btn--outline ls-btn--sm"
          >
            Show more
          </Link>
          <span className="mbr-mono" style={{ color: "var(--text-3)" }}>
            {members.length} OF {total} LOADED · A–Z
          </span>
        </div>
      ) : null}
    </div>
  );
}
