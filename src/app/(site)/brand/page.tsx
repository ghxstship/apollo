import type { Metadata } from "next";
import { Badge, Icon, Tag } from "@/components/ds";
import { SectionHeader } from "@/components/site/section-header";
import { CITY_CODES, CLASS_CODES, CURRENCY, FAMILY_LABEL, LEAGUES, MAILBOX, SUB_CLASSES, SURFACES, TAGLINE } from "@/lib/brand";
import { CopyProvider, CopyTextButton, Swatch } from "./copy-controls";
import "./brand.css";

export const metadata: Metadata = {
  title: "The brand kit",
  description:
    "The mark, the palette, the type, the voice, and the facts — everything needed to write about, partner with, or sponsor the club.",
};

const BOILER =
  "LYRE SOCIAL is a membership club for experiential connection at sea and ashore. Founded MMXXIV in Marina del Rey, the club runs Sea Days aboard — day sails, crossings, regattas, night passages — and Port Days ashore for a crew that believes the long way home is the point. Membership is by invitation or application — Access, Regional, National, and Global, with Guest passes alongside.";

const SEAS: Record<string, string> = {
  dawn: "var(--sea-dawn)",
  day: "var(--sea-day)",
  dusk: "var(--sea-dusk)",
};

const GREYS: Array<[string, string, string, boolean]> = [
  ["Void", "#060607", "deepest fields", true],
  ["Carbon", "#0B0B0C", "the page", true],
  ["Panel", "#141416", "cards", true],
  ["Steel", "#2A2A2E", "hairlines", true],
];
const PAPERS: Array<[string, string, string, boolean]> = [
  ["White", "#FFFFFF", "light-theme cards", false],
  ["Paper", "#F2F2F4", "text, light page", false],
  ["Silver", "#C9C9CF", "secondary", false],
  ["Smoke", "#8A8A93", "muted", false],
];
const NEON: Array<[string, string, string, boolean]> = [
  ["Cyan", "#00E8FF", "links, focus, live", false],
  ["Violet", "#8B5CFF", "emphasis", false],
  ["Magenta", "#FF2EC4", "urgency", true],
  ["Amber", "#FF9E3D", "warnings", false],
];
const LAVAS: Array<[string, string, string]> = [
  ["Master", "linear-gradient(90deg,#00E8FF,#8B5CFF,#FF2EC4)", "the union"],
  ["Sea", "linear-gradient(90deg,#7DF3FF,#2E6FFF,#0B1E4A)", "sunlit to midnight"],
  ["Shore", "linear-gradient(90deg,#C6FF4A,#17B877,#063B2A)", "noon to night forest"],
  ["Sky", "linear-gradient(90deg,#FFD24A,#FF2EC4,#2E1A66)", "golden hour to nightfall"],
];

const TYPE_VOICES: Array<[string, string, string, string, string]> = [
  ["var(--font-display)", "Marcellus", "Display and headlines. Single weight — never bold, never italic. Inscriptional, like harbor stone.", "https://fonts.google.com/specimen/Marcellus", "FONTS.GOOGLE.COM/MARCELLUS"],
  ["var(--font-sans)", "Archivo", "Body and UI at normal width; expanded (125%) tracked caps for eyebrows, buttons, badges — the club-jacket voice.", "https://fonts.google.com/specimen/Archivo", "FONTS.GOOGLE.COM/ARCHIVO"],
  ["var(--font-mono)", "Space Mono", "The ship's log: coordinates, times, distances, wind. Data is decoration.", "https://fonts.google.com/specimen/Space+Mono", "FONTS.GOOGLE.COM/SPACE+MONO"],
];

/* The rooms of the house — names from brand.ts, roles annotated here. */
const ROOMS: Array<[keyof typeof SURFACES, string]> = [
  ["bridge", "The ops console"],
  ["gateway", "Live mode — the day underway"],
  ["openDeck", "The members' feed"],
  ["passbook", "The credential"],
  ["shoreside", "The shore office"],
  ["magazine", "The magazine — the ship's log, published"],
  ["agent", "The agent — shared brain of the ATLVS ecosystem"],
  ["gangway", "Arrivals — auth and vetting"],
  ["chandlery", "The shop"],
  ["galley", "Food and drink, aboard and ashore"],
];

