import type { Metadata } from "next";
import { Badge, Tag, Icon } from "@/components/ds";
import { SectionHeader } from "@/components/site/section-header";
import { ANCHOR, CITY_CODES, CURRENCY, DIVISION_IDS, DIVISIONS, EXPERIENCE_CLASSES, EXPERIENCE_CLASS_IDS, HANDLE, LEAGUES, MAILBOX, PLACE, SETTING_LABEL, SUB_CLASSES, SURFACES, TAGLINE, EST_YEAR_ROMAN, lockup } from "@/lib/brand";
import { Wordmark } from "@/components/ds";
import { CopyProvider, CopyTextButton, Swatch } from "./copy-controls";
import "./brand.css";

export const metadata: Metadata = {
  alternates: { canonical: "/brand" },
  title: "The brand kit",
  description:
    "The wordmark, the palette, the type, the voice, and the facts — everything needed to write about, partner with, or sponsor the show.",
};

/* The boilerplate press copies verbatim, so it has to be the thing a query can
   settle. It described a weekly yacht charter and stopped there, which named
   twelve of the season's fifty-two episodes and left the four other series —
   most of the club, and most of what happens ashore — unmentioned.

   CAPACITY, PENDING OWNER CONFIRMATION: forty is the seeded fleet, four yachts
   at ten passes each, and the figure this boilerplate has always carried. The
   operating playbook models 100 guests for the flagship. Three other public
   surfaces state the same number and carry the same note — the homepage hero,
   the homepage closing band, and the site description in src/app/layout.tsx. */
const BOILER =
  "[un] is a social club, filmed. Season I runs fifty-two episodes out of Miami, 4 September 2026 to 29 August 2027, across five series: Anchor on the water, Off Soundings past the city limits, Night Watch after hours, Even Keel for fitness and wellness, and Showboat for entertainment. The flagship sails a flotilla of four yachts, forty aboard. Six divisions share one anchor and swap the accent only: [un] Hinged, [un] Bound, [un] Limited, [un] Scripted, [un] Cut and [un] Brand. Membership is by application or invitation. No scripts. No second takes.";

const SEAS: Record<string, string> = {
  dawn: "var(--scene-golden)",
  day: "var(--scene-biscayne)",
  dusk: "var(--scene-crimson)",
};

/* Hexes, not tokens: a swatch that paints with var(--noir-900) shows the reader
   the colour but has nothing to put on the clipboard, and the whole point of
   this grid is that it copies. Every value below is transcribed from the palette
   — the greyscale from src/styles/tokens.css, the accent and the division hues
   from src/styles/palette.css, which is where the Option C decisions live until
   the handoff package is regenerated — and has to be re-transcribed when either
   moves. This page is the one place in src permitted to hold a second copy, and
   the cost of that permission is that it goes stale silently: it held the
   retired acid and synthwave values for a full palette cycle. */
const NOIRS: Array<[string, string, string, boolean]> = [
  ["Noir 950", "#0D0D0D", "sunken fields", true],
  ["Noir 900", "#141414", "ink page, body text", true],
  ["Noir 800", "#1C1C1C", "cards on ink", true],
  ["Noir 700", "#262626", "raised", true],
];
const IVORIES: Array<[string, string, string, boolean]> = [
  ["Page", "#EDEDEA", "the paper page", false],
  ["Ivory 50", "#F7F7F4", "paper cards", false],
  ["Ivory 100", "#F1F1ED", "type on ink", false],
  ["Ivory 500", "#BCBCB3", "secondary", false],
];
/* THE HOUSE ACCENT HAS NO HUE. It was acid green, and the reason it is not any
   more is measurable rather than a matter of taste: acid sat at OKLCH hue 140.4
   and --positive on the ink theme at 140.2, so the house colour and the success
   state were the same colour under two token names. An accent appears beside
   whichever division is on screen — links, focus rings, seams, progress — so any
   saturated house colour competes permanently with the identity system. It is
   now ink on paper and ivory on ink, which is how [un] Brand, the sixth
   division, has always worked.

   There is no Shop swatch any more. Commerce is retired as a hue: the Shop is
   the sales channel, not the maker, and its products carry the hosting
   division's mark, so a channel with no mark of its own needs no accent.
   --brand-shop still resolves — to ink — so nothing breaks, but nothing should
   reach for it as a colour.

   Then the division hues — five of them: [un] Brand carries no hue and no token,
   so it has no swatch to copy. Division hues name a club and nothing else:
   operational state — Five-A phase, run-of-show position, procurement status —
   is set in numerals on the greyscale, never in one of these. Status colours are
   the only exception and override them. */
