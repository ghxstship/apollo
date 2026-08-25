# [UN] Design System — Claude Code handoff

Target repository: **`ghxstship/apollo`** · branch `main`

This package is the **single source of truth** for the [UN] brand and product surfaces. It is a design system, not a component library: nothing here compiles into apollo directly. Tokens are copied; components are rebuilt as TSX primitives; kits are read as specification.

---

## 1. What changed since the last sync

This is a **rebrand plus a business-model pivot**, not a visual refresh. Treat prior apollo brand code as superseded.

### Brand architecture — new
`[UN]` is the parent brand: a bracketed anchor, brackets structural and never dropped. Five divisions add a sentence-case suffix, one word space (`.61em`) after the closing bracket.

| Division | What it is | Accent token |
| --- | --- | --- |
| `[UN] Hinged` | Singles social club | `--brand-hinged` |
| `[UN] Bound` | Open / alternative lifestyle couples | `--brand-bound` |
| `[UN] Limited` | Premium experiences | `--brand-limited` |
| `[UN] Scripted` | Social content series | `--brand-scripted` |
| `[UN] Cut` | BTS / founder-led content | `--brand-cut` |

Retired: `Syrius`, `SYNC`, `UN__`, `UNMOORED`, `Yacht Club`, and the four-sub-brand model (`UNHINGED Social/Dating/Boats/Shop`). Shop is a commerce line carrying whichever division's mark applies — it has no mark of its own. One handle everywhere: **@unhingedsocial.us**.

### Palette — new (synthwave / outrun)
Division accents are high-chroma off one horizon. Page surfaces stay **paper-first greyscale**; the house accent stays acid green. See `tokens/colors.css`.

### Typography — new
Anton (display, ≥22px, ALL CAPS via `text-transform`) · Archivo (body: 400/500/700 only) · Space Mono (labels, and the division suffix at 0.77 of bracket size) · Instrument Serif italic (editorial only). Canonical scale: 9/10/12/14/16/18/22/28/36/48/64.

### New product modules — no apollo equivalent exists
| Module | Kit | What it specifies |
| --- | --- | --- |
| Vetting | `templates/vetting-kit` | Application funnel, ID/age gate, background states, 3-part Preference Sheet, ratio gatekeeping, acceptance/waitlist |
| Radar | `templates/radar-kit` | Radar sweep, Plot Course, 3-slot Match Ceremony with 17:30 lock, Shared Anchors 24h timer, Match Guarantee |
| Show | `templates/show-kit` | Run-of-show board, deck-state signal flags, Confessional Pod queue, Five-A phases, weather substitution |
| Activity | `templates/activity-kit` | Sea / Port / Premium activity categories |
| Charter | `templates/charter-kit` | Itinerary, manifest, cabin card, port guide, weather hold |
| Membership | `templates/membership-kit` | Five real products, Wallet passes, Captain's Log, lifecycle |
| Logo | `templates/logo-kit` | Both lockup systems, casing matrix, reduction, misuse |

---

## 2. Repository mapping

```
apollo/
├─ src/styles/
│  ├─ tokens.css            ← tokens/*.css, concatenated in @import order
│  └─ globals.css           ← styles.css (imports tokens first)
├─ src/components/ds/
│  ├─ display.tsx           ← Wordmark (see reference/Wordmark.jsx.txt)
│  └─ …                     ← rebuild other primitives from the UI Kit spec
├─ src/lib/brand.ts         ← division enum, accent map, suffix casing rules
├─ src/types/elements.ts    ← element-schema.md field types
└─ docs/brand/              ← brand-architecture.md, operations.md, element-schema.md
```

`tokens/*.css` are plain custom properties on `:root` with a `[data-theme="dark"]` scope. Copy them verbatim — do not rename, do not convert to a JS object. Every downstream value references them.

---

## 3. Implementation order

Work top to bottom; each step depends on the one above.

1. **Tokens.** Copy `tokens/*.css` and `styles.css`. Verify `--brand-hinged` through `--brand-cut` resolve, plus the `-lift` (small type on ink) and `-deep` (small type on paper) steps.
2. **Fonts.** `tokens/fonts.css` uses one Google import. Do **not** pin `@font-face` URLs — a previously hardcoded v4 gstatic URL 404'd when Google moved to v5.
3. **Brand module.** `src/lib/brand.ts`: division enum, accent map, and the casing rules from §4.
4. **Wordmark primitive.** Rebuild from `reference/Wordmark.jsx.txt` as TSX. Props: `size`, `suffix` (null = parent anchor), `sub`, `accent`, `editorial`, `caps`, `inverse`.
5. **Purge retired strings.** Grep apollo for every name in §1 "Retired" and for the retired hexes listed in §6.
6. **Surfaces.** Rebuild screens against the kits, one module at a time. Vetting → Radar → Show is the dependency order for the event product.
7. **Element schema.** `element-schema.md` → `src/types/elements.ts`, including both classification axes.

---

## 4. Invariants — enforce these in code review

