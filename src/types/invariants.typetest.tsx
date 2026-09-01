/* Compile-time invariant test. Nothing imports this file and nothing renders
   it; it exists so that `tsc --noEmit` fails the moment one of the brand's
   mechanical invariants stops being mechanical.

   Every `@ts-expect-error` below is an assertion in both directions: TypeScript
   errors if the line it guards compiles cleanly, so loosening one of these
   types — widening WordmarkProps back to `string`, collapsing the element union
   into a flat interface — breaks the build here rather than shipping quietly.

   What is proved:
   - editorial and caps are two variants of ONE setting, not a combination
   - the suffix is one of the six divisions and Shop is not among them
   - there is no prop that takes the brackets off the anchor
   - an indoor_only element in the activity phase must name its substitute

   What is NOT proved, and still needs a human: `caps` is a large-physical-goods
   setting and `editorial` is banned in UI and navigation. Both are legal
   TypeScript in a nav bar. See the Wordmark's own doc comment.

   Not proved either: the invariants that live in prose — no emoji, no
   exclamation marks, sentence case, first names on guest surfaces. Those are
   the route audit's job (scripts/audit-routes.mjs), which greps rendered HTML. */

import { Wordmark } from "@/components/ds/display";
import type { Element } from "@/types/elements";

export const ok1 = <Wordmark suffix="Hinged" />;
export const ok2 = <Wordmark suffix={null} />;
export const ok3 = <Wordmark suffix="Bound" editorial />;
export const ok4 = <Wordmark suffix="Cut" caps />;
export const ok5 = <Wordmark suffix="Brand" />;
// @ts-expect-error editorial and caps are the two variants of ONE setting
export const bad1 = <Wordmark suffix="Hinged" editorial caps />;
// @ts-expect-error Shop is commerce, not a division — a seventh suffix is a brand decision
export const bad2 = <Wordmark suffix="Shop" />;
// @ts-expect-error the anchor has no prop that removes it, and no `bare` escape
export const bad3 = <Wordmark anchor={false} />;

const base = {
  element_id: "SIG-06", urid: "4000.03.301", name: "Confessional Pod Wrap",
  department: "4000 Build" as const, discipline: "Scenic Fabrication",
  category: "Media Enclosures", kind: "equipment" as const,
  tier: "05 Experiential" as const, phase: "Install" as const,
  grain: "class" as const, element_state: "Active" as const,
  specifications: "Acoustic foam, marine vinyl wrap", uom: "set·event",
  qty: 1, unit_cost_usd: 1200, total_cost_usd: 1200,
  price_confidence: "QUOTED" as const, sense: "Sight / Touch",
  client_visible: 1 as const, critical_path: 1 as const,
};
export const el1: Element = { ...base, five_a: "activity", weather: "indoor_only", weather_substitute: "Ring raft hub if the pod is struck" };
export const el2: Element = { ...base, five_a: "atmosphere", weather: "indoor_only" };
export const el3: Element = { ...base, five_a: "activity", weather: "waterproof_marine" };
// @ts-expect-error indoor_only in the activity phase with no named substitute
export const el4: Element = { ...base, five_a: "activity", weather: "indoor_only" };
