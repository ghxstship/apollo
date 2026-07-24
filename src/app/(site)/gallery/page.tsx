import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gallery",
  description: "The season in frames — shot by members, credited by name, never staged.",
};

const SEAS: Record<string, string> = {
  day: "var(--sea-day)",
  dusk: "var(--sea-dusk)",
  dawn: "var(--sea-dawn)",
};

const TILES: Array<{
  media: "day" | "dusk" | "dawn";
  cap: string;
  meta: string;
  tall?: boolean;
  wide?: boolean;
}> = [
  { media: "dawn", cap: "First light, Catalina bound", meta: "Sea Day · Jul 26", wide: true },
  { media: "dusk", cap: "Sirens' night, Venice", meta: "Port Day · Jul 10" },
  { media: "day", cap: "Rail down off Point Dume", meta: "Sea Day · Jul 04", tall: true },
  { media: "day", cap: "Start line, boat two", meta: "Sea Day · Jun 28" },
  { media: "day", cap: "The long table at Two Harbors", meta: "Port Day · Jun 21", wide: true },
  { media: "dawn", cap: "Coffee below deck", meta: "Sea Day · Jun 14" },
  { media: "dusk", cap: "Records on, wind down", meta: "Port Day · May 31", tall: true },
  { media: "day", cap: "Swim call at anchor", meta: "Sea Day · May 17" },
  { media: "dawn", cap: "Watch change, 05:40", meta: "Sea Day · May 24" },
  { media: "dusk", cap: "The season's toast", meta: "Port Day · May 10" },
  { media: "dawn", cap: "Fleet leaving the marina", meta: "Sea Day · May 03", wide: true },
  { media: "day", cap: "The committee boat disagrees", meta: "Sea Day · Jun 07" },
];

export default function GalleryPage() {
  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">The gallery</span>
        <h1>Proof it happened.</h1>
        <p className="ws-phead__sub">
          The season in frames — shot by members, credited by name, never staged.
          Placeholder seas hold each frame until the film comes back.
        </p>
      </div>
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
