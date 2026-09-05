/* The audience of a broadcast, as rules. Shared by the page (to describe what
   was said and to whom), the builder (to edit it) and the action (to check it
   before the database checks it again). Not a "use server" module: it exports
   types and plain functions. The resolver lives in SQL
   (resolve_broadcast_audience) and this file mirrors its vocabulary. */

export type RuleField =
  | "standing" | "tier" | "plan" | "city" | "league"
  | "held_for_dues" | "phone_verified" | "on_camera" | "in_directory" | "upcoming_pass"
  | "aboard" | "waitlisted"
  | "joined" | "knots" | "nights";

export type RuleOp = "in" | "is" | "before" | "after" | "gte" | "lte";

export type Rule = {
  field: RuleField;
  op: RuleOp;
  /* A list of values for a set rule, a boolean, an ISO date, or a number. */
  value: string[] | boolean | string | number;
  not?: boolean;
};

export type Audience =
  | { kind: "all" }
  | { kind: "lapsed" }
  | { kind: "city"; id: string }
  | { kind: "episode"; id: string }
  | { kind: "tier"; tier: "regional" | "national" | "global" }
  | { kind: "member"; id: string }
  | { kind: "filter"; match: "all" | "any"; rules: Rule[] };

export type FieldShape = "set" | "bool" | "date" | "number";
export type FieldSource = "standing" | "tier" | "plan" | "city" | "league" | "episode";

export const FIELDS: Record<RuleField, { label: string; shape: FieldShape; source?: FieldSource; unit?: string }> = {
  standing: { label: "Standing", shape: "set", source: "standing" },
  tier: { label: "Tier", shape: "set", source: "tier" },
  plan: { label: "Plan", shape: "set", source: "plan" },
  city: { label: "Home city", shape: "set", source: "city" },
  league: { label: "League", shape: "set", source: "league" },
  held_for_dues: { label: "Held for dues", shape: "bool" },
  phone_verified: { label: "Verified phone", shape: "bool" },
  on_camera: { label: "In the show", shape: "bool" },
  in_directory: { label: "In the directory", shape: "bool" },
  upcoming_pass: { label: "Holds an upcoming pass", shape: "bool" },
  aboard: { label: "Aboard an episode", shape: "set", source: "episode" },
  waitlisted: { label: "Waitlisted on an episode", shape: "set", source: "episode" },
  joined: { label: "Joined", shape: "date" },
  knots: { label: "Knots banked", shape: "number", unit: "knots" },
  nights: { label: "Nights sailed", shape: "number", unit: "nights" },
};

export const RULE_FIELDS = Object.keys(FIELDS) as RuleField[];
export const MAX_RULES = 12;

export const STANDINGS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "departed", label: "Departed" },
];
export const TIER_OPTIONS = [
  { value: "regional", label: "Regional" },
  { value: "national", label: "National" },
  { value: "global", label: "Global" },
];

export type Lookups = {
  cities: Array<{ value: string; label: string }>;
  episodes: Array<{ value: string; label: string }>;
  plans: Array<{ value: string; label: string }>;
  leagues: Array<{ value: string; label: string }>;
};

/* The default: every active member — the same audience the old list opened on. */
export const EVERY_ACTIVE: Audience = { kind: "filter", match: "all", rules: [{ field: "standing", op: "in", value: ["active"] }] };

/* Starting points a hand can pick and then bend. */
export const PRESETS: Array<{ label: string; audience: Audience }> = [
  { label: "Every active member", audience: EVERY_ACTIVE },
  { label: "Held for dues", audience: { kind: "filter", match: "all", rules: [{ field: "held_for_dues", op: "is", value: true }] } },
  { label: "Holds an upcoming pass", audience: { kind: "filter", match: "all", rules: [{ field: "standing", op: "in", value: ["active"] }, { field: "upcoming_pass", op: "is", value: true }] } },
  { label: "Active, no phone verified", audience: { kind: "filter", match: "all", rules: [{ field: "standing", op: "in", value: ["active"] }, { field: "phone_verified", op: "is", value: false }] } },
  { label: "Joined this season", audience: { kind: "filter", match: "all", rules: [{ field: "standing", op: "in", value: ["active"] }, { field: "joined", op: "after", value: `${new Date().getFullYear()}-01-01` }] } },
];

export function optionsFor(source: FieldSource, l: Lookups): Array<{ value: string; label: string }> {
  switch (source) {
    case "standing": return STANDINGS;
    case "tier": return TIER_OPTIONS;
    case "plan": return l.plans;
    case "city": return l.cities;
    case "league": return l.leagues;
    case "episode": return l.episodes;
  }
}

/* Is the rule complete enough to resolve? */
export function ruleReady(r: Rule): boolean {
  const f = FIELDS[r.field];
  if (!f) return false;
  if (f.shape === "set") return Array.isArray(r.value) && r.value.length > 0;
  if (f.shape === "bool") return typeof r.value === "boolean";
  if (f.shape === "date") return typeof r.value === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.value) && (r.op === "before" || r.op === "after");
  if (f.shape === "number") return typeof r.value === "number" && Number.isFinite(r.value) && r.value >= 0 && (r.op === "gte" || r.op === "lte");
  return false;
}

export function audienceReady(a: Audience | null): boolean {
  if (!a) return false;
  if (a.kind !== "filter") return true;
  return a.rules.length >= 1 && a.rules.length <= MAX_RULES && a.rules.every(ruleReady);
}

function nameOf(source: FieldSource, values: string[], l: Lookups): string {
  const opts = optionsFor(source, l);
  const names = values.map((v) => opts.find((o) => o.value === v)?.label ?? "?");
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

export function describeRule(r: Rule, l: Lookups): string {
  const f = FIELDS[r.field];
  if (!f) return "?";
  const neg = r.not ? " not" : "";
  if (f.shape === "set" && f.source) return `${f.label} is${neg} ${nameOf(f.source, Array.isArray(r.value) ? r.value : [], l)}`;
  if (f.shape === "bool") return `${f.label}: ${(r.value === true) !== !!r.not ? "yes" : "no"}`;
  if (f.shape === "date") return `${f.label}${neg} ${r.op === "before" ? "before" : "on or after"} ${String(r.value)}`;
  if (f.shape === "number") return `${f.label}${neg} ${r.op === "lte" ? "at most" : "at least"} ${String(r.value)}`;
  return f.label;
}

export function describeAudience(a: Audience | Record<string, unknown> | null, l: Lookups): string {
  if (!a || typeof a !== "object") return "An audience";
  const kind = (a as { kind?: string }).kind;
  switch (kind) {
    case "all": return "Every active member";
    case "lapsed": return "Members held for dues";
    case "tier": return `${(a as { tier?: string }).tier ?? "a"} tier`;
    case "city": return l.cities.find((c) => c.value === (a as { id?: string }).id)?.label ?? "A city";
    case "episode": return l.episodes.find((e) => e.value === (a as { id?: string }).id)?.label ?? "An episode's manifest";
    case "member": return "Yourself — a test";
    case "filter": {
      const f = a as { match?: string; rules?: Rule[] };
      const rules = (f.rules ?? []).map((r) => describeRule(r, l));
      if (rules.length === 0) return "An audience with no rules";
      if (rules.length === 1) return rules[0];
      return `${f.match === "any" ? "Any of" : "All of"}: ${rules.join(" · ")}`;
    }
    default: return "An audience";
  }
}
