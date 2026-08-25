# Brand architecture — `[UN]`

`[UN]` is the parent brand: a static, bracketed anchor. Each division carries the anchor plus a sentence-case suffix, set with a space between the mark and the word.

## Structure

Two systems share one anchor.

**System A — `[UN]` parent anchor.** The bare bracketed mark, no suffix. Used where the umbrella speaks rather than a division: avatars, app icons, hardware, flags, passes, wayfinding, and any surface too small or too physical for a suffix.

**System B — `[UN] {Suffix}` sub-brand lockup.** Names a division.

```
[UN]  Suffix
 |      |
 |      └─ Space Mono 700 at 1.27 of the bracket size, sentence case
 |         one word space (.61em) after the closing bracket
 └─ Anton, always caps, brackets are part of the mark and never dropped
```

**The 1.27 ratio is cap-height matched, not size matched.** Anton's cap height is 0.859 em; Space Mono's is 0.676 em. Setting both faces at the same px size renders the suffix caps at 79% of the bracket caps, and the previously documented 0.77 ratio rendered them at 61% — visibly two different sizes. Multiply the bracket size by 1.27 and the capitals align. The suffix's px number is therefore *larger* than the bracket's; that is correct and expected.

The faces are deliberately unalike: Anton is tight and condensed, Space Mono is wide and even. The pairing reads as a manifest rather than a logo — a counterpart to the bracket, not an echo of it. A second condensed sans (Bebas Neue and its relatives) is rejected: it echoes Anton, and it has no true lowercase, which makes sentence case impossible.

**Which system, when.** Parent anchor for square or circular surfaces, anything under 15 mm, physical hardware, or when the umbrella is speaking. Sub-brand lockup when a specific club is hosting, selling, or being named, and there is horizontal room at 15 mm or larger. When both would work, the parent wins — it compounds recognition across every division instead of splitting it.

Never a suffix without the anchor. Never two suffixes in one lockup.

## The five divisions

| Mark | What it is | Domain | Accent |
| --- | --- | --- | --- |
| **[UN] Hinged** | Singles Social Club | Sea · Port | Acid green `#F72585` |
| **[UN] Bound** | Open / alternative lifestyle couples social | Port · Premium | Violet `#7209B7` |
| **[UN] Limited** | Premium experiences | Premium | Champagne `#FF8C00` |
| **[UN] Scripted** | Social content series — pop-up dating, matchmaking, mixers | Dating | Flare pink `#4361EE` |
| **[UN] Cut** | BTS and founder-led content series | Media | Bone `#B5179E` |

Divisions never get their own type or surfaces — only their accent swap. One stage, different spotlights.

**The division hues are reserved for identity.** They name a club and nothing else. Operational state — Five-A phase, run-of-show position, procurement status — is encoded in numerals on the noir/ivory greyscale, never in a division hue. This matters most on physical objects: a magenta flag on a mast means [UN] Hinged is sailing, and it can never also mean a phase of the day. Status colours (`--positive` / `--caution` / `--danger`) are the one exception, and they override a division accent wherever both apply.

The five hues sit 60°+ apart so no two divisions read as the same brand in a schedule, directory, or ticket list — more precisely, four hues plus one neutral. Tokens: `--brand-hinged`, `--brand-bound`, `--brand-limited`, `--brand-scripted`, `--brand-cut`, each with a `-lift` step for small type on ink. **[UN] Cut carries no hue** — ivory on ink, ink on paper. It is the ungraded channel, so it inverts rather than tints: it never appears as a tinted ground beside the other four. Fuchsia holds on both grounds so it holds on either ground — `--fuchsia-600` on paper, `--fuchsia-400` on ink; every other division uses a single 500 step.

## Activity categories

Every experience is filed under one category, which determines its division and accent:

- **Sea** — sailings, sandbar socials, water sports, charters → [UN] Hinged, [UN] Limited
- **Port** — pool, beach, nightlife, mixers, Shore Leave → [UN] Hinged, [UN] Bound
- **Premium** — private charters, VIP daybeds, member gatherings → [UN] Limited, [UN] Bound

