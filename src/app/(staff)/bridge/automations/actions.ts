"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

export type TriggerEvent =
  | "pass_confirmed"
  | "weather_hold"
  | "voyage_completed"
  | "member_joined"
  | "dues_failed";

export type RuleConditions = { tier?: string; harbor?: string; class?: string };
export type RuleAction =
  | { kind: "notify"; title: string; body: string }
  | { kind: "email"; template: string };

export type NewRule = {
  name: string;
  trigger: TriggerEvent;
  conditions: RuleConditions;
  action: RuleAction;
};

function done(): ActionResult {
  revalidatePath("/bridge/automations");
  return {};
}

export async function createAutomation(rule: NewRule): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const name = rule.name.trim();
  if (!name) return { error: "Give the rule a name." };
  if (rule.action.kind === "notify" && !rule.action.title.trim())
    return { error: "A word needs a title." };
  if (rule.action.kind === "email" && !rule.action.template.trim())
    return { error: "Name the email template." };

  const { error } = await supabase.from("automations").insert({
    name,
    trigger_event: rule.trigger,
    conditions: rule.conditions,
    action: rule.action,
    active: true,
  });
  if (error) return { error: ERR_LAND };
  return done();
}

export async function setAutomationActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("automations").update({ active }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}
