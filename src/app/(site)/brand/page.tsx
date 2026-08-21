import type { Metadata } from "next";
import { Badge, Tag, Icon } from "@/components/ds";
import { SectionHeader } from "@/components/site/section-header";
import { CITY_CODES, CLASS_CODES, CURRENCY, FAMILY_LABEL, LEAGUES, MAILBOX, SUB_BRANDS, SUB_CLASSES, SURFACES, TAGLINE, WORDMARK } from "@/lib/brand";
import { CopyProvider, CopyTextButton, Swatch } from "./copy-controls";
import "./brand.css";

export const metadata: Metadata = {
  title: "The brand kit",
  description:
    "The wordmark, the palette, the type, the voice, and the facts — everything needed to write about, partner with, or sponsor the show.",
};

const BOILER =
  "SYRIUS SOCIAL is the unscripted social experiment — a reality-format social club running Charters on the water and Tables ashore, cameras from boarding to docking. Real people, real chemistry, filmed and unfiltered, wrapped in charter-grade luxury. Two sub-brands sail under the umbrella: Syrius Dating and Syrius Yacht Club. Casting is by application or invitation.";

const SEAS: Record<string, string> = {
  dawn: "var(--scene-gold)",
  day: "var(--scene-night)",
  dusk: "var(--scene-rose)",
};

const NOIRS: Array<[string, string, string, boolean]> = [
  ["Noir 950", "#0B0E12", "sunken fields", true],
  ["Noir 900", "#101418", "the page", true],
  ["Noir 800", "#161B21", "cards", true],
  ["Noir 700", "#1E252D", "raised", true],
];
const IVORIES: Array<[string, string, string, boolean]> = [
  ["Ivory 50", "#FAF7F0", "paper cards", false],
  ["Ivory 100", "#F4EFE6", "text, paper page", false],
  ["Ivory 500", "#C9C0AC", "secondary", false],
  ["Muted", "#9AA3AD", "muted text", false],
];
const METALS: Array<[string, string, string, boolean]> = [
  ["Gold 500", "#B98A2F", "the accent", false],
  ["Gold 400", "#D3B15E", "hover, focus, live", false],
  ["Rose 500", "#FF5C7A", "Syrius Dating", true],
  ["Riviera 500", "#2E9BB5", "Syrius Yacht Club", true],
];
const GRADIENTS: Array<[string, string, string]> = [
  ["Gold", "linear-gradient(120deg,#E3C983,#B98A2F)", "hero rules and small fills"],
  ["Scene gold", "linear-gradient(165deg,#E3C983 0%,#B98A2F 35%,#3C2F1A 75%,#101418 100%)", "imagery TK — golden hour"],
  ["Scene night", "linear-gradient(165deg,#2E9BB5 0%,#173B4E 45%,#0B0E12 100%)", "imagery TK — on the water"],
  ["Scene rose", "linear-gradient(165deg,#FF7D95 0%,#8E2E4C 45%,#14090F 100%)", "imagery TK — after sunset"],
];

const TYPE_VOICES: Array<[string, string, string, string, string]> = [
  ["var(--font-display)", "Marcellus", "Display and headlines. Single weight — never bold, never italic. Cinematic, like a title card.", "https://fonts.google.com/specimen/Marcellus", "FONTS.GOOGLE.COM/MARCELLUS"],
  ["var(--font-sans)", "Jost", "Body and UI, 300–600. Sentence case everywhere — the producer speaks plainly.", "https://fonts.google.com/specimen/Jost", "FONTS.GOOGLE.COM/JOST"],
  ["var(--font-mono)", "Space Mono", "The call sheet: coordinates, times, cabin counts. Data is decoration.", "https://fonts.google.com/specimen/Space+Mono", "FONTS.GOOGLE.COM/SPACE+MONO"],
];

/* The rooms of the house — names from brand.ts, roles annotated here. */
const ROOMS: Array<[keyof typeof SURFACES, string]> = [
  ["bridge", "The crew console"],
  ["gateway", "Live mode — the charter underway"],
  ["openDeck", "The cast's feed — the confession booth"],
  ["passbook", "The credential, with its rotating code"],
  ["shoreside", "The crew desk ashore"],
  ["magazine", "What the cameras kept, published"],
  ["agent", "Confirm-first assistant — it proposes, you confirm; money always asks"],
  ["gangway", "Arrivals — sign-in and casting"],
  ["chandlery", "The shop"],
  ["galley", "Food and drink, aboard and ashore"],
];

