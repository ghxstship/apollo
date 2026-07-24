# Event snapshot enrichment — decision & plan

Prompted by The Yacht Week's browse results (photo carousel, BEST VALUE
badge, ★ rating, dates + week number, max guests / cabins / length / A/C /
year, total + per-person price, save/sort). Decision: **enrich, selectively.**
TYW sells boats; we sell days. The event stays the product; the fleet is
supporting cast.

## Adopt (data already exists or is one column away)

| Element | Our form | Source |
| --- | --- | --- |
| Duration | `6 HRS` mono chip beside class (`SEA · EXPEDITION · 6 HRS`) | starts/ends |
| Week number | `WEEK 34` in the mono meta — ship's-log register, fits the brand | starts_at |
| Fleet snapshot | `3 YACHTS · 10 PASSES EACH` on Sea Day cards | voyage_vessels |
| Capacity honesty | passes left (have) + held passes excluded (have) | voyage_capacity |
| Price framing | per-pass price (have) + `COMPLIMENTARY` + deposit chip `$50 HOLDS IT` | price/deposit_required |
| Vessel specs | event page "The fleet" rows: name · LOA ft · year · cabins | vessels + 3 new columns |
| Filters/sort | add harbor + month + class-ladder filters, date sort, to /voyages | existing columns |

## Reject (brand conflicts)

- **Ratings/reviews** — "miles, not likes"; the club doesn't score itself.
- **Value/urgency badges** (BEST VALUE) — hype voice is banned; scarcity is
  already expressed honestly (passes left, LAST PASSES at ≤5).
- **Stock imagery carousels** — gradients remain the sanctioned placeholder
  until photography is commissioned; the Card media slot is carousel-ready
  when it lands.

## Defer (decide later)

- Save/wishlist hearts — low value at club scale (manifests are small and
  curated); revisit if the calendar grows past ~20 concurrent events.
- Per-vessel booking choice — assignment stays operational (the Bridge
  assigns berths-on-boats); members buy the day, not the hull.

## Plan

1. **Data** (small migration): `vessels.length_ft int`, `vessels.year int`,
   `vessels.cabins int`; seed the four yachts.
2. **Cards** (/voyages + member manifest): duration + week chips, fleet
   snapshot line on Sea Days, deposit chip.
3. **Event page**: "The fleet" section under the itinerary — one hairline
   row per assigned yacht (name Marcellus, specs mono), ambassador name when
   staffing lands.
4. **Browse controls**: harbor/month/class filters + date sort on /voyages.
5. **Photography-gated**: swap gradient for a real per-voyage carousel when
   imagery exists (no code blocked on it).

Steps 1–4 are one working session; execute after the current pass/salon
sweep ships so the copy lands once, in the new vocabulary.
