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

- **[un] Hinged** — Singles Social Club. Acid green `--brand-hinged`. Afloat and ashore, Open and Club.
- **[un] Bound** — Open and alternative lifestyle couples social. Violet `--brand-bound`. Mostly ashore; Open through Premium.
- **[un] Limited** — Premium experiences. Champagne `--brand-limited`. Private charters, VIP, member gatherings — Premium and Exotic.
- **[un] Scripted** — Social content series: pop-up dating, matchmaking, mixers. Flare pink `--brand-scripted`.
- **[un] Cut** — BTS and founder-led content series. Bone `--brand-cut` — no hue; ivory on ink, ink on paper, so it inverts rather than tints.
- **[un] Brand** — Nautical lifestyle, fashion, and gear. No accent and no token — ink on paper, ivory on ink; the products speak for themselves.

**Shop** carries merch and drops in sun orange (`--brand-shop`) — the sales channel, not the maker. Products carry the **[un] Brand** mark; event and season drops may carry their division's mark instead.

An experience is filed on two axes, and the pair determines which division and accent it carries: **setting** — Afloat (`sea`) or Ashore (`port`) — and **experience class** — Open · Club · Premium · Exotic. Setting and class are independent: a private charter is afloat and Premium, a gathering is ashore and Premium. Taxonomy in full: `operations.md` §1. Division and accent rules: `brand-architecture.md`.

## Business model
- **Anchor experience:** weekly sailing, Miami. Trident 512 USCG-certified pontoon, max 40 passengers + crew. 11:00 pre-boarding social → 12:00 departure → 14:00 Haulover Sandbar → 17:00 sunset cruise (Radar locks 17:30) → 18:00 dock → 19:00 Shore Leave.
- **Ratio gate:** 40 passengers, either 20/20 (singles capped 10 male / 10 female) or 10 couples + 20 singles. The engine refuses sales that break composition; capacity is always shown **by segment**.
- **Products:** Single boarding pass $350 · Couple boarding pass $650 · Club Lifestyle Membership $2,500/quarter (capped at 20 active) · VIP Pontoon Lounge $1,500 per group of four · Match Guarantee $150 rollover credit when a guest records zero Shared Anchors.
- **Economics:** ~$18,500 gross per sailing, ~$9,100 net; ~40.6% net margin across the first 90 days (12 sailings).
- **Revenue mix:** boarding passes and memberships, four sponsor tiers ($2k–$10k/mo), VIP upgrades and merch.
- Full figures, sponsor inventory, merch margins, procurement, calendar, comms triggers, and legal clauses: `operations.md`.

## Named vocabulary
Use verbatim; never substitute generic equivalents. **Shared Anchor** (mutual match) · **Chief Stew** (lead MC and hospitality) · **The Cast & Crew** (marine safety, media, hospitality staff) · **Pick** (selecting a connection in Radar) · **Preference Sheet** (3-part onboarding profile) · **Boarding pass** (what admits a member to one sailing) · **Captain's Log** (sealed gold-foil match envelope) · **Confessional Pod** (onboard recording booth) · **Wristband** (woven magnetic band issued at check-in) · **Shore Leave** (partnered VIP afterparty) · **Match of the Day** (sunset announcement) · **Riviera Chic** (dress code).

