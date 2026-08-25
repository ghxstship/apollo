/* Element schema (XPMS3) — docs/brand/element-schema.md as types.

   Every produced element — signage, swag, print, equipment, credential — is
   catalogued against this schema. It is the join between the design system and
   production: these field names are the canonical column set for any elements
   table, procurement view, or budget rollup, so a rename here is a rename of the
   production system's vocabulary and not a refactor.

   Nothing in this file touches the database. No elements table exists yet; the
   schema change that would create one is written up rather than applied, because
   this Supabase project is shared with live production. When it is created, the
   column names are the keys below and the enums are the unions below.

   Two classification axes apply to every element, ORTHOGONALLY: the Five-A phase
   of the guest arc, and the weather class. They are separate axes on purpose —
   the Five-A phase says when in the day an element is used, and the weather
   class says what it survives. Collapsing them (an "outdoor activity" enum) is
   what loses the one combination that has to be caught, described at
   WeatherSafeElement below. */

/* ── Departments ────────────────────────────────────────────────────────────
   The URID's first segment is the department number, which is why these carry
   the number in the value rather than beside it: `4000 Build` and `4000.01.101`
   agreeing is a property you can check with a string comparison. */
export const DEPARTMENTS = [
  "3000 Marketing",
  "4000 Build",
  "5000 Production",
  "8000 Hospitality",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const ELEMENT_KINDS = ["equipment", "uniform", "consumable", "credential"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

export const ELEMENT_TIERS = ["04 Physical", "05 Experiential"] as const;
export type ElementTier = (typeof ELEMENT_TIERS)[number];

/** Production phase — when in the event lifecycle the element is handled. Not
    to be confused with `five_a`, which is when in the GUEST'S day it appears.
    An element can be Install/Afterglow: hung on Friday, seen at sunset. */
export const PRODUCTION_PHASES = ["Install", "Operate", "Strike"] as const;
export type ProductionPhase = (typeof PRODUCTION_PHASES)[number];

/** `class` is the specification, `instance` is a numbered physical thing. A
    rollup that sums both double-counts. */
export const ELEMENT_GRAINS = ["class", "instance"] as const;
export type ElementGrain = (typeof ELEMENT_GRAINS)[number];

export const ELEMENT_STATES = ["Active", "Draft", "Retired"] as const;
export type ElementState = (typeof ELEMENT_STATES)[number];

/** How much the cost is worth believing. Kept as an enum rather than a boolean
    because the Data Kit rolls budget up BY this field — a total that mixes
    quotes with guesses and does not say so is a number that gets committed. */
export const PRICE_CONFIDENCES = ["QUOTED", "PUBLISHED", "BENCHMARKED"] as const;
export type PriceConfidence = (typeof PRICE_CONFIDENCES)[number];

export const SENSES = ["Sight", "Touch", "Sound", "Taste", "Smell"] as const;
export type Sense = (typeof SENSES)[number];

/* ── Axis 1 · Five-A phase ──────────────────────────────────────────────────
   One phase of the guest arc per element. Used to audit coverage: a phase with
   no elements is a gap, which is only detectable if every element declares one
   — hence required, with no default. */
export const FIVE_A_PHASES = ["arrival", "atmosphere", "appetite", "activity", "afterglow"] as const;
export type FiveAPhase = (typeof FIVE_A_PHASES)[number];

export const FIVE_A_LABEL: Record<FiveAPhase, string> = {
  arrival: "Arrival",
  atmosphere: "Atmosphere",
  appetite: "Appetite",
  activity: "Activity",
  afterglow: "Afterglow",
};

export const FIVE_A_COVERS: Record<FiveAPhase, string> = {
  arrival: "Dock, check-in, boarding, first impression",
  atmosphere: "Ambient environment, styling, wardrobe",
  appetite: "Food, drink, hydration",
  activity: "Challenges, water sports, Confessional",
  afterglow: "Sunset ceremony, match reveal, Shore Leave, post-event media",
};

/* ── Axis 2 · Weather class ─────────────────────────────────────────────────
   Exposure tolerance. Marine is the default assumption on this product: the
   anchor experience is seven hours on an open pontoon at a sandbar. */
export const WEATHER_CLASSES = ["waterproof_marine", "all_weather", "indoor_only"] as const;
export type WeatherClass = (typeof WEATHER_CLASSES)[number];

export const WEATHER_TOLERANCE: Record<WeatherClass, string> = {
  waterproof_marine: "Full salt, spray, and sun exposure",
  all_weather: "Durable but not submersible; apparel and soft goods",
  indoor_only: "Pod, lounge, or venue only",
};

/* ── The element ────────────────────────────────────────────────────────────
   Field order and names follow element-schema.md exactly. */
interface ElementFields {
  /** Human key, prefixed by family: `SIG-01`, `SWG-03`, `PRN-02`. */
  element_id: string;
  /** Dotted cost code `DDDD.CC.NNN` — department.category.item, e.g.
      `4000.01.101`. The first segment must match `department`'s number. */
  urid: string;
  name: string;
  department: Department;
  /** e.g. Signage & Wayfinding, Scenic Fabrication, Guest Amenities & Merch. */
  discipline: string;
  /** Free label within the discipline: Entry & Dock Signage, Match Envelopes. */
  category: string;
  kind: ElementKind;
  tier: ElementTier;
  phase: ProductionPhase;
  grain: ElementGrain;
  element_state: ElementState;
  /** Full production spec: dimensions, material, finish. The Print, Signage and
      Wearables Kits carry this string VERBATIM onto artwork specs, so it is
      prose for a fabricator, not a summary for a reader. */
  specifications: string;
  /** Compound unit `unit·scope` — `item·event`, `item·unit`, `set·event`,
      `lot·event`, `item·sailing`. */
  uom: string;
  /** Quantity at the stated UOM. */
  qty: number;
  unit_cost_usd: number;
  /** `qty × unit_cost_usd`. Stored rather than derived because a quote can be
      for a bundle whose arithmetic does not reduce to the unit price. */
  total_cost_usd: number;
  price_confidence: PriceConfidence;
  /** Sensory channels engaged, slash-separated: `Sight / Touch`. */
  sense: string;
  /** Axis 1. */
  five_a: FiveAPhase;
  /** Guest sees it. 0/1 rather than boolean — the workbook column is numeric
      and the Data Kit sums it. Anything with `client_visible = 1` must satisfy
      the imagery and type canon; internal-only elements need only the spec. */
  client_visible: 0 | 1;
  /** The event cannot run without it. The Show Kit filters the run-of-show
      board on this. */
  critical_path: 0 | 1;
  /** Axis 2. */
  weather: WeatherClass;
}

/* ── The one combination the type system can catch ──────────────────────────
   From §5 of the handoff: "an indoor_only element in an activity phase with no
   named substitute is a specification error."

   The Activity phase is the sandbar — paddleboard heats, the ring raft hub, the
   Confessional Pod — and it is the two hours of the day furthest from a roof.
   An indoor_only element filed there is either mis-specified or it is the
   Confessional Pod's own interior, which is genuinely indoors and genuinely in
   Activity. The difference between those two cases is whether anyone has said
   what happens when the weather turns, so that is what the type demands: name
   the substitute, or the element does not typecheck.

   Modelled as a discriminated union on the two axes rather than as a validator,
   because a validator runs at runtime on data someone has already committed to
   a purchase order. This one fails at the keystroke.

   `weather_substitute` is deliberately a non-empty description and not a
   boolean flag: "yes we thought about it" is not a substitution plan, and the
   Show Kit prints this string on the weather-hold card. */
export type WeatherSafeElement = ElementFields &
  (
    | { five_a: Exclude<FiveAPhase, "activity">; weather_substitute?: string }
    | { five_a: "activity"; weather: Exclude<WeatherClass, "indoor_only">; weather_substitute?: string }
    | {
        five_a: "activity";
        weather: "indoor_only";
        /** Required. What runs instead when this element cannot. Named, not
            implied — "moved indoors" is not a substitute on a boat. */
        weather_substitute: string;
      }
  );

export type Element = WeatherSafeElement;

/* Runtime counterpart, for data that arrives from outside the type system — a
   CSV import, a workbook paste, an API response. Same rule, stated once more
   because the compiler cannot reach a value it never saw. */
export function elementSpecificationError(el: ElementFields & { weather_substitute?: string }): string | null {
  if (el.five_a === "activity" && el.weather === "indoor_only" && !el.weather_substitute?.trim()) {
    return `${el.element_id} is indoor_only in the activity phase with no named substitute`;
  }
  if (!el.urid.startsWith(el.department.slice(0, 4))) {
    return `${el.element_id} has URID ${el.urid} under department ${el.department} — the first segment must be the department number`;
  }
  return null;
}
