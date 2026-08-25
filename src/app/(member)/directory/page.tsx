import type { Metadata } from "next";
import { CLUB_ZONE, CITY_CODES } from "@/lib/brand";
import { roman, yearIn } from "@/lib/format";
import { getMember } from "../data";
import { DirectoryList, type DirectoryMember, type HarborOption } from "./roster";

export const metadata: Metadata = { title: "Directory" };

const TONES = new Set(["ink", "sea", "gold", "sand"]);

function toneOf(t: string | null | undefined): "ink" | "sea" | "gold" | "sand" {
  return t && TONES.has(t) ? (t as "ink" | "sea" | "gold" | "sand") : "ink";
}

export default async function DirectoryPage() {
  const { supabase, user } = await getMember();

  const [profilesRes, harborsRes, leagueRes, engagementRes, affinityRes] = await Promise.all([
    supabase
      .from("member_directory")
      .select("*")
      .eq("in_directory", true)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase.from("harbors").select("*").order("position", { ascending: true }),
    supabase.from("member_league").select("*"),
    supabase.from("member_engagement").select("profile_id,passes"),
    supabase.from("member_affinity").select("other_id,shared").eq("profile_id", user.id),
  ]);

  const harbors = harborsRes.data ?? [];
  const harborById = new Map(harbors.map((h) => [h.id, h]));
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

  const members: DirectoryMember[] = (profilesRes.data ?? []).map((p) => {
    const harbor = p.home_harbor ? harborById.get(p.home_harbor) : null;
    const joinedYear = p.joined_at ? yearIn(p.joined_at, CLUB_ZONE) : yearIn(new Date().toISOString(), CLUB_ZONE);
    return {
      id: p.id,
      name: p.full_name ?? "A member",
      handle: p.handle,
      tone: toneOf(p.avatar_tone),
      harborId: harbor?.id ?? "",
      harborName: harbor?.name ?? "No home harbor",
      harborCode: harbor ? CITY_CODES[harbor.slug] ?? "" : "",
      league: leagueById.get(p.id)?.league ?? 1,
      leagueName: leagueById.get(p.id)?.league_name ?? "First League — Harborline",
      passes: passesById.get(p.id) ?? 0,
      joined: roman(joinedYear),
      interests: p.interests ?? [],
      shared: sharedById.get(p.id) ?? 0,
      self: p.id === user.id,
    };
  });

  const harborOptions: HarborOption[] = harbors.map((h) => ({ id: h.id, name: h.name }));

  return (
    <div style={{ maxWidth: 820, marginInline: "auto" }}>
      <span className="mbr-eyebrow">Directory</span>
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        The roster.
      </h1>
      <p className="dir-lede">
        Everyone who chose to be listed. Search a name, a handle, or what they turn
        up for.
      </p>
      <DirectoryList members={members} harbors={harborOptions} />
    </div>
  );
}