**Brand**
- Brackets are part of the mark. Never dropped, restyled, recoloured, or spaced out. The only bracketless setting is embroidery below 8 mm.
- `[UN]` always caps; suffix always sentence case. Two sanctioned variants only: serif italic lowercase (campaign) and mono ALL CAPS (large physical goods). Plain-sans lowercase is never permitted.
- Never a suffix without the anchor. Never two suffixes in one lockup.

**Colour**
- **Division hues are reserved for identity.** Operational state — Five-A phase, run-of-show position, procurement status — is encoded in numerals on the noir/ivory greyscale, never in a division hue. Status colours (`--positive`/`--caution`/`--danger`) are the one exception and override a division accent wherever both apply.
- The anchor is always ink or Neon Canvas. Only rules, keylines, and sub lines carry accent.
- Golden Sand and Crimson Deck are physical-goods only. Never screen UI.
- Page surfaces are paper-first greyscale. The synthwave palette supplies accents and gradient grounds, not page backgrounds.

**Type**
- Anton ≥22px only, uppercase via `text-transform` (never typed caps — copy must stay editable and translatable). Below 22px, headings are Archivo 700.
- No off-scale sizes at or below 64px. Four documented exemptions: the Wordmark lockup, poster scale (>64px, set optically), scaled artboards (a "SHOWN N%" preview), and logo specimens. Chrome around any exemption stays on-ladder.

**Copy**
- No emoji. No exclamation marks. Sentence case, never Title Case.
- First names only on guest-facing surfaces; surnames appear on crew surfaces only.
- Safety, consent, and incident copy never uses the brand voice for jokes, and never sets below 12px print / 13px screen.

**Layout**
- Tabular rows use fixed column widths, never `space-between`.
- Prefer flex/grid with `gap` over inline flow or per-element margins.

---

## 5. Business model — what the product must support

Full detail in `operations.md`. The shape:

- **Anchor experience:** one weekly 7-hour sailing in Miami. Trident 512 pontoon, 40 passengers, Haulover Sandbar. 11:00 pre-social → 12:00 departure → 14:00 sandbar → 17:00 sunset → 18:00 dock → 19:00 Shore Leave.
- **Ratio gatekeeping is a hard constraint, counted in units not heads:** 20 singles split evenly, or 10 couples plus 10 singles. A couple pass is one unit.
- **Products:** $350 single · $650 couple · $2,500 quarterly membership · $1,500 VIP daybed · Captain's Pass (invite, price never published).
- **Sponsorship:** four named tiers on monthly retainer against a 12-sailing season. Only the Presenting Partner holds footage rights in paid campaigns.
- **Unit economics:** ~$18.5k gross per sailing, ~40% net, ~$222k over 90 days.
- **Comms:** ten triggers, one send each. Nothing between 22:00 and 08:00 local. The marina pin drop is the only encrypted SMS and expires after boarding.
- **Consent:** the Riviera Code (six rules), Intent Wristbands (Anchor / Current / Compass — colour is never the only signal), a four-step removal protocol with no warning step for non-consensual conduct, and $50,000 liquidated damages for naming a member.

Two classification axes apply to every produced element, orthogonally: **Five-A phase** (`arrival` · `atmosphere` · `appetite` · `activity` · `afterglow`) and **weather class** (`waterproof_marine` · `indoor_only` · `all_weather`). An `indoor_only` element in an `activity` phase with no named substitute is a specification error.

---

## 6. Retired values — grep and remove

**Strings:** `Syrius`, `SYNC`, `synchroni`, `UN__`, `UNMOORED`, `UNBOUND`, `UNSCRIPTED`, `UNCUT`, `Yacht Club`, `UNHINGED Social`, `UNHINGED Dating`, `UNHINGED Boats`, `UNHINGED Shop`, `Slop Chest`.

**Fonts:** `Marcellus`, `Jost`, `Archivo Black`, `Georgia` (except as an `--font-editorial` fallback).

**Hexes:** `#B98A2F` `#D3B15E` `#101418` `#F4EFE6` `#FF5C7A` `#2E9BB5` `#8FAF57` `#6B4570` `#B99248` `#D4707E` `#E5DCCB` `#1D62F0` `#4A80F6` `#124BC4` `#F5256D` `#7A2BF0` `#C9A227` `#F07405`.

Legacy token aliases `--brand-social`, `--brand-dating`, `--brand-yacht` are retained for API compatibility and repoint to current values. New code uses `--brand-<division>`.

---

## 7. Package contents

```
tokens/           Six token files — copy verbatim, this is the source of truth
styles.css        Global import order
guidelines/       24 rendered specimens (reference only, not compiled)
templates/        27 kits — read as specification, one folder per kit
reference/        Wordmark implementation + prop contract (.txt — rebuild as TSX)
brand-architecture.md   Lockup systems, divisions, casing matrix, invariants
operations.md           Business model, run of show, sponsorship, comms, legal
element-schema.md       Element taxonomy + both classification axes
readme.md               Full design-system reference
SKILL.md                Agent brief for working inside this system
```

Kits open in any browser. They carry live specimens with measurements, plus explicit use/avoid rules — where a kit states a number, that number is drawn.