## Commerce and media

- **Shop** — merch and drops. Sun orange accent. Carries whichever division's mark the drop belongs to; never a mark of its own.
- **[UN] Cut** — the media arm. Publishes across all divisions under the parent voice.

## Tagline lockup — `[UN] anything goes here`

The parent slogan, set as a mark. The blank is the brand, so the blank gets set like one. One full character space after the closing bracket — `.61em` of the tagline size, which is one Space Mono advance.

**Option 1 — Active Rule (master).** `[UN]` in Anton uppercase; `anything goes here` in Space Mono lowercase at 0.65 of the bracket size, on a continuous 1.5 pt rule running the exact length of the phrase — an active form field, not decorative underlining. The rule keeps 1–2 px clearance below the descenders on *g* and *y* (0.06em, never less than 1 px) so it never cuts the letterforms when scaled down or embroidered. Print, physical merch, web headlines. Preppy, provocative, offline luxury. Avoid app icons and avatars, embroidery under 25 mm (thread fuses the rule into the descenders), and co-branded sponsor lockups.

**Option 3 — Active Cursor (digital and motion).** `[UN]`, then a thin vertical rule at 50% opacity in Golden Sand `#E6C687` spanning the text block with `.61em` of the tagline size on each side, then `anything goes here` in Space Mono lowercase at `.05em`, stacked two lines so the block sits square beside the anchor — a single line is too wide for mobile and video. In motion the pipe blinks on a 0.8 s loop at terminal speed, then the phrase auto-deletes and types a division name. Video overlays, Posh headers, wallet pass sub-headers, nav hover and loading states, marina signage. Avoid apparel embroidery (the pipe reads as a seam flaw), laser-engraved metal (vertical lines etch like scratches), and print billboards.

Neither replaces a division lockup: the tagline states the philosophy, the suffix names the club.

## Casing matrix

| Setting | Face | Where |
| --- | --- | --- |
| **[UN] Hinged** | Space Mono 700, sentence case | Primary standard — web headers, Posh event titles, member portal UI, official collateral |
| **[UN] hinged** | Instrument Serif italic, lowercase | Campaign headlines, film photo overlays, invitation copy, print posters |
| **[UN] HINGED** | Space Mono 700, all caps, +.06em | Large physical goods only — screen print, embroidered cap backs, yacht flags |
| ~~[UN] hinged~~ | Plain grotesque lowercase | Never. Drops into generic tech territory — lowercase is earned by the serif italic, never by the sans |

## Lockup rules

- **Brackets** — structural, never decorative. Do not restyle, recolour, space out, or omit them.
- **Case** — `[UN]` always caps; the suffix always sentence case, except the two documented variants in the casing matrix. This is the one place the display face is not set all caps.
- **Spacing** — one word space (`.3em`) between the closing bracket and the suffix, optically adjusted, never a hyphen or a slash.
- **Clear space** — cap height of the `U` on all sides, measured from the outer bracket edge.
- **Sub line** — mono, `.42em` tracking, optically centred under the lockup, in the division's accent.
- **Minimum size** — 16px digital, 8 mm embroidered. Below 8 mm the mark reduces to `[UN]` alone or a woven label.
- **Editorial form** — `[UN]` + lowercase italic serif (`[UN] bound`) is reserved for campaign headlines and deck openers. Never in UI, never in navigation.
- **Colour** — the anchor is always ink or ivory. Only the sub line and rule carry accent. On a knockout ground the default is white with an ink mark; in a division context the ground adopts that division's colour, the same logic as the signal flags. Golden Sand and Crimson Deck are permitted on physical goods only (embroidery, foil, flags, member cards).

## Handle and domain

One handle across every division: **@unhingedsocial.us**. Divisions do not hold separate handles.

## In running text

The mark is `[UN] Hinged`. In body copy, headlines, and legal text the name may be set as plain `UNHINGED` where brackets would disrupt reading — but any rendering that functions as a *logo* (lockups, signage, avatars, covers, footers, packaging) uses the bracketed form.
