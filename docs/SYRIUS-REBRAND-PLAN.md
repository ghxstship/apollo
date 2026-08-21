# Syrius Social — rebrand and enrichment plan

LYRE SOCIAL becomes **Syrius Social** (@syrius.social), *The Unscripted Social
Experiment* — a reality-format social club (Yacht Week × Thursday Dating × Below
Deck) with two sub-brands: **Syrius Dating** (@syrius.dating) and **Syrius Yacht
Club** (@syrius.yachts).

Source: `Syrius Social Design System.zip` — 152 files: tokens, 28 component
contracts, 12 product UI kits, 8 transactional emails, 17 template kits, brand
guide. The kit was explicitly scoped from Lyre's component inventory and its
APIs mirror this repo's `src/components/ds/` by design — the kit's own docs name
`ghxstship/apollo` as the natural home. That is the central fact of this plan:
**the component surface ports nearly 1:1; the identity, voice, and concept do
not.**

## What kind of change this is

Three changes stacked, each a different size:

1. **Identity swap** (mechanical, large surface). Neon Brutalist dies. Syrius is
   dark-first noir `#101418` with one antique-gold accent `#B98A2F` per view,
   ivory text `#F4EFE6` (never pure white — "blooms on camera"), Marcellus /
   **Jost** (replacing Archivo) / Space Mono, paper light theme via
   `data-theme="light"` with deepened accents. Tone names remap: brass→gold,
   laurel→positive, clay→caution, siren→danger. Motion becomes cinematic: the
   Cut (none), the Drift (300ms fade+rise), the Dim (600ms) — no bounces, all
   collapse under `prefers-reduced-motion`.