const IMAGERY: Array<[string, string]> = [
  ["dawn", "Departures — first light, long shadows, rope and linen."],
  ["day", "Underway — water, sails, bodies in motion."],
  ["dusk", "Ashore — long tables, records on, the day's last brass light."],
];

const FACTS: Array<[string, string]> = [
  ["Founded", "MMXXIV · MARINA DEL REY, CALIFORNIA"],
  ["Home port", "33.9803° N — 118.4517° W"],
  ["What we run", "SEA DAYS ABOARD · PORT DAYS ASHORE"],
  ["Membership", "ACCESS · REGIONAL · NATIONAL · GLOBAL · GUEST — BY INVITATION OR APPLICATION"],
  ["Cadence", "LORE, SUNDAYS · SEASON II — THE WINE-DARK SEA"],
];

export default function BrandKitPage() {
  return (
    <CopyProvider>
      <div className="ls-container">
        <div className="bk-head">
          <div className="ls-eyebrow" style={{ color: "var(--brass-deep)", marginBottom: 16 }}>
            Press · Partners · Sponsors
          </div>
          <h1>The brand kit.</h1>
          <p style={{ color: "var(--text-2)", marginTop: 16, maxWidth: "56ch" }}>
            Everything needed to write about, partner with, or sponsor the club — the mark, the
            palette, the type, the voice, and the facts. Use it as given; the sea doesn&apos;t
            negotiate either.
          </p>
          <div className="bk-boiler">
            <p>{BOILER}</p>
            <CopyTextButton label="Boilerplate" text={BOILER} size="sm">Copy</CopyTextButton>
          </div>
        </div>

        <section className="bk-sec">
          <SectionHeader eyebrow="01 — The mark" title="The lyre, and the letters." />
          <div className="bk-lockups">
            <div className="bk-lock" style={{ background: "var(--surface-card)" }}>
              <span className="bk-wm">LYRE SOCIAL</span>
              <span className="cap">INLINE · MARCELLUS · TRACK .3EM</span>
            </div>
            <div className="bk-lock bk-lock--ink">
              <div className="bk-stack">
                <div className="a">LYRE</div>
                <div className="b">Social</div>
              </div>
              <span className="cap">STACKED · NEON DESCRIPTOR · DARK ONLY</span>
            </div>
          </div>
          <ul className="bk-rules">
            <li><b>The lyre is official.</b> Use the files in the logo kit — never redraw, fill, or restyle it.</li>
            <li><b>Clearspace:</b> one cap-height on all sides; nothing enters it.</li>
            <li><b>Colors:</b> paper on carbon, carbon on paper. Neon for the descriptor only.</li>
            <li><b>Never</b> bold, italicize, outline, gradient, or arc the mark.</li>
          </ul>
        </section>

        <section className="bk-sec">
          <SectionHeader
            eyebrow="02 — Color"
            title="Greyscale by default; neon is the only color."
            aside={<span className="ls-mono-data" style={{ color: "var(--text-3)" }}>CLICK ANY SWATCH TO COPY</span>}
          />
          <div className="bk-swlbl">The greys</div>
          <div className="bk-swgrid">
            {GREYS.map(([nm, hex, use, inv]) => (
              <Swatch key={hex} name={nm} hex={hex} use={use} onMedia={inv} />
            ))}
          </div>
          <div className="bk-swlbl">Paper &amp; smoke</div>
          <div className="bk-swgrid">
            {PAPERS.map(([nm, hex, use, inv]) => (
              <Swatch key={hex} name={nm} hex={hex} use={use} onMedia={inv} />
            ))}
          </div>
          <div className="bk-swlbl">The neon</div>
          <div className="bk-swgrid">
            {NEON.map(([nm, hex, use, inv]) => (
              <Swatch key={hex} name={nm} hex={hex} use={use} onMedia={inv} />
            ))}
          </div>
          <div className="bk-swlbl">The lavas</div>
          <div className="bk-lavas">
            {LAVAS.map(([nm, g, use]) => (
              <div className="bk-lava" key={nm}>
                <div className="bar" style={{ background: g }}></div>
                <div className="nm">{nm}</div>
                <div className="use">{use}</div>
              </div>
            ))}
          </div>
          <p className="bk-note">
            The master brand is greyscale brutalism — carbon, paper, steel hairlines — with neon
            lava gradients (cyan→violet→magenta) as the only color, spent one seam per view. A
            paper light theme ships via <b>data-theme=&quot;light&quot;</b>. Sea, Shore, and Sky
            are event themes that swap only the lava — each running daylight into its own night:
            sunlit aqua→midnight water, noon lime→night forest, golden hour→ultraviolet — over the
            same greys.
          </p>
        </section>

        <section className="bk-sec">
          <SectionHeader eyebrow="03 — Type" title="Three voices, one crew." />
          <div className="bk-typegrid">
            {TYPE_VOICES.map(([family, name, use, href, label]) => (
              <div className="bk-type" key={name}>
                <span className="aa" style={{ fontFamily: family }}>Aa</span>
                <h3>{name}</h3>
                <p className="use">{use}</p>
                <a className="lnk" href={href} target="_blank" rel="noreferrer">{label}</a>
              </div>
            ))}
          </div>
        </section>

        <section className="bk-sec">
          <SectionHeader eyebrow="04 — Voice" title="Assured, spare, mythic-modern." />
          <div className="bk-voice">
            <div>
              <div className="h">Say</div>
              <div className="ex">Passes are few by design.</div>
              <div className="ex">Come aboard. We&apos;ll handle the wind.</div>
              <div className="ex">Ashore at golden hour. Dress for salt.</div>
            </div>
            <div className="no">
              <div className="h">Never</div>
              <div className="ex">Don&apos;t miss out on this AMAZING event!</div>
              <div className="ex">We&apos;re so excited to announce…</div>
              <div className="ex">Ahoy matey! Set sail with us!</div>
            </div>
          </div>
          <div className="bk-lex">
            {["Sea Days", "Port Days", "The Manifest", "Passes", "Open Deck", "Knots", "Leagues", "Passbook", "Gateway", "the Bridge", "Shoreside", "LORE", "Aurora AI", "Aboard", "Weather Hold", "Gangway"].map((w) => (
              <Tag key={w}>{w}</Tag>
            ))}
          </div>
        </section>

        <section className="bk-sec bk-rooms">
          <SectionHeader eyebrow="05 — The rooms of the house" title="One house, many rooms." />
          <p className="bk-note" style={{ marginTop: 0 }}>
            Micro-brands never get their own logos, colors, or type — they are
            rooms in one house, spoken with the definite article and lowercase
            in prose. The only marks that exist: the lyre, the wordmark, and
            LORE&rsquo;s masthead (type-only).
          </p>
          <div className="bk-swlbl">The rooms</div>
          <div className="bk-facts">
            {ROOMS.map(([key, role]) => (
              <div className="row" key={key}>
                <span className="k">{SURFACES[key]}</span>
                <span className="bk-rooms__role">{role}</span>
              </div>
            ))}
          </div>
          <div className="bk-swlbl">The currency</div>
          <div className="bk-facts">
            <div className="row">
              <span className="k">
                {CURRENCY.name} · {CURRENCY.code}
              </span>
              <span className="bk-rooms__role">
                Earned on the water, never bought. {CURRENCY.line}
              </span>
            </div>
          </div>
          <div className="bk-swlbl">The leagues</div>
          <div className="bk-facts">
            {LEAGUES.map((l) => (
              <div className="row" key={l.league}>
                <span className="k">{l.name}</span>
                <span className="bk-rooms__role">
                  {l.months === 0 ? "From day one" : `${l.months} months aboard`}
                </span>
              </div>
            ))}
          </div>
          <div className="bk-swlbl">Event families</div>
          <div className="bk-facts">
            {(["sea", "shore"] as const).map((fam) => (
              <div className="row" key={fam}>
                <span className="k">
                  {CLASS_CODES[fam]} · {FAMILY_LABEL[fam]}
                </span>
                <span className="bk-rooms__role">
                  {fam === "sea" ? "Aboard — the day on the water" : "Ashore — the day on land"}
                </span>
              </div>
            ))}
          </div>
          <div className="bk-swlbl">The class ladder — both families</div>
          <div className="bk-facts">
            {Object.entries(SUB_CLASSES).map(([key, s]) => (
              <div className="row" key={key}>
                <span className="k">{s.label}</span>
                <span className="bk-rooms__role">{s.note}</span>
              </div>
            ))}
          </div>
          <div className="bk-swlbl">City codes</div>
          <p className="bk-rooms__cities">{Object.values(CITY_CODES).join(" · ")}</p>
          <p className="bk-note">
            Mono caps wherever coordinates and meta render; spelled-out names in
            prose. LAX is the brand&rsquo;s airport-code register for Los
            Angeles — cultural, not geographic.
          </p>
          <div className="bk-swlbl">The tagline</div>
          <div className="bk-facts">
            <div className="row">
              <span className="k">{TAGLINE}</span>
              <span className="bk-rooms__role">
                Lockup-adjacent only — hero, OG images, card backs, email
                footers. Never inline in body copy, never in UI chrome; a
                tagline is an accent, and each view gets one.
              </span>
            </div>
          </div>
          <p className="bk-note">
            &ldquo;dispatch&rdquo; and &ldquo;purser&rdquo; are literal words
            now, never brand names — you file a dispatch to LORE; a purser is
            nobody. Lowercase in prose, always.
          </p>
        </section>

        <section className="bk-sec">
          <SectionHeader
            eyebrow="06 — Imagery"
            title="Golden hour, film grain, salt."
            aside={<Badge tone="clay">Photography TK</Badge>}
          />
          <div className="bk-img">
            {IMAGERY.map(([k, cap]) => (
              <div key={k}>
                <div className="ph" style={{ background: SEAS[k] }}>
                  <span>IMAGERY TK — {k.toUpperCase()}</span>
                </div>
                <p className="cap">{cap}</p>
              </div>
            ))}
          </div>
          <p className="bk-note">
            When photography exists: warm and sun-washed, never cool or clinical stock. No
            illustration, no renders. Type sits over a bottom scrim, never over open detail.
          </p>
        </section>

        <section className="bk-sec" style={{ paddingBottom: 0 }}>
          <SectionHeader eyebrow="07 — The facts" title="For the record." />
          <div className="bk-facts">
            {FACTS.map(([k, v]) => (
              <div className="row" key={k}>
                <span className="k">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bk-dl">
        <div className="ls-container bk-dl__in">
          <div>
            <div className="ls-eyebrow" style={{ color: "var(--brass-bright)", marginBottom: 16 }}>
              Downloads &amp; contact
            </div>
            <h2>Take it with you.</h2>
            <p>
              Tokens and the logo kit ship today; photography follows once commissioned. For
              anything the kit doesn&apos;t answer, write us.
            </p>
            <div className="bk-dl__contact">
              PRESS — <a href={`mailto:${MAILBOX.press}`}>{MAILBOX.press.toUpperCase()}</a>
              <br />
              PARTNERSHIPS — <a href={`mailto:${MAILBOX.partners}`}>{MAILBOX.partners.toUpperCase()}</a>
            </div>
          </div>
          <div className="bk-dl__list">
            <a className="ls-btn ls-btn--brass ls-btn--md ls-btn--full" href="/brand/lyre-social-tokens.css" download>
              <Icon name="Download" size={15} />
              Color &amp; type tokens · CSS
            </a>
            <CopyTextButton label="Boilerplate" text={BOILER} variant="outline" inverse fullWidth>
              Boilerplate · copy text
            </CopyTextButton>
            <a className="ls-btn ls-btn--outline ls-btn--inverse ls-btn--md ls-btn--full" href="/brand/lyre-logo-kit.zip" download>
              Logo kit · 15 SVGs
            </a>
            <span className="ls-btn ls-btn--outline ls-btn--inverse ls-btn--md ls-btn--full" style={{ opacity: 0.4, pointerEvents: "none" }}>
              Photography · pending shoot
            </span>
          </div>
        </div>
      </section>
    </CopyProvider>
  );
}