Membership itself is reached by invitation or by application — never by buying a standing place. "Captain's Pass" is retired as a term, and the terms above are the only ones the vocabulary gate reads: a bolded phrase in this section must appear verbatim in a user-facing surface under `src/`.

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
- `components/` — the kit as shipped in apollo's `src/components/ds/` (index.ts is the export list; the API of every export is in §Component API below):
  - `actions/` — **Button**, **IconButton**, **ThemeToggle** (+ `applyTheme`)
  - `forms/` — **Input**, **Textarea**, **Select**, **Checkbox**, **Radio**, **Switch**, **Stepper** (the kit's `Field` is folded into each control: `label`/`hint`/`error` props, one wrapper)
  - `display/` — **Card**, **Badge**, **Tag**, **Avatar** (+ **AvatarGroup**), **Stat**, **Table**, **Wordmark**, **LockupText**, **Icon**
  - `navigation/` — **Tabs**
  - `filters/` + `toolbar/` — **FilterPills** (the axis) and **ListToolbar** (the one list toolbar: search · filter · sort · chips · count)
  - `feedback/` — **Dialog**, **Toast**, **Tooltip**, **Progress**, **StateBlock** (use on every list)
  - `use-modal` — **useModal** (the hook behind every role="dialog": focus-in, Escape, Tab trap, focus-restore)
  - `logbook/` — **KitPassageLog** (exported under that name; `PassageLog` is the member page's own), **MarksList**, **ContestCard**, **StandingsTable**, **KnotsLedger** (gamification: a logbook, never a leaderboard — persistent public rankings banned; contests are windowed Regattas/Challenges). The kit's `ContestComposer` is not ported: contests are composed on the Bridge's own forms.
  - `feed/` — **PostCard**, **Hail**, **CommentThread**, **Composer**, **FlagButton** + **FlagQueue** (Open Deck: the member feed; hail is the single reaction; confession-booth motif lives in the composer voice)
  - The Producer (**ProducerPanel** + **ProducerLauncher**) lives in `src/components/producer/`, outside the kit — it composes the kit rather than belonging to it.
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
- Component tone keys keep their legacy names for apollo API compatibility. `gold` is the ACCENT channel — since the 2026-09-02 palette (src/styles/palette.css, Option C) that is ink on paper and ivory on ink, no hue; `sea` resolves to cobalt (`--grid-500`); `sand` to `--ivory-500`. `shop` is retired to ink with the Shop's hue. The status tones — `positive`, `caution`, `danger` — are the same three names on Badge, Toast and Progress.


## Component API
The contract apollo's pages compile against. Every export of `src/components/ds/index.ts` is here; a prop not listed here does not exist. Shared conventions: every component takes `className` and `style`; `inverse` means "this instance sits on a ground that is ink in BOTH themes" and is what makes it legible there (src/styles/palette.css flips the accent pair for every `--inverse` class); `size` is always `sm | md | lg` where a component has sizes (Stepper stops at `md`, Stat at `sm | md`); status tones are always `positive | caution | danger`. Keyboard and screen-reader behaviour is part of the contract and is listed per component.

- **Button** `variant?: primary | gold | outline | ghost | danger` (default `primary`; `gold` is the accent CTA; `danger` is an outline at rest that fills on hover/focus — for a control that destroys or cannot be undone) · `size?: sm | md | lg` (32/42/50px; `sm` grows a 46px hit area) · `inverse?` · `fullWidth?` · `type?` (defaults to `button`) · every `<button>` attribute. Focus: the global ring.
- **IconButton** `label: string` (required — it is the accessible name and the title) · `variant?: solid | outline | ghost` · `size?: sm | md | lg` · `inverse?` · `<button>` attributes. Children are the glyph.
- **ThemeToggle** `storageKey?` · `darkLabel? lightLabel? systemLabel?`. A `role="group"` of three `aria-pressed` buttons; persists `dark | light | system` and stamps `data-theme="dark"` (paper is the unattributed default). `applyTheme(mode)` is exported for the layout bootstrap. 44px targets on coarse pointers.
- **Input / Textarea / Select** `label?` · `hint?` · `error?` · `id?` (else generated) · every native attribute. Select adds `options?: {value,label}[]` and `placeholder?`. Error text is `role="alert"`, wired with `aria-invalid` + `aria-describedby`; 44px tall; 16px type on coarse pointers so iOS does not zoom.
- **Checkbox** `label?` · `description?` · `error?` · `disabled?` · native attributes. **Radio** and **Switch** take `label?` · `disabled?` · native attributes; Switch is `role="switch"`. All three draw their own box with the native input hidden behind it; focus rings on the drawn box; 44px hit area on coarse pointers.
- **Stepper** `value?` · `onChange?(n)` · `min? max?` · `size?: sm | md` · `inverse?` · `decrementLabel? incrementLabel?` · `label?` (names the `role="group"`). The buttons' labels carry the current value ("Increase, now 3") so nothing needs a live region.
- **Card** `eyebrow? title? meta?: ReactNode[] media?: url | dawn | day | dusk children? footer?` · `tone?: shore | sea` (`sea` is an always-ink card) · `onClick?` (then `role="button"`, focusable, Enter/Space).
- **Badge** `tone?: gold | ink | positive | caution | danger | outline` (default `outline`) · `inverse?` · `<span>` attributes. Read, never pressed: no tabindex, no handlers. `inline-flex`, so a row containing one aligns with `align-items:center`, not baseline.
- **Tag** `active?` · `onClick?` (then `role="button"`, `aria-pressed`, focusable, Enter/Space) · `onRemove?` + `removeLabel?` (a real `<button>` inside) · `<span>` attributes. The filter chip; 28px, 44px hit area on coarse pointers when clickable.
- **Avatar** `name?` · `tone?: ink | sea | gold | sand` · `size?: sm | md | lg` (28/38/56px) · `ring?`. Renders initials; `role="img"` named by `name`, decorative when nameless. **AvatarGroup** overlaps its Avatar children.
- **Stat** `label? value sub?` · `size?: sm | md` · `inverse?`. Tabular figures in Anton; a `<b>` inside `sub` reads as the positive delta.
- **Table** `columns: TableColumn[]` (`key label? width? mono? align?: start | end render?`) · `rows` · `rowKey?` · `onRowClick?` (rows become focusable, Enter/Space) · `dense?` · `inverse?` · `tall?` (sticky header, 70vh) · `minWidth?: number | false` (default derives from column count so the wrapper scrolls instead of squeezing). `mono` cells get `tabular-nums`; `align:"end"` for money and counts. An empty column label renders a hidden "Actions" header.
- **Wordmark** `size?: sm | md | lg | number` · `suffix?: Hinged | Bound | Limited | Scripted | Cut | Brand | null` · `sub?` · `accent?: division | shop` · `inverse?` · `editorial?` XOR `caps?` (a compile error together). The lockup is the one Anton-below-22px exemption. **LockupText** `division` — the running-text form, immune to a parent `text-transform`.
- **Icon** `name: string` (Lucide PascalCase; `check:ds` reads every literal name against the set and Icon warns in development for one it cannot resolve) · `size?` · `strokeWidth?` · `label?` (then `role="img"`; otherwise `aria-hidden`).
- **Tabs** `items: {id, label, panelId?}[]` · `value?` · `onChange?(id)` · `inverse?` · `grow?` · `label?` (names the tablist). WAI tabs: roving tabindex (one stop in the Tab order), Left/Right select and move focus (RTL-aware, wrapping), Home/End; `aria-controls` from `panelId`. The panel is the caller's `role="tabpanel"`.
- **FilterPills** `label` (the group's accessible name) · `options: FilterOption[]` (`id label count?`) · `value` · `onChange(id)` · `allLabel?: string | null` (`null` drops the All pill) · `allCount?`. Renders Tags; every pill shows the rows it leads to.
- **ListToolbar** `search?` · `filters?` (FilterPills go here; opens in an anchored, non-modal panel) · `filterCount?` · `sortOptions?: SortOption[]` + `sortValue?` + `onSort?` (a listbox menu, never pills) · `resultCount` · `resultNoun? resultNounPlural? countSuffix?` · `chips?: ToolbarChip[]` (`key label value`) + `onDropChip?` + `onClear?` · `actions?` · `trailing?`. Both panels close on Escape and outside click and restore focus; on a phone they are bottom sheets.
- **Dialog** `open` · `onClose?` · `eyebrow? title? children? footer?` · `width?` (px, capped to the viewport) · `closeLabel?` · `label?` (accessible name when there is no `title`). Portalled; `aria-modal`; focus moves in, Tab is trapped, Escape and the veil close, focus returns to the opener; body scroll locked.
- **Toast** `message` · `meta?` · `tone?: ink | positive | caution | danger` · `fixed?` (portalled, clear of the tab bar) · `onDismiss?` + `dismissLabel?`. Announces through the root layout's standing live regions (`#ls-announcer`, `#ls-announcer-alert` for `danger`) so the text is read once; where no region exists it becomes its own `role="status"` / `role="alert"`. Always-ink surface.
- **Tooltip** `label` · `side?: top | bottom`. Shows on hover and focus-within, so wrap something focusable; the child gets `aria-describedby`; Escape dismisses until hover/focus leaves.
- **Progress** `value?` (0–100) · `label? detail?` · `tone?: positive | caution | danger` (omit for the accent) · `thick?` · `inverse?`. `role="progressbar"` labelled by `label`, `aria-valuetext` from a string `detail`.
- **StateBlock** `status?: empty | loading | error | offline` · `title? detail? action? icon?` (Lucide name; defaults Inbox / CloudLightning / WifiOff) · `bare?`. `role="alert"` for error, `role="status"` otherwise; `aria-busy` while loading.
- **useModal(open, onClose?, { modal? })** → ref for the surface (`tabIndex={-1}`). `modal:false` for an anchored popover: Escape, focus-in and focus-restore without the Tab trap or the scroll lock.
- **KitPassageLog** `figures?: LogFigure[]` (`value label`) · `since?` · `emptyLabel?`. **MarksList** `marks?: MarkItem[]` (`kind name detail? held date?`) · `showAhead?`. **ContestCard** `shape?: regatta | challenge` · `name` · `window? metric? award?` · `entered? settled? daysLeft?` · `onEnter?` · children. **StandingsTable** `rows?: StandingRow[]` (`name score place? tie? reached?`) · `shape?` · `frozen?` · `youName?`. **KnotsLedger** `balance?` · `entries?: LedgerEntry[]` (`reason delta date`) · `rewards?: LedgerReward[]` (`name cost costValue?`) · `onRedeem?`.
- **PostCard** `author` · `tone?` (Avatar tone) · `body? sailing? timestamp?` · `media?` + `mediaLabel?` · `footer?` · children. **Hail** `count? hailed? onToggle?` — a toggle button, `aria-pressed`. **CommentThread** `comments?: FeedComment[]` (`author tone? timestamp? body`) · `emptyLabel?`. **Composer** `placeholder? sailing? onAttachSailing? onPost?(text) disabled?`. **FlagButton** `flagged? onFlag?`. **FlagQueue** `items?: FlagItem[]` (`id author excerpt flaggedBy when`) · `onResolve?(item, leave | remove)` · `emptyLabel?`.

Every animation and transition in the kit collapses under `prefers-reduced-motion: reduce` (src/styles/base.css). Every interactive element shows a focus ring — `check:ds`'s `unset-focus` gate holds that for every `all:unset` in the kit's stylesheets — and clears 44px on coarse pointers.

## SIGNAGE STANDARDS

Physical signage follows six named layout standards (specimens: `guidelines/brand-signage.html`; full artwork per size: `templates/signage-kit/`). Every produced piece is tagged with one:

- **LEDGER** — wayfinding & directories. Wordmark + accent keyline top; destination rows with accent arrows flush right; mono meta footer. Margins 8% of width; max 6 rows per column; panels ≥60 in tall add a map zone in the lower quarter; panels ≥36 in wide split to two columns.
- **PLAYBILL** — paper announcements (A-frames, invites, event posters). Paper ground, accent mono eyebrow, display type in the upper half, rule + wordmark lockup footer. Margins 12% of width.
- **BILL** — night posters & drops. Scene ground + protection gradient; mono eyebrow top-left; display headline in the lower third at cap height ≈ W/8; mono strap footer. Margins 10% of width.
- **MARQUEE** — wide formats (≥3:1: banners, billboards). One display line at cap ≈ 33% of height plus accent mono strap, centered under 4:1 aspect, left-locked over a horizontal gradient above it.
- **MONOGRAM** — identity fields (step & repeat, flags, tents, placards, badges). Centered wordmark stack, or staggered repeat grid at a pitch of one-third panel width.
- **DOCKET** — documents & cards (menus, rules, certificates, manifests, call sheets). Mono eyebrow, display title, ruled rows, lockup footer. Fixed 0.75 in margins (≈19 mm on ISO sizes).

Production: US inches primary; ISO A-series only for international venues (nearest A size, same standard). Viewing-distance rule: 1 in cap height per 10 ft. Matte stock only — no gloss on deck. Rich black for noir grounds: 60/40/40/100.