2. **Concept shift** (editorial, every string). A members' sailing club becomes
   a filmed social experiment. The voice is "a reality-TV producer who respects
   the audience": present tense, sentence case, no emoji, **no exclamation
   marks**, cast are first names only, scarcity stated flatly ("12 cabins. 200
   applicants."). Copy patterns move to production framing: Casting now ·
   Episode 04 · On this charter · Confession booth. Every sentence in the
   product gets re-voiced, not just re-labeled.

3. **Enrichment** (new surfaces and data). Cabins become bookable objects,
   episodes become content, filming consent becomes a legal object, a kiosk and
   a dating product appear.

## Naming migration

| Lyre | Syrius | Notes |
| --- | --- | --- |
| LYRE SOCIAL | Syrius Social | wordmark is type-set; no logo exists, never draw one |
| "Strike a chord." | "The Unscripted Social Experiment" | hero confirmed in kit |
| Sea Day / Port Day / voyages | **charters** (+ **tables** for Dating) | tickets kit: charter → cabin & add-ons → review → boarding stub |
| LORE (magazine) | **Episodes** | `episode-digest` email replaces `lore-digest` |
| The Chandlery | **the Slop Chest** | shop kit, member −15% pricing |
| Aurora AI | **the Producer** | same confirm-first model; adds explicit `role="operator"` crew mode; "money always asks" |
| Passbook | **Member card** | + rotating QR (kit shows rotation — anti-screenshot) |
| Gateway | **Live underway** | timeline, galley self-order, offline note |
| Home Port | Home | app kit |
| The Gangway | the Gangway | unchanged |
| the Bridge | the Bridge | unchanged |
| the Galley / Galley POS | unchanged | POS kit keeps house/card tender, member attach |
| passes | **cabins** (sea) / **seats** (tables) | "berth" stays banned |
| lyre.social | syrius.social | one-constant change: `MAIL_DOMAIN`/`SITE_DOMAIN` in brand.ts + the `OUTBOX_FROM` Vault row — this is why they were centralized |
| SMS prefix "LYRE SOCIAL:" | "SYRIUS:" | all 14 drafts re-voiced; `lyre_*` provider names → `syrius_*` (free — none created at sent.dm yet) |

**Not present in the Syrius kit — decisions needed (Phase 0):**

- **Knots / Leagues / Marks / Regattas** (the gamification layer). Recommend:
  carry over re-voiced — the logbook concept fits a show ("what you did on
  camera"), and deleting working retention machinery for a kit that simply
  didn't cover it would be scope-loss, not fidelity. But this is a brand call.
- **Open Deck** (the feed). Closest kit concept is the confession booth.
  Recommend keeping the feed, renamed **the Booth**, member-only as now.
- **Directory / threads / agreements** — no kit coverage; keep, reskin, re-voice.
- **Repo/project naming**: `lyre-social/` directory, Supabase project name,
  Vercel project. Recommend renaming the app directory `syrius-social/` in one
  dedicated commit; DB legacy names stay (established pattern: plumbing keeps
  old names, display comes from brand.ts).

## Phases

### Phase 0 — decisions gate (user)
Sign off the naming table above, the four open decisions, and the Dating-app
timing (Phase 5 standalone vs deferred). Nothing below starts ambiguous.

### Phase 1 — foundation (tokens, primitives, theme)
- Port `tokens/*.css` verbatim (never round): noir/ivory/gold scales, rose+sea
  sub-brand accents, status trio, surfaces, borders, focus ring, motion vars,
  scene gradients, paper theme block. Dark becomes the **default** theme;
  ThemeToggle persists dark/light/system (flip of today's order).
- Rewrite `brand.ts`: names, tagline, SUB_BRANDS map (accent-only, enforced),
  MAIL_DOMAIN→syrius.social, voice constants. BANNED_TERMS gains: "Lyre",
  "lyre", "Chandlery", "LORE", "Aurora", "Strike a chord", `!` in rendered copy
  (exclamation scan), emoji ranges. Keeps: berth, salon, ticket, leaderboard.
- Remap DS tones (brass→gold etc.) with a compatibility alias for one commit,
  then sweep call sites. Update Wordmark, Button glow (single primary CTA only),
  Card/Badge/Tag/Stat to kit values. Fonts: swap Archivo→Jost, keep
  Marcellus/Space Mono.
- Accessibility gates carry forward: gold-on-noir and deepened-gold-on-paper
  contrast verified in rendered HTML; focus ring per kit; reduced-motion.

### Phase 2 — re-voice and reskin every existing surface
Marketing site (hero, episodes strip, sub-brands, casting form), Gangway, member
app (Home / Live underway / Member card+rotating QR / Inbox), the Bridge (all 17
consoles), Slop Chest, Galley POS, tickets flow, directory, threads, agreements,
regattas-or-successor, /sign token page. Every heading, empty state, error, and
notification re-written in producer voice. The 11 transactional emails move to
the kit's table-based ivory `#E9E2D2` system (8 kit emails + 3 carried designs:
refund-posted, season-card, voyage-cancelled restyled to match).

### Phase 3 — new data and legal objects
- **Cabins**: `cabins` table (vessel FK, name, berths, price modifier);
  booking flow gains cabin & add-ons step; manifests/gangway show cabin;
  "choice of cabin" reward finally gets a real object.
- **Episodes**: `episodes` table (charter FK, number, title, dek, air state);
  public episodes strip; digest email; Bridge editor.
- **Filming consent** (the sharp one): appearance/filming release as new
  clauses in the existing library — `filming-release`, `voice-likeness`,
  `minor-appearance` — composed into member and guest waivers v2 and published
  (old signatures stay bound to old text by design; the versioning system
  finally earns its keep at scale). Consent **settings** per kit: "Appear on
  camera" toggle, withdrawal flow ("Withdrawing aboard consent docks you at the
  next port — the release explains the rest") recorded as a signature-adjacent
  event, surfaced on the Bridge manifest so crew know who is off-camera.
- **Kiosk** route (`/kiosk`): full-screen check-in — scan (reuses the QR
  scanner), confirm, help; 48px targets; staff-gated device mode.

### Phase 4 — Syrius Yacht Club (sub-brand one)
Charter site section under teal accent: charter grid, booking, public manifest.
Mostly a reskin of voyages with the accent-swap architecture proving itself.
Accent switching = a `data-brand` attribute per route group; sub-brands never
get their own type or surfaces (kit rule).

### Phase 5 — Syrius Dating (sub-brand two, standalone scope)
New product: **tables, not swiping** — Thursday blind tables for six, matches
created only from shared tables, seat-hold flow ("Seat held for 15 minutes"),
Tonight / Matches / You. New tables: `tables`, `table_seats`, `matches`,
match-scoped threads (reuse messaging). Rose accent. This is the largest net-new
build and can ship after 1–4 without blocking them.

### Phase 6 — collateral, comms, ops
SMS drafts re-voiced under "SYRIUS:" with `syrius_*` names; sent.dm registration
re-run post-onboarding; OG images, PWA manifest/icons, favicon; README + docs
sweep; season card → episode-season framing; memory update; `.mcp.json` note.

### Phase 7 — verification (the standing bar)
tsc/lint/build clean · route audit with the new lexicon (old brand terms fail
CI) · e2e suite green including new coverage: cabins, episodes, consent
withdrawal, kiosk gate, sub-brand accent isolation, dating privacy (matches
visible only to both parties) · security_report() invariants extended to new
tables · WCAG checks on rendered pages (contrast, focus, reduced-motion) ·
browser pass over every kit-mirrored screen · production deploy + live click-through.

## Order and rationale

1 → 2 → 3 → 4 → 6 → 7, with 5 (Dating) as a parallel or trailing track.
Phase 2 before 3 so no new surface is ever written in the old voice. The
existing test discipline is the safety rail: the lexicon flip in Phase 1 makes
CI reject the old brand everywhere, which turns "did we miss a string?" from a
review question into a build failure.

## Risks worth naming

- **Filming consent is legal surface.** The clause texts I draft are structure,
  not law — same caveat as the waivers; the library makes lawyer edits cheap.
- **Voice is the long pole**, not CSS. Hundreds of strings across 60 routes,
  11 emails, 14 SMS drafts, notification triggers in SQL. Budget accordingly.
- **Existing signatures** name LYRE. Correct behavior: leave them; publish v2
  documents. Anyone current on v1 shows "out of date" and re-signs — which is
  the honest state after a rebrand.
- **Dark-first flip** inverts every `inverse` prop assumption in the codebase;
  Phase 1 must sweep them, not alias them.
