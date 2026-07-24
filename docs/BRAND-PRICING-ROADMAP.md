# LYRE Social — pricing architecture & brand unification roadmap

Incorporates the 2026-07-24 planning sheet: memberships (Access / Regional /
National / Global / Guest, three price tiers each), event taxonomy (Sea Day —
Voyage <4h · Expedition 4–8h · Odyssey >8h; Port Day — Trek · Excursion ·
Overland; Overnight), per-yacht manning list (1 Ambassador · 1 DJ/Host ·
1 Chef/Bartender · 10 guests), city set MIA · LAX · CHI · NYC, LORE Magazine,
and the tagline "Strike a chord."

---

## 1 · Pricing — unit economics first

**Operating cadence (given):** 4 events/month/harbor — 2 Sea Days + 2 Port
Days. Sea Days run as a flotilla of 3–4 yachts, **profitable at 3**.

**Per-yacht day model** (charter + fuel ≈ $3,000; 3 crew ≈ $900; F&B for 10
≈ $400; ops/insurance amortization ≈ $300): **≈ $4,600/yacht-day**, i.e.
**≈ $460 per berth** fully loaded at 10 guests/yacht. A 3-yacht flotilla day
costs ≈ $13,800 and seats 30; the 4th yacht is ~pure margin capacity
(marginal cost $4,600 against 10 berths that are already demanded).
Port Days land far lower (venue + staff, no charter): ≈ $3,500–4,500/day for
40–60 heads → ≈ $80–110/head.

**Monthly cost per harbor:** 2 flotilla days ≈ $27,600 + 2 Port Days ≈
$8,500 → **≈ $36k**. Break-even + 30% target margin → **≈ $47–50k revenue
per harbor per month**.

**Reading the sheet's grid** — the three unlabeled price columns map most
coherently to the three Sea-Day classes (access ceiling): Tier I = Voyage
(<4h), Tier II = + Expedition (4–8h), Tier III = + Odyssey (>8h). That is the
recommended interpretation: *geography sets where you sail (Regional /
National / Global); class tier sets how far.* Two dials, both легible.

**Recommended price architecture** (refinements on the sheet):

| Membership | Events/mo | I · Voyage | II · Expedition | III · Odyssey | Notes |
| --- | --- | --- | --- | --- | --- |
| Access | 0 | $0 | — | — | The funnel: waitlist + one salon-guest invitation. Keep; it feeds vetting. |
| Regional | 1 | $199 | $299 | $549 | **Lower Tier III from $799** — a 1-event member paying $799 monthly prices out against Guest passes; $549 keeps the ladder honest. |
| National | 3 | $349 | $749 | $1,099 | **Raise Tier I $299→$349**: at $299 the 1→3 event jump for $100 cannibalizes Regional II. |
| Global | 7 | $799 | $1,199 | $1,499 | As proposed — anchors the ladder; includes 2 guest passes/event (already enforced in product). |
| Guest | 1 | $149 | $249 | $349 | **Raise floor $99→$149**: a Voyage berth carries ≈$460 loaded cost; guests must ride yachts that members already filled past the 3rd-yacht threshold. Cap guest berths to the 4th yacht. |