const ACCENTS: Array<[string, string, string, boolean]> = [
  ["Accent", "#141414", "the house accent on paper — one per view", true],
  ["Accent hover", "#0D0D0D", "hover deepens; press goes to #000000", true],
  ["Accent on ink", "#F1F1ED", "the same accent, inverted for the ink theme", false],
];
/* The five moved to one cool arc, 41 degrees apart, at IDENTICAL lightness and
   chroma. The old ramp ran L 0.447 to 0.751, so an [un] Limited page was three
   times brighter than an [un] Bound page for the same element — the accent, the
   brightness and the saturation all changed at once, when brand.ts promises a
   division "swaps the accent and nothing else". Now one number changes. Their
   old values — #F72585, #7209B7, #FF8C00, #4361EE, #B5179E — are gone; anything
   still quoting a magenta or an amber for a division is quoting the old kit. */
const DIVISION_SWATCHES: Array<[string, string, string, boolean]> = [
  ["Hinged", "#A55779", "muted plum — singles social", true],
  ["Bound", "#5E6FB5", "slate indigo — couples", true],
  ["Limited", "#0D7FA9", "deep cerulean — premium", true],
  ["Scripted", "#048681", "teal — content series", true],
  ["Cut", "#8B60A2", "muted violet — the ungraded channel", true],
];
/* The swatches read the TOKENS rather than restating their values. They used to
   carry the gradient inline, which meant this page — the reference for what a
   scene looks like — showed something the token does not produce: every
   --scene-* is layered over var(--texture-grain), and the literals here had no
   grain in them. A reference that can drift from the thing it documents is
   worse than no reference. Night and rose are shown too; they were defined,
   documented in readme as imagery placeholders, and rendered nowhere. */
const GRADIENTS: Array<[string, string, string]> = [
  /* Two different tokens, and the row used to conflate them. --gradient-outrun
     is the canonical hero ground. --gradient-accent is NOT a gradient any more
     and is left in this grid to say so: its two stops were 1.5 degrees of hue
     apart, so five surfaces paid gradient cost to render what the eye read as a
     flat fill, and with the accent's hue gone there is not even a pair left to
     interpolate. It is a flat fill, and this row shows a flat bar. */
  ["Outrun", "var(--gradient-outrun)", "the canonical hero ground"],
  ["Accent", "var(--gradient-accent)", "a flat fill, not a gradient — seams and rules"],
  ["Scene golden", "var(--scene-golden)", "imagery TK — golden hour"],
  ["Scene biscayne", "var(--scene-biscayne)", "imagery TK — on the water"],
  ["Scene noir", "var(--scene-noir)", "type-led surfaces — stubs, documents, notices"],
  ["Scene night", "var(--scene-night)", "imagery TK — after dark"],
  ["Scene rose", "var(--scene-rose)", "imagery TK — the shore rooms"],
];

const TYPE_VOICES: Array<[string, string, string, string, string]> = [
  ["var(--font-display)", "Anton", "Display and headlines, 22px and up only, set to caps by text-transform so the copy stays editable and translatable. Below 22px a heading is Archivo 700.", "https://fonts.google.com/specimen/Anton", "FONTS.GOOGLE.COM/ANTON"],
  ["var(--font-body)", "Archivo", "Body and UI. Three weights, 400 · 500 · 700, and no others. Sentence case everywhere.", "https://fonts.google.com/specimen/Archivo", "FONTS.GOOGLE.COM/ARCHIVO"],
  ["var(--font-mono)", "Space Mono", "Labels, data, and the division suffix at 1.27 of the bracket size — cap-height matched to the Anton brackets. Coordinates, times, counts.", "https://fonts.google.com/specimen/Space+Mono", "FONTS.GOOGLE.COM/SPACE+MONO"],
  ["var(--font-editorial)", "Instrument Serif", "Editorial only — campaign headlines and deck openers, italic, sentence case. Never in UI, never in navigation.", "https://fonts.google.com/specimen/Instrument+Serif", "FONTS.GOOGLE.COM/INSTRUMENT+SERIF"],
];

