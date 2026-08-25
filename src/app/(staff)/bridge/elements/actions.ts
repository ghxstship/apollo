"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { moduleTables } from "@/lib/module-tables";
import {
  DEPARTMENTS,
  ELEMENT_GRAINS,
  ELEMENT_KINDS,
  ELEMENT_STATES,
  ELEMENT_TIERS,
  FIVE_A_PHASES,
  PRICE_CONFIDENCES,
  PRODUCTION_PHASES,
  WEATHER_CLASSES,
  elementSpecificationError,
  type Department,
  type ElementGrain,
  type ElementKind,
  type ElementState,
  type ElementTier,
  type FiveAPhase,
  type PriceConfidence,
  type ProductionPhase,
  type WeatherClass,
} from "@/types/elements";
import { staffContext, ERR_STAFF, type ActionResult } from "../../staff";

/* The elements catalogue — every produced element, filed against the XPMS3
   schema.

   src/types/elements.ts opens with "No elements table exists yet". It does now,
   with the schema's own column names and every enum as a check constraint — and
   until this file there was still no writer for it, so /show read an empty
   catalogue and said "The elements catalogue is empty. Nothing is specified
   yet" on every load, permanently.

   Two rules are enforced by the database and restated here so the person
   filling in the form is told which field is wrong rather than which constraint
   fired: the URID's first segment must be the department's number, and an
   indoor_only element in the activity phase must name a substitute before it
   can go Active. The second is a DEFERRED constraint trigger that scans the
   whole table at commit, which is why the order of the writes below matters. */

export type ElementInput = {
  elementId: string;
  urid: string;
  name: string;
  department: Department;
  discipline: string;
  category: string;
  kind: ElementKind;
  tier: ElementTier;
  phase: ProductionPhase;
  grain: ElementGrain;
  elementState: ElementState;
  specifications: string;
  uom: string;
  qty: number;
  unitCostUsd: number;
  priceConfidence: PriceConfidence;
  sense: string;
  fiveA: FiveAPhase;
  clientVisible: boolean;
  criticalPath: boolean;
  weather: WeatherClass;
  /** What runs instead when this element cannot. Required — by the database —
      for an Active indoor_only element in the activity phase. */
  substitute: string;
};

function done(): ActionResult {
  revalidatePath("/bridge/elements");
  revalidatePath("/show");
  return {};
}

const oneOf = <T extends string>(list: readonly T[], v: string): v is T =>
  (list as readonly string[]).includes(v);

function validate(input: ElementInput): string | null {
  if (!input.elementId.trim()) return "An element needs its key — SIG-01, SWG-03, PRN-02.";
  if (!input.name.trim()) return "An element needs a name.";
  if (!input.discipline.trim()) return "Name the discipline it sits in.";
  if (!input.category.trim()) return "Name the category within the discipline.";
  if (!input.specifications.trim()) {
    return "The specification is carried verbatim onto artwork specs — dimensions, material, finish.";
  }
  if (!input.uom.trim()) return "The unit of measure is a compound — item·event, set·event, lot·event.";
  if (!/^\d{4}\.\d{2}\.\d{3}$/.test(input.urid.trim())) {
    return "A URID is DDDD.CC.NNN — four digits, two, three.";
  }
  if (!oneOf(DEPARTMENTS, input.department)) return "That is not a department.";
  if (!oneOf(ELEMENT_KINDS, input.kind)) return "That is not an element kind.";
  if (!oneOf(ELEMENT_TIERS, input.tier)) return "That is not a tier.";
  if (!oneOf(PRODUCTION_PHASES, input.phase)) return "That is not a production phase.";
  if (!oneOf(ELEMENT_GRAINS, input.grain)) return "That is not a grain.";
  if (!oneOf(ELEMENT_STATES, input.elementState)) return "That is not an element state.";
  if (!oneOf(PRICE_CONFIDENCES, input.priceConfidence)) return "That is not a price confidence.";
  if (!oneOf(FIVE_A_PHASES, input.fiveA)) return "That is not a Five-A phase.";
  if (!oneOf(WEATHER_CLASSES, input.weather)) return "That is not a weather class.";
  if (!(input.qty >= 0)) return "Quantity cannot be negative.";
  if (!(input.unitCostUsd >= 0)) return "A unit cost cannot be negative.";

  /* The runtime counterpart of the WeatherSafeElement union, run against the
     same two rules the compiler holds for data it can see. It names the element
     and the fault; only the department-prefix half is reworded, because "the
     first segment must be the department number" is already the sentence. */
  const spec = elementSpecificationError({
    element_id: input.elementId.trim(),
    urid: input.urid.trim(),
    name: input.name.trim(),
    department: input.department,
    discipline: input.discipline.trim(),
    category: input.category.trim(),
    kind: input.kind,
    tier: input.tier,
    phase: input.phase,
    grain: input.grain,
    element_state: input.elementState,
    specifications: input.specifications.trim(),
    uom: input.uom.trim(),
    qty: input.qty,
    unit_cost_usd: input.unitCostUsd,
    total_cost_usd: input.qty * input.unitCostUsd,
    price_confidence: input.priceConfidence,
    sense: input.sense.trim(),
    five_a: input.fiveA,
    client_visible: input.clientVisible ? 1 : 0,
    critical_path: input.criticalPath ? 1 : 0,
    weather: input.weather,
    weather_substitute: input.substitute.trim() || undefined,
  });
  if (spec) return spec;
  return null;
}

