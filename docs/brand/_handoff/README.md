# [un] — Design System

**Umbrella brand:** [un] — the parent · **Tagline:** *Anything goes here*
**Divisions:** [un] Hinged (Singles Social Club) · [un] Bound (Alternative Lifestyle Social Club) · [un] Limited (Premium Social Club) · [un] Scripted (pop-up dating, matchmaking, mixers) · [un] Cut (members-only media) — one handle and domain: **@unhingedsocial.us**
**Anchor:** `[un]` — a static bracketed parent mark plus a sentence-case suffix. See `brand-architecture.md`.

A global nautical social club. The anchor product is a weekly 7-hour sailing out of Miami — Trident 512 pontoon, 40 vetted guests, Haulover Sandbar, Shore Leave afterparty — wired to a vetting app and a media engine. Primary audience is vetted singles 25–45; open-minded and alternative-lifestyle couples are a first-class second audience. Operational spec: `operations.md`. Production element taxonomy: `element-schema.md`.

## Sources
- **[un] Social design system** (uploaded copy at `uploads/[un] Social Design System/`; original: https://claude.ai/design/p/104a67a5-5850-4b00-8def-10dec7d5f9ec) — used as the scope template: its full component inventory is recreated here.
- **GitHub — ghxstship/apollo** (`main`; the [un] production codebase, more current than the DS) — component APIs mirror `src/components/ds/`; see `github.md`.
No UNHINGED logo, fonts, photography, or Figma were provided. **No logo exists**: the wordmark is set in plain type (`Wordmark` component). Fonts are Google Fonts substitutions. [un]'s visual style was NOT copied — UNHINGED has its own identity: contemporary greyscale, vintage grain, bold acid-green accent, brutalist type; only component inventory and API contracts carry over (tones mapped: brass→acid, laurel→positive, clay→caution, siren→danger).

## Brand architecture
`[un]` is the parent. Six divisions carry the anchor plus a sentence-case suffix; each swaps the accent only — never type, never surfaces.

- **[un] Hinged** — Singles Social Club. Acid green `--brand-hinged`. Sea and Port formats.
- **[un] Bound** — Open and alternative lifestyle couples social. Violet `--brand-bound`. Port and Premium formats.
- **[un] Limited** — Premium experiences. Champagne `--brand-limited`. Private charters, VIP, member gatherings.
- **[un] Scripted** — Social content series: pop-up dating, matchmaking, mixers. Flare pink `--brand-scripted`.
- **[un] Cut** — BTS and founder-led content series. Bone `--brand-cut` — no hue; ivory on ink, ink on paper, so it inverts rather than tints.
- **[un] Brand** — Nautical lifestyle, fashion, and gear. No accent and no token — ink on paper, ivory on ink; the products speak for themselves.

**Shop** carries merch and drops in sun orange (`--brand-shop`) — the sales channel, not the maker. Products carry the **[un] Brand** mark; event and season drops may carry their division's mark instead.

Activity categories (**Sea** · **Port** · **Premium**) determine which division and accent an experience carries. Full rules: `brand-architecture.md`.

## Business model
- **Anchor experience:** weekly sailing, Miami. Trident 512 USCG-certified pontoon, max 40 passengers + crew. 11:00 pre-boarding social → 12:00 departure → 14:00 Haulover Sandbar → 17:00 sunset cruise (Radar locks 17:30) → 18:00 dock → 19:00 Shore Leave.
- **Ratio gate:** 40 passengers, either 20/20 (singles capped 10 male / 10 female) or 10 couples + 20 singles. The engine refuses sales that break composition; capacity is always shown **by segment**.
- **Products:** Single Pass $350 · Couples Pass $650 · Club Lifestyle Membership $2,500/quarter (capped at 20 active) · VIP Pontoon Lounge $1,500 per group of four · Match Guarantee $150 rollover credit when a guest records zero Shared Anchors.
- **Economics:** ~$18,500 gross per sailing, ~$9,100 net; ~40.6% net margin across the first 90 days (12 sailings).
- **Revenue mix:** tickets and passes, four sponsor tiers ($2k–$10k/mo), VIP upgrades and merch.
- Full figures, sponsor inventory, merch margins, procurement, calendar, comms triggers, and legal clauses: `operations.md`.

## Named vocabulary
Use verbatim; never substitute generic equivalents. **Shared Anchor** (mutual match) · **Chief Vibe Stew** (lead MC and hospitality) · **The Cast & Crew** (marine safety, media, hospitality staff) · **Plot Course** (selecting a connection in Radar) · **Preference Sheet** (3-part onboarding profile) · **Captain's Pass** (digital ticket) · **Captain's Log** (sealed gold-foil match envelope) · **Confessional Pod** (onboard recording booth) · **Intent Wristband** (woven magnetic band issued at check-in) · **Shore Leave** (partnered VIP afterparty) · **Match of the Day** (sunset announcement) · **Riviera Chic** (dress code).

## Content fundamentals
- **Voice:** seductive, athletic, direct, effortlessly confident, selectively exclusive — and explicitly consent-forward. A host who respects the guest. Never corporate, never cute, never coy about boundaries.
- **Person:** "you" for the guest, "we" for the crew. First names only for guests, always.
- **Audience:** singles primary, open-minded and alternative-lifestyle couples first-class secondary. Shared surfaces address both — never singles-only phrasing on a capacity, pricing, or event screen.
- **Casing:** sentence case for body and buttons ("Request an invite"). UPPERCASE Space Mono for labels/eyebrows ("SAILING 04 · HAULOVER").
- **Emoji:** none. Ever.
- **Numbers & data:** set in Space Mono — capacity, coordinates, timestamps ("25°54′N 80°07′W").
- **Consent copy:** safety, consent, and incident language drops the brand voice entirely — plain, present tense, active. Never a joke inside a boundary.
- Examples: "Casting off lines and expectations." · "Forty people, one sandbar." · "Verbal, enthusiastic, every time."

## Visual foundations
- **Color:** paper-first greyscale. Page `#EDEDEA`, cards `--surface-card #F7F7F4`, ink text `#141414`; the noir/ivory scales are neutral greys. One bold accent per view: acid green `--acid-500 #3EC317` (hover lightens to `--acid-400`). Division accents: electric magenta `#F72585`, deep orchid `#7209B7`, outrun amber `#FF8C00`, grid cobalt `#4361EE`, laser fuchsia `#B5179E`; Shop terracotta `#C06A3E`. **Physical-goods accents** — Golden Sand `#E6C687`, Crimson Deck `#8B263E`, Saltwater Blue `#BCE0FD`, Deep Offshore `#0B1B2B`, Sunbleached Oxford `#F7F4EF` — are sanctioned for made objects only (embroidery, foil, flags, member cards, varsity trim), never for screen UI. Status: `--positive/--caution/--danger`. An **ink dark theme** ships as `data-theme="dark"` (accent brightens for contrast); `ThemeToggle` persists light/dark/system. **Imagery placeholders**: `--scene-noir/night/rose` grain gradients stand in wherever imagery belongs, labeled IMAGERY TK.
- **Type:** brutalist, canonical scale 9/10/12/14/16/18/22/28/36/48/64 — no off-scale sizes at or below 64px. Anton for display ≥22px, ALL CAPS always (via text-transform), tracking +.01em; below 22px headings are Archivo 700, sentence case. **Instrument Serif** is a fourth role (`--font-editorial`): campaign headlines, suffix lockups, deck openers, ≥22px, sentence case, italic for emphasis — never body, never UI. Archivo in three weights only: 400 body · 500 buttons/UI · 700 headings. Space Mono: 700 labels ALL CAPS at 10px/.16em (dense 9px/.12em, display straps .24em), 400 data at 12px untracked. Title Case never. Four explicit exemptions: the **Wordmark** lockup (Anton below 22px, always typed caps); **poster scale** — above 64px type is set optically per canvas (posters, tiles, hero artboards), no ladder step required; **scaled artboards** — inside a preview labeled “SHOWN N%”, type reproduces the real design’s canonical size × N, so rendered px are intentionally off-ladder and Anton may fall below 22px; and **logo specimens** — a mark shown as a specimen (concept sheets, reduction ladders, clear-space diagrams) is set optically at whatever size the artboard needs, since a logo has no body-copy relationship to the ladder. Chrome around any of these — titles, labels, captions — stays on-ladder. Google Fonts substitutions — replace with licensed brand fonts when available.
- **Template chrome:** every kit shares one annotation system — section heading Anton 22px uppercase + mono strap `700 9px/1.8 · .12em`; artboard label `700 10px/1 · .16em` muted; caption `400 12px/1.6` body faint. Tabular rows use fixed column widths, never `space-between`. Google Fonts substitutions — replace with licensed brand fonts when available.
- **Spacing:** 4px base scale (`--space-1…20`); generous — luxe means air. Container 1200px.
- **Backgrounds:** flat warm grey. Full-bleed imagery (greyscale engravings, halftone print, heavy film grain) sits behind `--gradient-protect` scrims; `--texture-grain` layers vintage grain over scenes and large flat fills. No decorative gradients on UI surfaces; `--gradient-accent` reserved for hero rules and small fills.
- **Borders & cards:** hairline `--border-subtle` (14% ink); accent border only on the emphasized element. Cards: `--surface-card`, `--radius-md 6px`, `--shadow-card`. Corners are near-square — 0/2/6/10px, pills for tags and actions.
- **Shadows:** shallow and crisp (`--shadow-card`, `--shadow-raised`); `--shadow-glow-accent` only for the single primary CTA or live indicator.
- **Transparency & blur:** glass (`--blur-glass` + overlay) for fixed nav bars and modal scrims only.
- **Motion:** cinematic ease-out (`--ease-out`), 120–320ms UI, 560ms for scene-level reveals. Fades and small translates; no bounces, no spins.
- **Hover:** lighten (accent→`--acid-400`, surfaces→`--surface-raised`); links gain accent. **Press:** darken one step, no shrink transforms.
- **Imagery — a split rule, not a judgement call.** Photography (anything showing people, water, or product in use — feed, stories, PDP heroes, decks, signage, the app) is **golden hour, 35mm**: direct harsh sun, high contrast, film grain, bronze skin, salt hair, wet oxfords, teak and brass. Grounds: `--scene-golden/biscayne/crimson`. Type-led surfaces with no photograph (tickets, stubs, documents, packing slips, legal notices, mono lockups) keep the **greyscale engraving** treatment: `--scene-noir/night/rose`. Never nightclub neon, never staged headshots, never explicit. Placeholders always labeled IMAGERY TK.

## Iconography
No icon assets were provided. The system uses **Lucide** (CDN, 1.5px stroke at 16–20px) — a substitution, flagged. Icons inherit `currentColor`; used sparingly (nav, inputs, status), never decoratively. Unicode is allowed for typographic marks only: `·` separators, `→` in links, `°′` in coordinates. No emoji, no icon fonts.

## Index
- `styles.css` — global entry (imports everything under `tokens/`).
- `operations.md` — **business system of record**: ecosystem, anchor experience, event arc, ratio gate, pricing, unit economics, sponsorship, merch, procurement, calendar, comms triggers, legal clauses, Riviera Code, named vocabulary.
- `element-schema.md` — **XPMS3 production taxonomy**: field set, departments, Five-A framework, weather attribute.
- `brand-architecture.md` — the `[un]` bracketed anchor and suffix system, activation map, lockup rules.
- `tokens/` — fonts, colors, typography, spacing, effects, motion.
- `guidelines/` — foundation specimen cards (Design System tab).
- `components/` — 28 exports across six groups (APIs mirror apollo's `src/components/ds/`):
  - `actions/` — **Button**, **IconButton**, **ThemeToggle** (+ `applyTheme`)
  - `forms/` — **Input** (+ `Field`), **Textarea**, **Select**, **Checkbox**, **Radio**, **Switch**, **Stepper**
  - `display/` — **Card**, **Badge**, **Tag**, **Avatar** (+ **AvatarGroup**), **Stat**, **Table**, **Wordmark**, **Icon**
  - `navigation/` — **Tabs**
  - `feedback/` — **Dialog**, **Toast**, **Tooltip**, **Progress**, **StateBlock** (use on every list)
  - `agent/` — **ProducerPanel** + **ProducerLauncher** (The Producer: confirm-first assistant; guest and operator/crew modes)\n  - `logbook/` — **PassageLog**, **MarksList**, **ContestCard**, **StandingsTable**, **KnotsLedger**, **ContestComposer** (gamification: a logbook, never a leaderboard — persistent public rankings banned; contests are windowed Regattas/Challenges)\n  - `feed/` — **PostCard**, **Hail**, **CommentThread**, **Composer**, **FlagButton** + **FlagQueue** (Open Deck: the member feed; hail is the single reaction; confession-booth motif lives in the composer voice)
- `ui_kits/social-site/` — [un] marketing site (hero, episodes, sub-brands, casting form; Producer aboard).
- `ui_kits/dating-app/` — [un] Scripted mobile app, 390×844 (Tonight / Matches / You).
- `ui_kits/yacht-club/` — [un] Limited charter site (charter grid, booking flow, manifest).
- `ui_kits/auth/` — the Gangway: magic-link sign-in, invite codes, application tracker.
- `ui_kits/tickets/` — reservations: charter → cabin & add-ons → review → boarding stub.
- `ui_kits/app/` — member app 390×844: home, live underway mode, member card + QR, inbox.
- `ui_kits/admin/` — the Bridge (crew ops): manifest, check-in, refunds; operator Producer aboard.
- `ui_kits/shop/` — the Shop: merch grid, cart dialog, member pricing.
- `ui_kits/pos/` — Galley POS: catalog, ticket, member attach, tender.
- `ui_kits/kiosk/` — gangway check-in kiosk: scan, confirm, help — large touch targets.
- `ui_kits/emails/` — 9 table-based, client-safe emails (welcome, application, stub, weather hold, waitlist, digest, magic link, farewell, season card).
- `templates/` — 23 starting templates in six groups, named `<Group> · <Kit>`:
  - **Foundations** — Brand Kit, UI Kit, Motion Kit
  - **Channels** — Social Kit (grouped by platform, Gateway first), Email Kit, Media Kit (broadcast + live + podcast), App Store Kit
  - **Commerce** — E-commerce Kit, Membership Kit, Activity Kit (Dating), Charter Kit (Boats)
  - **Physical** — Print Kit, Signage Kit, Wearables Kit, Document Kit
  - **Relations** — Partner Kit, Press Kit, Data Kit, Legal &amp; Safety Kit
  - **Decks** — Brand, Investor, Sponsor, Membership (deck-stage, 1920×1080)
- `github.md` — source-repo association (ghxstship/apollo) and sync record.
- `SKILL.md` — agent skill entry point.

## Intentional additions
- `Icon` — Lucide CDN wrapper (no proprietary glyph set; hand-drawn SVGs banned).
- **Wordmark** — type-set bracketed lockup standing in for the missing logo. `[un]` is typed lowercase — the case is part of the mark — and the suffix is sentence case: the one documented exception to the all-caps display rule.
- The Producer (`agent/`) — UNHINGED counterpart to [un]'s Purser / apollo's Aurora: same confirm-first action model.
- Component tone keys keep their legacy names (`gold`, `rose`, `sea`) for apollo API compatibility — they now resolve to acid green, flare pink, and cobalt. `shop` (sun orange) is a new key for the Shop.


## SIGNAGE STANDARDS

Physical signage follows six named layout standards (specimens: `guidelines/brand-signage.html`; full artwork per size: `templates/signage-kit/`). Every produced piece is tagged with one:

- **LEDGER** — wayfinding & directories. Wordmark + accent keyline top; destination rows with accent arrows flush right; mono meta footer. Margins 8% of width; max 6 rows per column; panels ≥60 in tall add a map zone in the lower quarter; panels ≥36 in wide split to two columns.
- **PLAYBILL** — paper announcements (A-frames, invites, event posters). Paper ground, accent mono eyebrow, display type in the upper half, rule + wordmark lockup footer. Margins 12% of width.
- **BILL** — night posters & drops. Scene ground + protection gradient; mono eyebrow top-left; display headline in the lower third at cap height ≈ W/8; mono strap footer. Margins 10% of width.
- **MARQUEE** — wide formats (≥3:1: banners, billboards). One display line at cap ≈ 33% of height plus accent mono strap, centered under 4:1 aspect, left-locked over a horizontal gradient above it.
- **MONOGRAM** — identity fields (step & repeat, flags, tents, placards, badges). Centered wordmark stack, or staggered repeat grid at a pitch of one-third panel width.
- **DOCKET** — documents & cards (menus, rules, certificates, manifests, call sheets). Mono eyebrow, display title, ruled rows, lockup footer. Fixed 0.75 in margins (≈19 mm on ISO sizes).

Production: US inches primary; ISO A-series only for international venues (nearest A size, same standard). Viewing-distance rule: 1 in cap height per 10 ft. Matte stock only — no gloss on deck. Rich black for noir grounds: 60/40/40/100.