/* The rooms of the house — names from brand.ts, roles annotated here. */
const ROOMS: Array<[keyof typeof SURFACES, string]> = [
  ["bridge", "The crew console"],
  ["gateway", "Live mode — the episode underway"],
  ["openDeck", "The cast's feed — the confession booth"],
  ["passbook", "The credential, with its rotating code"],
  ["shoreside", "The crew desk ashore"],
  ["magazine", "What the cameras kept, published"],
  ["agent", "Confirm-first assistant — it proposes, you confirm; money always asks"],
  ["gangway", "Arrivals — sign-in and casting"],
  ["shop", "Merch and drops — carries the hosting division\u2019s mark"],
  ["galley", "Food and drink, aboard and ashore"],
];

const IMAGERY: Array<[string, string]> = [
  ["dawn", "Golden hour — gold on water, the day's last warm light."],
  ["day", "Underway — riviera water, sails, bodies in motion."],
  ["dusk", "After sunset — night-deck flash, candid, a little grainy."],
];

const FACTS: Array<[string, string]> = [
  ["Founded", `${EST_YEAR_ROMAN} · MIAMI, FLORIDA`],
  /* One row split in two with the City rename: the club's market and the place
     an episode actually happens were being read off the same line, which is the
     confusion the rename exists to end. */
  [`Home ${PLACE.market.toLowerCase()}`, "MIAMI, FLORIDA"],
  [`Home ${PLACE.venue.toLowerCase()}`, "HAULOVER SANDBAR"],
  ["Handle", HANDLE.toUpperCase()],
  /* Was TABLES ASHORE, which named one format and stood for four series and
     thirty-four episodes. The row now says what the season actually is. */
  ["What we run", "FIVE SERIES · EPISODES AFLOAT AND ASHORE · CAMERAS ON"],
  ["Casting", "ACCESS · REGIONAL · NATIONAL · GLOBAL · GUEST — BY APPLICATION OR INVITATION"],
  /* Was EPISODES, SUNDAYS. Season I opens on Friday 4 September 2026 and runs
     every day of the week except Monday — nine of the fifty-two are Sundays.
     A cadence row that states a day the calendar does not keep is worse than
     one that states the span, so it states the span. */
  ["Cadence", "52 EPISODES · 4 SEP MMXXVI – 29 AUG MMXXVII · SEASON I — NOW CASTING"],
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
          {/* The one page guaranteed to be read out of order — press want the
              facts, a partner wants the colour — and it was a 434-line scroll
              with no way in. The 96-line legal page had anchors and this did
              not. Same rail, same class. */}
          <nav className="lg-anchors" aria-label="The brand kit">
            <a href="#wordmark">01 Wordmark</a>
            <a href="#color">02 Color</a>
            <a href="#type">03 Type</a>
            <a href="#voice">04 Voice</a>
            <a href="#rooms">05 Rooms</a>
            <a href="#imagery">06 Imagery</a>
            <a href="#facts">07 The facts</a>
          </nav>
        </div>

        <section id="wordmark" className="bk-sec">
          <SectionHeader eyebrow="01 — The wordmark" title="Type only. There is no logo." />
          <div className="bk-lockups">
            <div className="bk-lock" style={{ background: "var(--surface-card)" }}>
              <Wordmark size={36} suffix={null} />
              <span className="cap">SYSTEM A · PARENT ANCHOR · ANTON · BRACKETS ARE THE MARK</span>
            </div>
            <div className="bk-lock bk-lock--ink">
              <Wordmark size={36} suffix="Hinged" sub="SINGLES SOCIAL CLUB" inverse />
              <span className="cap">SYSTEM B · SUFFIX SPACE MONO 700 AT 1.27 OF THE BRACKET, CAP-HEIGHT MATCHED · SUB LINE MONO, .42EM</span>
            </div>
          </div>
          <ul className="bk-rules">
            <li><b>No logo exists.</b> The wordmark is set in plain type. Never draw, generate, or commission a mark.</li>
            <li><b>The brackets are part of the mark.</b> Never dropped, restyled, recoloured, or spaced out. The one bracketless setting is embroidery below 8 mm.</li>
            <li><b>Case:</b> {ANCHOR} is typed lowercase, always — the case is part of the mark. The suffix is sentence case. Two sanctioned suffix variants only — serif italic lowercase for campaigns, mono all caps for large physical goods; the anchor never changes with them. Plain-sans lowercase is never permitted for the suffix.</li>
            <li><b>Never a suffix without the anchor,</b> and never two suffixes in one lockup.</li>
            <li><b>Clearspace:</b> one cap-height of the U on all sides, measured from the outer bracket edge; nothing enters it.</li>
            <li><b>Colours:</b> the anchor is always ink or ivory. Only the sub line and the rule carry accent.</li>
            <li><b>Minimum size:</b> 16px digital, 8 mm embroidered. Below that the mark reduces to {ANCHOR} alone.</li>
          </ul>
        </section>

        <section id="color" className="bk-sec">
          <SectionHeader
            eyebrow="02 — Color"
            title="Paper by default; one accent per view."
            aside={<span className="ls-mono-data" style={{ color: "var(--text-3)" }}>CLICK ANY SWATCH TO COPY</span>}
          />
          <div className="bk-swlbl">The noir — the ink theme and every knockout ground</div>
          <div className="bk-swgrid">
            {NOIRS.map(([nm, hex, use, inv]) => (
              <Swatch key={hex} name={nm} hex={hex} use={use} onMedia={inv} />
            ))}
          </div>
          <div className="bk-swlbl">Paper &amp; ivory — page surfaces stay greyscale</div>
          <div className="bk-swgrid">
            {IVORIES.map(([nm, hex, use, inv]) => (
              <Swatch key={hex} name={nm} hex={hex} use={use} onMedia={inv} />
            ))}
          </div>
          <div className="bk-swlbl">The house accent — no hue: ink on paper, ivory on ink</div>
          <div className="bk-swgrid">
            {ACCENTS.map(([nm, hex, use, inv]) => (
              <Swatch key={hex} name={nm} hex={hex} use={use} onMedia={inv} />
            ))}
          </div>
          <div className="bk-swlbl">The division hues — identity only, never state</div>
          <div className="bk-swgrid">
            {DIVISION_SWATCHES.map(([nm, hex, use, inv]) => (
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
            Page surfaces are paper-first greyscale, and the house accent has no
            hue at all: it is ink on paper and ivory on ink, one per view, and it
            deepens on press rather than shrinking. That is deliberate. An accent
            sits beside whichever division is on screen — in links, focus rings,
            seams and progress — so a house colour with a hue competes
            permanently with the identity system, and the acid green it replaces
            was in any case the same colour as the success state under a second
            name. Removing it gives the divisions the only saturated voice on the
            page. The five division hues sit on one cool arc at matched lightness,
            so a division swaps the accent and nothing else: never its own type,
            never its own surfaces, never its own brightness. One stage,
            different spotlights. They are reserved for identity and never encode
            operational state; only positive, caution and danger override them,
            and commerce is not a hue — the Shop carries the hosting division&rsquo;s
            mark. An ink theme ships via <b>data-theme=&quot;dark&quot;</b>, which
            is the light/ink switch and carries nothing else — never a setting,
            never a division. Scene gradients stand in wherever photography
            belongs, always labeled IMAGERY TK.
          </p>
        </section>

        <section id="type" className="bk-sec">
          <SectionHeader eyebrow="03 — Type" title="Four voices, one stage." />
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

        <section id="voice" className="bk-sec">
          <SectionHeader eyebrow="04 — Voice" title="A producer who respects the audience." />
          <div className="bk-voice">
            <div>
              <div className="h">Say</div>
              <div className="ex">No scripts. No second takes.</div>
              <div className="ex">The cameras are on. So is the bar.</div>
              {/* The specimen has to match the page it is a specimen of — the
                  homepage band said 12 cabins and now says 40 aboard. */}
              <div className="ex">40 aboard. 200 applicants.</div>
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
            in Space Mono — 25°46′N 80°12′W.
            {/* The specimen coordinate was 38°54′N 1°26′E, which is Ibiza — a
                place the club does not run. A worked example on the reference
                page is the one that gets copied, so it is the home city's. */}
          </p>
          {/* The lexicon is the list a writer works from, so a gap here is a
              writer reaching for a word the product does not use. It was
              missing every noun the 2026-09 renames introduced — Series,
              Edition, Season, Special, City, Venue, Home Port, Itinerary,
              Tonight, Portal, The Shop — and all five Season I series names,
              while still listing Tables, whose family label went with the
              two-axis taxonomy. Table now means one thing only, the blind
              dinner for six, which is a format and not a word in the register.
              Ordered: what the club runs, the five strands, then the rooms and
              the ledger. */}
          <div className="bk-lex">
            {["Episodes", "Series", "Season", "Edition", "Special", "City", "Venue", "Home Port", "Itinerary", "The Manifest", "Passes", "Cabins", "Aboard", "Weather Hold", "Anchor", "Off Soundings", "Night Watch", "Even Keel", "Showboat", "Live", "Tonight", "Open Deck", "Portal", "Member Card", "The Gangway", "the Bridge", "Shoreside", "The Producer", "The Log", "The Shop", "Knots", "Leagues", "Marks", "Regattas"].map((w) => (
              <Tag key={w}>{w}</Tag>
            ))}
          </div>
        </section>

        <section id="rooms" className="bk-sec bk-rooms">
          <SectionHeader eyebrow="05 — One stage, different spotlights" title="The umbrella and its rooms." />
          <p className="bk-note" style={{ marginTop: 0 }}>
            Divisions never get their own logos, colours beyond the accent, or
            type — they are spotlights on one stage. Rooms are spoken with the
            definite article and lowercase in prose. The only marks that exist
            are type-set: the wordmark and The Log masthead. One handle
            covers every division: {HANDLE}.
          </p>
          <div className="bk-swlbl">The six divisions</div>
          <div className="bk-facts">
            {DIVISION_IDS.map((id) => (
              <div className="row" key={id}>
                <span className="k">{lockup(id)}</span>
                <span className="bk-rooms__role">
                  {/* [un] Brand hosts no experiences — no categories to list,
                      and a dangling separator is a word for a missing value. */}
                  {DIVISIONS[id].categories.length > 0
                    ? `${DIVISIONS[id].what} · ${DIVISIONS[id].categories.join(" · ")}`
                    : DIVISIONS[id].what}
                </span>
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
                Earned on the night, never bought. {CURRENCY.line}
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
          {/* Two axes, because there were always two facts. The old single
              family row tangled where a thing happens with how far the club
              goes, which is why a pool social could not be filed at all. */}
          <div className="bk-swlbl">Setting — where it happens</div>
          <div className="bk-facts">
            {(["sea", "shore"] as const).map((setting) => (
              <div className="row" key={setting}>
                <span className="k">{SETTING_LABEL[setting]}</span>
                <span className="bk-rooms__role">
                  {setting === "sea"
                    ? `On the water — ${lockup("limited")}, amber accent. Hulls, holds and muster apply here.`
                    : `On land — ${lockup("scripted")}, cobalt accent. Only ashore admits an unvetted guest.`}
                </span>
              </div>
            ))}
          </div>
          <div className="bk-swlbl">Experience class — what kind of thing it is</div>
          <div className="bk-facts">
            {EXPERIENCE_CLASS_IDS.map((id) => (
              <div className="row" key={id}>
                <span className="k">{EXPERIENCE_CLASSES[id].label}</span>
                <span className="bk-rooms__role">{EXPERIENCE_CLASSES[id].what}</span>
              </div>
            ))}
          </div>
          <div className="bk-swlbl">Duration — either setting, any class</div>
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

        <section id="imagery" className="bk-sec">
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

        <section id="facts" className="bk-sec" style={{ paddingBottom: 0 }}>
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
            <a className="ls-btn ls-btn--gold ls-btn--md ls-btn--full" href="/brand/un-tokens.css" download>
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
