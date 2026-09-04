import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { CopyLink } from "@/components/copy-link";
import { KitPassageLog, StateBlock, Tag, type LogFigure } from "@/components/ds";
import { CITY_CODES, CLUB_ZONE, CURRENCY, PLACE, SITE_DOMAIN, knots } from "@/lib/brand";
import { SETTING_LABEL, endOfDay, logDate, logDateYear, startOfDay } from "@/lib/format";
import { getMember } from "../data";

/* Route, nav, title and h1: Season. The standfirst is the logbook's own line. */
export const metadata: Metadata = { title: "Season" };

type SeasonEpisode = {
  id: string;
  slug: string;
  title: string;
  setting: string;
  starts_at: string;
  distance_nm: number | null;
  city_id: string | null;
  time_zone: string;
};

function nm(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export default async function SeasonPage() {
  const { supabase, user, profile, zone } = await getMember();

  /* Which season. A season belongs to a city, so the member's home city's
     active season comes first; a club-wide one (no city) second; failing both,
     the earliest active season on the books. Nothing is invented — a club
     with no season row has no season page to fill. */
  const { data: seasonRows } = await supabase
    .from("seasons")
    .select("*")
    .eq("active", true)
    .order("starts_on", { ascending: true });
  const seasons = seasonRows ?? [];
  const season =
    seasons.find((s) => s.city_id && s.city_id === profile?.home_city) ??
    seasons.find((s) => s.city_id === null) ??
    seasons[0] ??
    null;

  /* The address a member hands on. Behind the sign-in, so it is a link for
     another member — the preview card it unfurls carries no name and no number. */
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? SITE_DOMAIN;
  const proto = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = `${proto}://${host}/season`;

  if (!season) {
    return (
      <div className="ls-fade" style={{ maxWidth: 760 }}>
        <span className="mbr-eyebrow">The season, on the record</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          Season.
        </h1>
        <div className="mbr-sec">
          <StateBlock
            status="empty"
            icon="Compass"
            title="No season on the record yet."
            detail="When the Bridge opens one, your numbers and names for it land here."
          />
        </div>
      </div>
    );
  }

  /* The season's clock is its city's. */
  const { data: seasonCity } = season.city_id
    ? await supabase.from("cities").select("name, slug, time_zone").eq("id", season.city_id).maybeSingle()
    : { data: null };
  const seasonZone = seasonCity?.time_zone ?? CLUB_ZONE;
  const from = startOfDay(season.starts_on, seasonZone);
  const to = endOfDay(season.ends_on, seasonZone);

  /* The aggregates come from season_card — the same definer that writes the
     season's card at close, so this page and that card cannot disagree. The
     names come from the member's own passes through RLS. */
  const [cardRes, passesRes] = await Promise.all([
    supabase.rpc("season_card", { p_profile_id: user.id, p_from: from, p_to: to }),
    supabase
      .from("passes")
      .select("episode_id, vessel_id")
      .eq("profile_id", user.id)
      .eq("status", "aboard"),
  ]);
  const card = Array.isArray(cardRes.data) ? cardRes.data[0] ?? null : null;
  const passes = passesRes.data ?? [];
  const passEpisodeIds = passes.map((p) => p.episode_id);

  const { data: episodeRows } = passEpisodeIds.length
    ? await supabase
        .from("episodes")
        .select("id, slug, title, setting, starts_at, distance_nm, city_id, time_zone")
        .in("id", passEpisodeIds)
        .eq("status", "completed")
        .gte("starts_at", from)
        .lt("starts_at", to)
        .order("starts_at", { ascending: true })
    : { data: [] as SeasonEpisode[] };
  const episodes: SeasonEpisode[] = episodeRows ?? [];
  const episodeIds = episodes.map((e) => e.id);

  /* Hulls: the vessel the pass was placed on, or — when the pass names none —
     the flotilla posted for that episode. Crew: confirmed billings, which is
     the only rota row a member can read. Frames: the member's own, cleared. */
  const vesselFromPass = new Set(
    passes
      .filter((p) => episodeIds.includes(p.episode_id) && p.vessel_id)
      .map((p) => p.vessel_id as string)
  );
  const unplaced = episodes.filter(
    (e) => !passes.some((p) => p.episode_id === e.id && p.vessel_id)
  ).map((e) => e.id);

  const [cityRes, flotillaRes, crewAssignRes, framesRes] = await Promise.all([
    episodes.some((e) => e.city_id)
      ? supabase
          .from("cities")
          .select("id, name, slug")
          .in("id", Array.from(new Set(episodes.map((e) => e.city_id).filter((c): c is string => !!c))))
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; slug: string }> }),
    unplaced.length
      ? supabase.from("episode_vessels").select("episode_id, vessel_id").in("episode_id", unplaced)
      : Promise.resolve({ data: [] as Array<{ episode_id: string; vessel_id: string }> }),
    episodeIds.length
      ? supabase
          .from("crew_assignments")
          .select("crew_id")
          .in("episode_id", episodeIds)
          .eq("status", "confirmed")
      : Promise.resolve({ data: [] as Array<{ crew_id: string }> }),
    episodeIds.length
      ? supabase
          .from("episode_media")
          .select("id", { count: "exact", head: true })
          .in("episode_id", episodeIds)
          .eq("uploaded_by", user.id)
          .eq("approved", true)
      : Promise.resolve({ count: 0 }),
  ]);

  for (const row of flotillaRes.data ?? []) vesselFromPass.add(row.vessel_id);
  const vesselIds = Array.from(vesselFromPass);
  const crewIds = Array.from(new Set((crewAssignRes.data ?? []).map((r) => r.crew_id)));

  const [vesselRes, crewRes] = await Promise.all([
    vesselIds.length
      ? supabase.from("vessels").select("id, name").in("id", vesselIds).order("name")
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    crewIds.length
      ? supabase
          .from("crew")
          .select("id, display_name, role_title")
          .in("id", crewIds)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string; role_title: string }> }),
  ]);

  const cities = cityRes.data ?? [];
  const cityById = new Map(cities.map((c) => [c.id, c]));
  const hulls = vesselRes.data ?? [];
  const crew = crewRes.data ?? [];
  const marks: string[] = Array.isArray(card?.marks_won) ? card.marks_won : [];
  const framesApproved = framesRes.count ?? 0;

  const sailed = episodes.length > 0;
  const miles = card ? Number(card.nm_logged ?? 0) : episodes.reduce((n, e) => n + (e.distance_nm ?? 0), 0);
  const cityCount = card ? Number(card.cities ?? 0) : new Set(episodes.map((e) => e.city_id).filter(Boolean)).size;

  /* Every figure has a source above, or it is not a figure. Knots come from the
     ledger inside the window, through season_card; if the card did not answer,
     the line is omitted rather than filled with a zero it cannot vouch for. */
  const figures: LogFigure[] = sailed
    ? [
        { value: String(episodes.length), label: "Episodes aboard" },
        { value: nm(miles), label: "Nautical miles" },
        { value: String(cityCount), label: PLACE.markets },
        { value: String(hulls.length), label: "Hulls" },
        { value: String(crew.length), label: "Crew met" },
        { value: String(marks.length), label: "Marks earned" },
        { value: String(framesApproved), label: "Frames approved" },
        ...(card ? [{ value: knots(Number(card.knots_earned ?? 0)), label: `${CURRENCY.name} banked` }] : []),
      ]
    : [];

  const seasonLabel = seasonCity ? `${season.title} · ${seasonCity.name}` : season.title;
  /* The window prints its own two dates; `to` is the instant the last day
     ENDS, which would read as the day after. */
  const window = `${logDateYear(from, seasonZone)} — ${logDateYear(startOfDay(season.ends_on, seasonZone), seasonZone)}`;

  return (
    <div className="ls-fade" style={{ maxWidth: 760 }}>
      <div className="ssn-head">
        <div>
          <span className="mbr-eyebrow">The season, on the record</span>
          <h1 className="mbr-h1" style={{ marginTop: 6 }}>
            Season.
          </h1>
          <p className="ssn-lede">
            {seasonLabel} · {window}. Your numbers and your names — miles, not likes.
          </p>
        </div>
        <CopyLink value={shareUrl} label="Copy link" toast="Season link copied." />
      </div>

      {!sailed ? (
        <div className="mbr-sec">
          <KitPassageLog
            figures={[]}
            emptyLabel={`Nothing on the record yet. ${season.title} opened ${logDate(from, seasonZone)}; the first episode writes the first line.`}
          />
          <Link href="/passes" className="ls-btn ls-btn--outline ls-btn--sm">
            Passes
          </Link>
        </div>
      ) : (
        <>
          <section className="mbr-sec">
            <span className="mbr-eyebrow">In numbers</span>
            <KitPassageLog figures={figures} since={logDate(episodes[0].starts_at, zone)} />
            {card?.longest_title && card.longest_nm ? (
              <p className="ssn-note">
                Longest leg: {card.longest_title}, {nm(Number(card.longest_nm))} NM.
              </p>
            ) : null}
          </section>

          <section className="mbr-sec">
            <span className="mbr-eyebrow">Episodes aboard</span>
            <ul className="ssn-list">
              {episodes.map((e) => {
                const city = e.city_id ? cityById.get(e.city_id) : null;
                return (
                  <li key={e.id}>
                    <span className="mbr-mono">{logDate(e.starts_at, e.time_zone)}</span>
                    <b>{e.title}</b>
                    <span className="mbr-mono">
                      {[
                        SETTING_LABEL[e.setting] ?? "Afloat",
                        city ? CITY_CODES[city.slug] ?? city.name : null,
                        e.distance_nm != null ? `${nm(e.distance_nm)} NM` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                        .toUpperCase()}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {cities.length ? (
            <section className="mbr-sec">
              <span className="mbr-eyebrow">{PLACE.markets}</span>
              <div className="ssn-names">
                {cities.map((c) => (
                  <Tag key={c.id}>{c.name}</Tag>
                ))}
              </div>
            </section>
          ) : null}

          {hulls.length ? (
            <section className="mbr-sec">
              <span className="mbr-eyebrow">Hulls</span>
              <div className="ssn-names">
                {hulls.map((v) => (
                  <Tag key={v.id}>{v.name}</Tag>
                ))}
              </div>
            </section>
          ) : null}

          {crew.length ? (
            <section className="mbr-sec">
              <span className="mbr-eyebrow">Crew met</span>
              <ul className="ssn-list">
                {crew.map((c) => (
                  <li key={c.id}>
                    <span className="mbr-mono">{c.role_title.toUpperCase()}</span>
                    <b>{c.display_name}</b>
                    <span></span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {marks.length ? (
            <section className="mbr-sec">
              <span className="mbr-eyebrow">Marks earned</span>
              <div className="ssn-names">
                {marks.map((m) => (
                  <Tag key={m}>{m}</Tag>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
