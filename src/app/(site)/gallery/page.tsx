import type { Metadata } from "next";
import Link from "next/link";
import { CLUB_ZONE } from "@/lib/brand";
import { SETTING_LABEL, logDate, roman } from "@/lib/format";
import { frameGroups, GALLERY_FRAME_LIMIT } from "@/components/site/episode-data";

export const metadata: Metadata = {
  alternates: { canonical: "/gallery" },
  title: "Gallery",
  description: "The season in frames — shot by members, credited by name, never staged.",
};

const SEAS: Record<string, string> = {
  day: "var(--sea-day)",
  dusk: "var(--sea-dusk)",
  dawn: "var(--sea-dawn)",
};

/* Placeholder seas — the sanctioned stand-in until film comes back. They hold
   the page only while no approved frame exists; a single real frame retires
   the whole grid. */
const TILES: Array<{
  media: "day" | "dusk" | "dawn";
  cap: string;
  meta: string;
  tall?: boolean;
  wide?: boolean;
}> = [
  { media: "dawn", cap: "First light, Catalina bound", meta: "Afloat · Jul 26", wide: true },
  { media: "dusk", cap: "Sirens' night, Venice", meta: "Ashore · Jul 10" },
  { media: "day", cap: "Rail down off Point Dume", meta: "Afloat · Jul 04", tall: true },
  { media: "day", cap: "Start line, boat two", meta: "Afloat · Jun 28" },
  /* Named for the cove rather than the settlement: Two Harbors is the real
     place on Catalina, but the plural is in BANNED_TERMS with the City rename
     and the gate greps rendered text, so this caption named the anchorage. */
  { media: "day", cap: "The long table at Isthmus Cove", meta: "Ashore · Jun 21", wide: true },
  { media: "dawn", cap: "Coffee below deck", meta: "Afloat · Jun 14" },
  { media: "dusk", cap: "Records on, wind down", meta: "Ashore · May 31", tall: true },
  { media: "day", cap: "Swim call at anchor", meta: "Afloat · May 17" },
  { media: "dawn", cap: "Watch change, 05:40", meta: "Afloat · May 24" },
  { media: "dusk", cap: "The season's toast", meta: "Ashore · May 10" },
  { media: "dawn", cap: "Fleet leaving the marina", meta: "Afloat · May 03", wide: true },
  { media: "day", cap: "The committee boat disagrees", meta: "Afloat · Jun 07" },
];

export default async function GalleryPage() {
  const groups = await frameGroups();
  const frameCount = groups.reduce((n, g) => n + g.frames.length, 0);
  const capped = frameCount >= GALLERY_FRAME_LIMIT;

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">The gallery</span>
        <h1>Proof it happened.</h1>
        <p className="ws-phead__sub">
          The season in frames — shot by members, credited by name, never staged.
          {groups.length === 0
            ? " Placeholder seas hold each frame until the film comes back."
            : capped
              ? ` The ${GALLERY_FRAME_LIMIT} newest frames, one entry per episode, most recent first — the rest live on each episode's page.`
              : " One entry per episode, most recent first."}
        </p>
      </div>

      {groups.length > 0 ? (
        groups.map((g) => (
          <section className="gl-group" key={g.episodeId}>
            <div className="gl-group__head">
              <h2>
                <Link href={`/episodes/${g.slug}`}>{g.title}</Link>
              </h2>
              <span className="gl-group__meta">
                {[
                  /* Where it happened — the group heading is a place and a
                     date, not a filing system. */
                  SETTING_LABEL[g.cls],
                  logDate(g.startsAt, CLUB_ZONE),
                  roman(new Date(g.startsAt).getFullYear()),
                  g.cityCode,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="gl-grid gl-grid--group">
              {g.frames.map((f) => (
                <div className="gl-tile gl-tile--frame" key={f.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- member frames are Supabase storage URLs; the image loader has no remote pattern for them */}
                  <img
                    className="gl-tile__img"
                    src={f.url}
                    alt={f.caption ?? `${g.title} — a frame from the sail`}
                  />
                  {f.caption ? (
                    <span className="gl-tile__cap">
                      <b>{f.caption}</b>
                      <span>
                        {SETTING_LABEL[g.cls]} · {logDate(g.startsAt, CLUB_ZONE)}
                      </span>
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="gl-grid">
          {TILES.map((t) => (
            <div
              key={t.cap}
              className={
                "gl-tile" + (t.tall ? " gl-tile--tall" : "") + (t.wide ? " gl-tile--wide" : "")
              }
            >
              <span className="gl-tile__bg" style={{ background: SEAS[t.media] }}></span>
              <span className="gl-tile__cap">
                <b>{t.cap}</b>
                <span>{t.meta} · Imagery TK</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="gl-caption">
        <p>
          Art direction, when the film comes back: warm, sun-washed water at golden
          hour, film grain welcome — salt, rope, linen, bodies in motion. Never
          cool, never clinical, never staged.
        </p>
        <span>Member film · credited by name</span>
      </div>
    </div>
  );
}
