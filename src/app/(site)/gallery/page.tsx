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
/* Reseeded from Season I. Every caption was a Los Angeles scene — Catalina,
   Point Dume, Venice, Isthmus Cove — dated May to July, months before the
   club's first episode on 4 September 2026, so the placeholder grid described
   a season that had not happened in a city the club does not sail from. These
   are real episodes, with their real settings and dates on the club's clock,
   and they still say IMAGERY TK until film comes back. */
  { media: "dawn", cap: "Anchor: the launch", meta: "Afloat · Sep 04", wide: true },
  { media: "dusk", cap: "Neon dusk", meta: "Ashore · Sep 09" },
  { media: "day", cap: "Airboat safari", meta: "Afloat · Sep 19", tall: true },
  { media: "dusk", cap: "Velvet nocturne", meta: "Ashore · Sep 22" },
  { media: "dusk", cap: "Shadow and silk", meta: "Ashore · Oct 01", wide: true },
  { media: "day", cap: "Anchor: autumn equinox", meta: "Afloat · Oct 11" },
  { media: "dusk", cap: "After dark in the sculpture garden", meta: "Ashore · Oct 31", tall: true },
  { media: "day", cap: "Apex velocity", meta: "Ashore · Nov 05" },
  { media: "dawn", cap: "Anchor: coastal solstice", meta: "Afloat · Nov 15" },
  { media: "dusk", cap: "Omakase underground", meta: "Ashore · Nov 28" },
  { media: "dawn", cap: "Glow paddle", meta: "Afloat · Jan 07", wide: true },
  { media: "day", cap: "Anchor: the white party", meta: "Afloat · May 15" },
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
                    alt={f.caption ?? `${g.title} — a frame from the episode`}
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
        {/* The art-direction brief is a note to a photographer, not something a
            reader came here for — it lived on the public page for want of
            anywhere else. The half that belongs to the reader is the promise at
            the end of it, and that half stays. The brief itself is on /brand
            under Imagery, where a photographer will look for it. */}
        <p>Never cool, never clinical, never staged.</p>
        <span>Member film · credited by name</span>
      </div>
    </div>
  );
}