function rowFor(input: ElementInput) {
  return {
    element_id: input.elementId.trim(),
    urid: input.urid.trim(),
    name: input.name.trim(),
    department: input.department,
    discipline: input.discipline.trim(),
    category: input.category.trim(),
    kind: input.kind,
    tier: input.tier,
    phase: input.phase,
    grain: input.grain,
    element_state: input.elementState,
    specifications: input.specifications.trim(),
    uom: input.uom.trim(),
    qty: input.qty,
    unit_cost_usd: input.unitCostUsd,
    /* Left null so total_an_element does the arithmetic. Stored rather than
       derived because a quote can be for a bundle whose total does not reduce
       to the unit price — but the default is the multiplication, and the
       trigger is where that lives. */
    total_cost_usd: null as number | null,
    price_confidence: input.priceConfidence,
    sense: input.sense.trim() || null,
    five_a: input.fiveA,
    client_visible: input.clientVisible ? 1 : 0,
    critical_path: input.criticalPath ? 1 : 0,
    weather: input.weather,
  };
}

const needsSubstitute = (i: ElementInput) => i.fiveA === "activity" && i.weather === "indoor_only";

export async function saveElement(
  elementRowId: string | null,
  input: ElementInput
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const db = moduleTables(supabase);

  const fault = validate(input);
  if (fault) return { error: fault };

  const row = rowFor(input);
  const context = input.substitute.trim();

  if (elementRowId) {
    /* ORDER MATTERS, AND IT DEPENDS ON WHICH WAY THE REQUIREMENT IS MOVING.
       Each of these is a separate PostgREST request and therefore its OWN
       transaction — the constraint being DEFERRABLE buys nothing across two of
       them, because each one commits alone.

       Taking the requirement ON  (-> activity + indoor_only): the substitute
       must exist before the element row demands it.
       Taking the requirement OFF (-> all_weather, or off activity): the element
       must stop demanding it before the substitute goes.

       This only did the first. Clearing a substitute and moving to all_weather
       in one save deleted the row while the element was still
       Active/activity/indoor_only, so that delete's own commit was refused —
       with a check violation that `voice()` maps to "check the numbers and try
       again", on a form where no number was wrong. The operator's workaround
       was to save twice. */
    if (!needsSubstitute(input)) {
      const { error } = await db.from("elements").update(row).eq("id", elementRowId);
      if (error) return { error: dressed(error) };
    }

    if (context) {
      const { error } = await db
        .from("element_substitutes")
        .upsert({ element_id: elementRowId, context }, { onConflict: "element_id,context" });
      if (error) return { error: voice(error) };
      /* Any earlier wording of the same substitute is stale. Removed only
         after the new one is in place — element_substitutes carries its own
         deferred guard against deleting the last one. */
      const { error: pruneError } = await db
        .from("element_substitutes")
        .delete()
        .eq("element_id", elementRowId)
        .neq("context", context);
      if (pruneError) return { error: voice(pruneError) };
    } else if (!needsSubstitute(input)) {
      const { error } = await db.from("element_substitutes").delete().eq("element_id", elementRowId);
      if (error) return { error: voice(error) };
    }

    /* Already written above when the requirement was being taken off. */
    if (needsSubstitute(input)) {
      const { error } = await db.from("elements").update(row).eq("id", elementRowId);
      if (error) return { error: dressed(error) };
    }
    return done();
  }

  /* A new element has no id to file a substitute against, and the trigger only
     objects to an ACTIVE one. So the hard case — a new Active element that is
     indoor_only in the activity phase, which is the Confessional Pod's own
     interior and a real filing — lands as Draft, takes its substitute, and is
     then set Active. If either later step fails the element sits in Draft,
     which is a true and visible state rather than a half-written row. */
  const deferActivation = needsSubstitute(input) && input.elementState === "Active";
  const { data: created, error } = await db
    .from("elements")
    .insert(deferActivation ? { ...row, element_state: "Draft" } : row)
    .select("id")
    .maybeSingle();
  if (error) return { error: dressed(error) };

  const newId = (created as { id?: string } | null)?.id ?? null;
  if (context && newId) {
    const { error: subError } = await db
      .from("element_substitutes")
      .upsert({ element_id: newId, context }, { onConflict: "element_id,context" });
    if (subError) return { error: voice(subError) };
  }
  if (deferActivation && newId) {
    const { error: activateError } = await db
      .from("elements")
      .update({ element_state: "Active" })
      .eq("id", newId);
    if (activateError) return { error: dressed(activateError) };
  }
  return done();
}

/* The two database refusals this form can provoke that voice() would render as
   "That didn't land": a duplicate element key and the URID/department mismatch.
   Both name the field the person is looking at. */
function dressed(error: { message?: string | null; code?: string | null }): string {
  const m = error.message ?? "";
  if (/elements_element_id_key/.test(m)) return "That element key is already in the catalogue.";
  if (/element_urid_matches_department/.test(m)) {
    return "The URID's first segment has to be the department's number.";
  }
  if (/indoor_only in the activity phase/.test(m)) return m;
  return voice(error);
}

export async function removeElement(elementRowId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await moduleTables(supabase).from("elements").delete().eq("id", elementRowId);
  if (error) return { error: voice(error) };
  return done();
}