Structural recommendations:
1. **Odyssey (>8h) as class-gated, not just priced** — utilization risk is
   highest there; sell it as scarce (it is), fill by tier priority windows
   (already spec'd) and require the $50 deposit (already implemented).
2. **The 3rd-yacht rule as product logic**: minimum viable manifest = 30
   berths by T-72h. Below it, auto-drop to 2 yachts only if ≥20 berths;
   otherwise weather-hold/convert. Surface "Flotilla forms at 30" in the UI —
   scarcity honesty is on-brand.
3. **Annual = 10× monthly** (two months free), payable to the member account;
   payment plans already exist in the house-ledger model.
4. **Unused event allowances convert to fathoms** (e.g. 100 FM per unused
   berth-right, capped) — keeps "miles, not likes" true and softens
   breakage resentment without refunds.
5. **Sanity check**: 120 members/harbor at a plausible mix (65 Regional avg
   $260, 40 National avg $650, 15 Global avg $1,150) ≈ **$60k/mo** + guest
   passes ≈ $3–5k → clears the $50k bar with room for the 4th yacht to be
   pure upside.

---

## 2 · Branded-surface inventory (as built today)

**Master brand:** LYRE SOCIAL — Neon Brutalist v4, Marcellus/Archivo/Space
Mono, lava gradients, lyre mark.

| # | Surface | Micro-brand carried | Where |
| --- | --- | --- | --- |
| 1 | Marketing site (10 routes) | master + The Dispatch, Crew wanted | `(site)/` |
| 2 | Brand kit page | master (canonical rules) | `/brand` |
| 3 | Gangway (auth + vetting) | **Gangway** | `/gangway`, `/auth/*` |
| 4 | Member app shell (8 tabs) | Harbor · the Word · the Manifest | `(member)/` |
| 5 | The Wardroom (feed) | **The Wardroom**, hails | `/wardroom` |
| 6 | Portal (loyalty) | **Fathoms** currency | `/portal` |
| 7 | Member card + boarding stub | master (credential) | `/card`, `/stub/*` |
| 8 | Now (underway) + galley self-order | **The Galley** | `/now` |
| 9 | The Chandlery (shop) | **The Chandlery** | `/chandlery` |
| 10 | The Purser (agent) | **The Purser** | panel, `/api/purser` |
| 11 | Harbormaster console (8 tabs) | **Harbormaster** | `/harbormaster` |
| 12 | Galley POS (register) | The Galley | `/harbormaster/galley` |
| 13 | Crew ATS | **Crew wanted** | `/harbormaster/crew` |
| 14 | Emails (8 templates + sender) | master, shore office sender | `supabase/functions/send-outbox` |
| 15 | The Dispatch (editorial) | **The Dispatch → LORE** | `/dispatch` |
| 16 | Shore office (support) | **The Shore Office** | `/support` |
| 17 | PWA identity (icons, SW, manifest) | master | `public/` |
| 18 | Design-system template kits | decks, social, signage, print | DS `templates/` (not yet in app) |

**Micro-brand roster:** Gangway · the Wardroom · the Chandlery · the Purser ·
Harbormaster · the Galley · the Shore Office · Fathoms · the Word · the
Manifest · the Dispatch/LORE · Crew wanted.

## 3 · Unifying the brand language

1. **Two-register naming rule.** The master brand speaks in *house functions*
   with the definite article, lowercase in prose ("the Wardroom", "the
   Purser") and UPPERCASE only via CSS. Micro-brands never get their own
   logos, colors, or type — they are rooms in one house. The only marks that
   exist: the lyre, the wordmark, and **LORE**'s masthead (type-only).
2. **LORE Magazine absorbs the Dispatch.** One editorial masthead: **LORE**
   (Marcellus, tracked wide) as the publication; "a dispatch" survives as
   the unit ("File a dispatch — LORE reads everything"). Route `/lore` with
   301s from `/dispatch/*`; the Sunday email becomes "LORE, Sundays."
3. **Event taxonomy as brand grammar.** Codes SEA / PRT / OVN join the mono
   data register everywhere data renders (manifest rows, stubs, POS tickets,
   reports): `SEA · EXPEDITION · 6 HRS · 26 NM`. Class names (Voyage,
   Expedition, Odyssey, Trek, Excursion, Overland) are the human register.
   The existing sea/shore/sky *visual* event themes map 1:1 (SEA→sea,
   PRT→shore, OVN→sky) — no new palettes.
4. **City codes as data tokens.** MIA · LAX · CHI · NYC in Space Mono caps
   wherever coordinates/meta render; spelled-out names in prose. (LAX is the
   brand's airport-code register for Los Angeles — keep even though the
   harbor is MDR; the register is cultural, not geographic.)
5. **Tagline discipline.** "Strike a chord." is lockup-adjacent only: hero,
   OG images, card backs, email footers. Never inline in body copy, never in
   UI chrome. It joins the one-accent-per-view rule (a tagline is an accent).
6. **One lexicon, one source.** Promote the lexicon to code:
   `src/lib/brand.ts` exporting TAXONOMY, CITY_CODES, LEXICON, TAGLINE —
   every surface imports it; the `/brand` page renders from it; the route
   audit greps rendered HTML for banned terms ("ticket", "RSVP'd", "user",
   "points", pirate-isms). The DS `readme.md` stays the prose constitution;
   `brand.ts` is the machine copy.

## 4 · Implementation / migration roadmap

**Phase 1 — Codify (repo-only, ~1 sprint)**
`src/lib/brand.ts` (taxonomy/cities/lexicon/tagline) + refactor surfaces to
import it; `/dispatch → /lore` rename with permanent redirects + sitemap
update; brand-kit page gains taxonomy, tagline rules, LORE masthead, city
codes; extend the route audit with the banned-term check. No schema changes.

**Phase 2 — Taxonomy in data (~1 sprint)**
Migration: `voyages.sub_class` (voyage|expedition|odyssey|trek|excursion|
overland) derived from class+duration; backfill seeds; render codes across
manifest/stub/POS/reports/emails; Harbormaster voyage form gains the
sub-class select and duration validation (<4h/4–8h/>8h).

**Phase 3 — Membership re-architecture (~2 sprints, gated on pricing
sign-off)**
Migration: `membership_plans` (type × tier I/II/III, price, events/mo,
class ceiling) + `profiles.plan_id`; allowance metering view (events used
per calendar month vs plan); Access + Guest as first-class plans (Access =
today's applicant/waitlist state made explicit; Guest passes become
purchasable line items on the house ledger). RSVP guard extends: class
ceiling + monthly allowance + guest-yacht cap. Marketing membership page and
You-tab dues render from `membership_plans` — kills the last hardcoded
dollar figures. Stripe products map 1:1 to plans when keys land.

**Phase 4 — Flotilla ops (~1 sprint)**
`vessels` + `voyage_vessels` (capacity 10, manning list per the sheet);
manifest assigns berths to yachts; Harbormaster gets flotilla view (3-yacht
viability meter, T-72h check); Now tab shows your yacht + ambassador.
Reports gain per-yacht fill and the profitable-at-3 flag.

**Phase 5 — Outward surfaces (ongoing)**
Emails re-skinned with LORE masthead + tagline footer; OG images; social /
signage / print kits generated from the DS templates with the new taxonomy;
wallet passes when signing certs arrive.

Sequencing note: Phases 1–2 are invisible to members and safe to ship
immediately; Phase 3 is the only breaking change (existing members map to
National II by default, grandfathered pricing flagged on the plan row);
Phase 4 unlocks the ops model the pricing depends on — ship before raising
Sea-Day cadence.
