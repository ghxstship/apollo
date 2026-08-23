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
  | { kind: "email"; template: string }
  | { kind: "sms"; template: string };

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
  /* A text is template-only at the provider, so a rule may only name one we
     have actually registered — otherwise it queues a message that bounces. */
  if (rule.action.kind === "sms") {
    const code = rule.action.template.trim();
    if (!code) return { error: "Pick a text template." };
    const { data: known } = await supabase
      .from("sms_templates")
      .select("code")
      .eq("code", code)
      .eq("active", true)
      .maybeSingle();
    if (!known) return { error: "That text template is not registered." };
  }

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