const IMAGERY: Array<[string, string]> = [
  ["dawn", "Golden hour — gold on water, the day's last warm light."],
  ["day", "Underway — riviera water, sails, bodies in motion."],
  ["dusk", "After sunset — night-deck flash, candid, a little grainy."],
];

const FACTS: Array<[string, string]> = [
  ["Founded", "MMXXVI · MARINA DEL REY, CALIFORNIA"],
  ["Home port", "33.9803° N — 118.4517° W"],
  ["What we run", "CHARTERS ABOARD · TABLES ASHORE · CAMERAS ON"],
  ["Casting", "ACCESS · REGIONAL · NATIONAL · GLOBAL · GUEST — BY APPLICATION OR INVITATION"],
  ["Cadence", "EPISODES, SUNDAYS · SEASON I — CASTING NOW"],
];

export default function BrandKitPage() {
  return (
    <CopyProvider>
      <div className="ls-container">
        <div className="bk-head">
          <div className="ls-eyebrow" style={{ color: "var(--gold-deep)", marginBottom: 16 }}>
            Press · Partners · Sponsors
          </div>
          <h1>The brand kit.</h1>
          <p style={{ color: "var(--text-2)", marginTop: 16, maxWidth: "56ch" }}>
            Everything needed to write about, partner with, or sponsor the show —
            the wordmark, the palette, the type, the voice, and the facts. Use it
            as given; the cameras don&apos;t negotiate either.
          </p>
          <div className="bk-boiler">
            <p>{BOILER}</p>
            <CopyTextButton label="Boilerplate" text={BOILER} size="sm">Copy</CopyTextButton>
          </div>
        </div>

        <section className="bk-sec">
          <SectionHeader eyebrow="01 — The wordmark" title="Type only. There is no logo." />
          <div className="bk-lockups">
            <div className="bk-lock" style={{ background: "var(--surface-card)" }}>
              <span className="bk-wm">{WORDMARK}</span>
              <span className="cap">INLINE · MARCELLUS · TRACK .14EM · GOLD RULE BENEATH</span>
            </div>
            <div className="bk-lock bk-lock--ink">
              <div className="bk-stack">
                <div className="a">SYRIUS</div>
                <div className="b">Social</div>
              </div>
              <span className="cap">STACKED · MONOGRAM STANDARD · NOIR ONLY</span>
            </div>
          </div>
          <ul className="bk-rules">
            <li><b>No logo exists.</b> The wordmark is set in plain type. Never draw, generate, or commission a mark.</li>
            <li><b>Clearspace:</b> one cap-height on all sides; nothing enters it.</li>
            <li><b>Colors:</b> ivory on noir, noir on ivory. Gold for the rule beneath, nothing else.</li>
            <li><b>Never</b> bold, italicize, outline, gradient, or arc the letters.</li>
          </ul>
        </section>

        <section className="bk-sec">
          <SectionHeader
            eyebrow="02 — Color"
            title="Noir by default; one metal per view."
            aside={<span className="ls-mono-data" style={{ color: "var(--text-3)" }}>CLICK ANY SWATCH TO COPY</span>}
          />
          <div className="bk-swlbl">The noir</div>
          <div className="bk-swgrid">
            {NOIRS.map(([nm, hex, use, inv]) => (
              <Swatch key={hex} name={nm} hex={hex} use={use} onMedia={inv} />
            ))}
          </div>
          <div className="bk-swlbl">Ivory &amp; smoke — never pure white; it blooms on camera</div>
          <div className="bk-swgrid">
            {IVORIES.map(([nm, hex, use, inv]) => (
              <Swatch key={hex} name={nm} hex={hex} use={use} onMedia={inv} />
            ))}
          </div>
          <div className="bk-swlbl">The metals</div>
          <div className="bk-swgrid">
            {METALS.map(([nm, hex, use, inv]) => (
              <Swatch key={hex} name={nm} hex={hex} use={use} onMedia={inv} />
            ))}
          </div>
          <div className="bk-swlbl">Gradients &amp; scenes</div>
          <div className="bk-lavas">
            {GRADIENTS.map(([nm, g, use]) => (
              <div className="bk-lava" key={nm}>
                <div className="bar" style={{ background: g }}></div>
                <div className="nm">{nm}</div>
                <div className="use">{use}</div>
              </div>
            ))}
          </div>
          <p className="bk-note">
            The umbrella brand is noir and antique gold — one metallic accent per
            view, hover lightens, press darkens, never shrinks. Sub-brands swap
            the accent only: Syrius Dating runs rose, Syrius Yacht Club runs
            riviera — never their own type or surfaces. One stage, different
            spotlights. A paper light theme ships via{" "}
            <b>data-theme=&quot;light&quot;</b>, where every metal deepens for
            contrast. Scene gradients stand in wherever photography belongs,
            always labeled IMAGERY TK.
          </p>
        </section>

        <section className="bk-sec">
          <SectionHeader eyebrow="03 — Type" title="Three voices, one show." />
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
          <SectionHeader eyebrow="04 — Voice" title="A producer who respects the audience." />
          <div className="bk-voice">
            <div>
              <div className="h">Say</div>
              <div className="ex">No scripts. No second takes.</div>
              <div className="ex">The cameras are on. So is the bar.</div>
              <div className="ex">12 cabins. 200 applicants.</div>
            </div>
            <div className="no">
              <div className="h">Never</div>
              <div className="ex">Don&apos;t miss this AMAZING night&hellip; (never shout)</div>
              <div className="ex">We&apos;re so excited to announce&hellip;</div>
              <div className="ex">Any emoji, anywhere, ever.</div>
            </div>
          </div>
          <p className="bk-note">
            Present tense, sentence case. &ldquo;You&rdquo; is the guest,
            &ldquo;we&rdquo; is the crew; cast are first names only. Scarcity is
            stated flatly, never hyped. Numbers, coordinates, and timestamps set
            in Space Mono — 38°54′N 1°26′E.
          </p>
          <div className="bk-lex">
            {["Charters", "Tables", "The Manifest", "Passes", "Cabins", "The Booth", "Knots", "Leagues", "Marks", "Regattas", "Member Card", "Live", "the Bridge", "Shoreside", "Episodes", "The Producer", "Aboard", "Weather Hold", "The Gangway"].map((w) => (
              <Tag key={w}>{w}</Tag>
            ))}
          </div>
        </section>

        <section className="bk-sec bk-rooms">
          <SectionHeader eyebrow="05 — One stage, different spotlights" title="The umbrella and its rooms." />
          <p className="bk-note" style={{ marginTop: 0 }}>
            Sub-brands never get their own logos, colors beyond the accent, or
            type — they are spotlights on one stage. Rooms are spoken with the
            definite article and lowercase in prose. The only marks that exist
            are type-set: the wordmark and the Episodes masthead.
          </p>
          <div className="bk-swlbl">The sub-brands</div>
          <div className="bk-facts">
            {Object.values(SUB_BRANDS).map((b) => (
              <div className="row" key={b.handle}>
                <span className="k">{b.name}</span>
                <span className="bk-rooms__role">{b.handle} · accent: {b.accent}</span>
              </div>
            ))}
          </div>
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
                  {fam === "sea"
                    ? "Aboard — Syrius Yacht Club, riviera accent"
                    : "Ashore — Syrius Dating's Thursday format, rose accent"}
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
        </section>

        <section className="bk-sec">
          <SectionHeader
            eyebrow="06 — Imagery"
            title="Warm, candid, grainy night-flash."
            aside={<Badge tone="caution">Photography TK</Badge>}
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
            When photography exists: warm, candid, slightly grainy — night-deck
            flash, not stock lifestyle. No illustration, no renders. Type sits
            over a bottom scrim, never over open detail.
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
            <div className="ls-eyebrow" style={{ color: "var(--gold-bright)", marginBottom: 16 }}>
              Downloads &amp; contact
            </div>
            <h2>Take it with you.</h2>
            <p>
              Tokens ship today; photography follows once commissioned. There is
              no logo kit, and there never will be one — the wordmark is type.
              For anything the kit doesn&apos;t answer, write us.
            </p>
            <div className="bk-dl__contact">
              PRESS — <a href={`mailto:${MAILBOX.press}`}>{MAILBOX.press.toUpperCase()}</a>
              <br />
              PARTNERSHIPS — <a href={`mailto:${MAILBOX.partners}`}>{MAILBOX.partners.toUpperCase()}</a>
            </div>
          </div>
          <div className="bk-dl__list">
            <a className="ls-btn ls-btn--gold ls-btn--md ls-btn--full" href="/brand/syrius-social-tokens.css" download>
              <Icon name="Download" size={15} />
              Color &amp; type tokens · CSS
            </a>
            <CopyTextButton label="Boilerplate" text={BOILER} variant="outline" inverse fullWidth>
              Boilerplate · copy text
            </CopyTextButton>
            <span className="ls-btn ls-btn--outline ls-btn--inverse ls-btn--md ls-btn--full" style={{ opacity: 0.4, pointerEvents: "none" }}>
              Photography · pending shoot
            </span>
          </div>
        </div>
      </section>
    </CopyProvider>
  );
}
