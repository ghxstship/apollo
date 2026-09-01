import type { Metadata } from "next";
import { moduleTables } from "@/lib/module-tables";
import type {
  Department,
  ElementGrain,
  ElementKind,
  ElementState,
  ElementTier,
  FiveAPhase,
  PriceConfidence,
  ProductionPhase,
  WeatherClass,
} from "@/types/elements";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { ElementsClient, type ElementListRow } from "./elements-client";

export const metadata: Metadata = { title: "Elements" };

interface ElementRecord {
  id: string;
  element_id: string;
  urid: string;
  name: string;
  department: Department;
  discipline: string;
  category: string;
  kind: ElementKind;
  tier: ElementTier;
  phase: ProductionPhase;
  grain: ElementGrain;
  element_state: ElementState;
  specifications: string;
  uom: string;
  qty: number;
  unit_cost_usd: number;
  total_cost_usd: number | null;
  price_confidence: PriceConfidence;
  sense: string | null;
  five_a: FiveAPhase;
  client_visible: number;
  critical_path: number;
  weather: WeatherClass;
}

interface SubstituteRecord {
  element_id: string;
  context: string;
}

export default async function ElementsPage() {
  const { supabase } = await getOperator();
  const db = moduleTables(supabase);

  const [elementsRes, subsRes] = await Promise.all([
    db.from("elements").select("*").order("element_id"),
    db.from("element_substitutes").select("element_id, context"),
  ]);

  const records = must(elementsRes as { data: ElementRecord[] | null; error: null });
  const subs = must(subsRes as { data: SubstituteRecord[] | null; error: null });
  /* One substitute per element on this surface. The table is keyed on
     (element, context) so an element can carry several; the form edits the
     first and leaves the rest alone rather than pretending a textarea is a
     list. */
  const substituteOf = new Map<string, string>();
  for (const s of subs) {
    if (!substituteOf.has(s.element_id)) substituteOf.set(s.element_id, s.context);
  }

  const rows: ElementListRow[] = records.map((e) => ({
    id: e.id,
    elementId: e.element_id,
    urid: e.urid,
    name: e.name,
    department: e.department,
    discipline: e.discipline,
    category: e.category,
    kind: e.kind,
    tier: e.tier,
    phase: e.phase,
    grain: e.grain,
    elementState: e.element_state,
    specifications: e.specifications,
    uom: e.uom,
    qty: Number(e.qty),
    unitCostUsd: Number(e.unit_cost_usd),
    totalCostUsd: e.total_cost_usd === null ? null : Number(e.total_cost_usd),
    priceConfidence: e.price_confidence,
    sense: e.sense ?? "",
    fiveA: e.five_a,
    clientVisible: e.client_visible === 1,
    criticalPath: e.critical_path === 1,
    weather: e.weather,
    substitute: substituteOf.get(e.id) ?? "",
  }));

  return (
    <div>
      <span className="hm-eyebrow">Elements</span>
      <h1 className="hm-h1">The catalogue.</h1>
      <p className="hm-lede">
        Every produced element, filed against the element schema. Two
        classification axes apply to all of them and they are orthogonal: the
        Five-A phase says when in the guest&apos;s day it appears, and the
        weather class says what it survives.
      </p>
      <p className="hm-note">
        The one combination the schema exists to catch is an indoor-only element
        in the activity phase — the two hours furthest from a roof — with no
        named substitute. It cannot go Active until it says what runs instead.
      </p>
      <ElementsClient rows={rows} />
    </div>
  );
}
