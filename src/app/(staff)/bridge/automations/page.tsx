import type { Metadata } from "next";
import { CITY_CODES } from "@/lib/brand";
import { getOperator } from "../../data";
import { AutomationsClient, type RuleRow } from "./automations-client";
import type { RuleAction, RuleConditions, TriggerEvent } from "./actions";

export const metadata: Metadata = { title: "Automations" };

const TRIGGERS: TriggerEvent[] = [
  "pass_confirmed",
  "weather_hold",
  "voyage_completed",
  "member_joined",
  "dues_failed",
];

function readConditions(raw: unknown): RuleConditions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === "string" && o[k] ? (o[k] as string) : undefined);
  return { tier: pick("tier"), harbor: pick("harbor"), class: pick("class") };
}

function readAction(raw: unknown): RuleAction {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.kind === "email")
      return { kind: "email", template: typeof o.template === "string" ? o.template : "" };
    return {
      kind: "notify",
      title: typeof o.title === "string" ? o.title : "",
      body: typeof o.body === "string" ? o.body : "",
    };
  }
  return { kind: "notify", title: "", body: "" };
}

export default async function AutomationsPage() {
  const { supabase } = await getOperator();

  const [rulesRes, harborsRes] = await Promise.all([
    supabase.from("automations").select("*").order("created_at", { ascending: false }),
    supabase.from("harbors").select("slug, name").order("position", { ascending: true }),
  ]);

  const rows: RuleRow[] = (rulesRes.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    trigger: (TRIGGERS as string[]).includes(a.trigger_event)
      ? (a.trigger_event as TriggerEvent)
      : "pass_confirmed",
    conditions: readConditions(a.conditions),
    action: readAction(a.action),
    active: a.active,
    lastRunAt: a.last_run_at,
  }));

  const harbors = (harborsRes.data ?? []).map((h) => ({
    slug: h.slug,
    label: `${CITY_CODES[h.slug] ?? h.name.slice(0, 3).toUpperCase()} — ${h.name}`,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Automations</span>
      <h1 className="hm-h1">Rules that run themselves.</h1>
      <p className="hm-lede">
        When something happens on the water, and the member matches, send the word. Write the rule
        once; it holds for the season.
      </p>
      <AutomationsClient rows={rows} harbors={harbors} />
    </div>
  );
}
