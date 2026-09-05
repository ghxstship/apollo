"use server";

import { revalidatePath } from "next/cache";
import { moduleTables } from "@/lib/module-tables";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";
import { AUTOMATION_TEXT_KEYS, LETTERS_A_RULE_CANNOT_FILL, textTemplateNeeds } from "./automation-letters";

export type TriggerEvent =
  | "pass_confirmed"
  | "weather_hold"
  | "voyage_completed"
  | "member_joined"
  | "dues_failed";

export type RuleConditions = { tier?: string; city?: string; setting?: string };
export type RuleAction =
  | { kind: "notify"; title: string; body: string }
  | { kind: "email"; template: string }
  /* A text is template-only at the carrier; the template's parameter_map says
     which payload keys fill its variables. The dispatcher writes the member,
     the episode and a link; a template that also reads `title` or `body` gets
     them from the rule, with {member} and {episode} filled in. */
  | { kind: "sms"; template: string; title?: string; body?: string }
  /* Call a registered webhook. The dispatcher posts the event and its context
     to the hook's URL through webhook_deliveries; the id comes off the
     `webhooks` table and nowhere else. */
  | { kind: "webhook"; webhookId: string };

export type NewRule = {
  name: string;
  trigger: TriggerEvent;
  conditions: RuleConditions;
  action: RuleAction;
  /* Minutes the rule waits before it acts; 0 fires on the event. Up to
     thirty days — the column's CHECK. */
  delayMinutes: number;
};

/* The five events the dispatcher fires — automations_on_rsvp, automations_on_voyage
   and the dues and roll triggers. run_automations matches trigger_event by
   equality, so a rule saved under any other word is a rule that never fires,
   and a rule saved under a misspelt tier or setting is one that never matches:
   the context is tested by jsonb containment, and a value the context never
   carries is a condition nothing satisfies. Checked here, in the club's voice,
   rather than left to silently do nothing. */
const TRIGGERS: readonly TriggerEvent[] = [
  "pass_confirmed",
  "weather_hold",
  "voyage_completed",
  "member_joined",
  "dues_failed",
];
const TIERS = ["regional", "national", "global"] as const;
const SETTINGS = ["sea", "shore"] as const;

const NAME_MAX = 120;
const DELAY_MAX = 43_200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_MAX = 120;
const BODY_MAX = 600;

function done(): ActionResult {
  revalidatePath("/bridge/automations");
  return {};
}

export async function createAutomation(rule: NewRule): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const name = rule.name.trim();
  if (!name) return { error: "Give the rule a name." };
  if (name.length > NAME_MAX) return { error: `A rule's name runs to ${NAME_MAX} characters.` };
  if (!TRIGGERS.includes(rule.trigger)) return { error: "Pick when the rule fires." };

  /* Conditions: only the three keys the dispatcher's context carries, and only
     values it can carry. A city is checked against the chart. */
  const conditions: RuleConditions = {};
  if (rule.conditions.tier) {
    if (!(TIERS as readonly string[]).includes(rule.conditions.tier)) return { error: "That is not a tier." };
    conditions.tier = rule.conditions.tier;
  }
  if (rule.conditions.setting) {
    if (!(SETTINGS as readonly string[]).includes(rule.conditions.setting))
      return { error: "That is not a setting." };
    conditions.setting = rule.conditions.setting;
  }
  if (rule.conditions.city) {
    const { data: city } = await supabase
      .from("cities")
      .select("slug")
      .eq("slug", rule.conditions.city)
      .maybeSingle();
    if (!city) return { error: "That city is not on the chart." };
    conditions.city = city.slug;
  }

  /* Not `|| 0`: a delay that does not read as a number is refused, not quietly
     made immediate. */
  const rawDelay = Number(rule.delayMinutes);
  const delay = Math.round(rawDelay);
  if (!Number.isFinite(rawDelay) || delay < 0 || delay > DELAY_MAX)
    return { error: "A delay is whole minutes, 0 to 43,200 — thirty days." };

  /* The stored shape is the dispatcher's: {kind:'webhook', webhook_id}. */
  let action: RuleAction | { kind: "webhook"; webhook_id: string };
  if (rule.action.kind === "webhook") {
    const id = (rule.action.webhookId ?? "").trim();
    if (!UUID.test(id)) return { error: "Pick the webhook the rule calls." };
    const { data: hook } = await supabase.from("webhooks").select("id").eq("id", id).eq("active", true).maybeSingle();
    if (!hook) return { error: "That webhook is not registered, or is switched off." };
    action = { kind: "webhook", webhook_id: id };
  } else if (rule.action.kind === "notify") {
    const title = rule.action.title.trim();
    const body = rule.action.body.trim();
    if (!title) return { error: "A word needs a title." };
    if (title.length > TITLE_MAX) return { error: `A word's title runs to ${TITLE_MAX} characters.` };
    if (body.length > BODY_MAX) return { error: `A word's body runs to ${BODY_MAX} characters.` };
    action = { kind: "notify", title, body };
  } else if (rule.action.kind === "email") {
    /* The dispatcher refuses a letter the sender cannot render — with a
       warning in the database log and nothing to the operator. The registry
       is the club's statement of which letters exist; a rule names one of
       those or it is not saved. email_templates is not in the shared type
       file, so it is read through the module seam. */
    const code = rule.action.template.trim();
    if (!code) return { error: "Pick the letter the rule sends." };
    const { data: known } = await moduleTables(supabase)
      .from("email_templates")
      .select("code, rule_can_send")
      .eq("code", code)
      .eq("active", true)
      .maybeSingle();
    if (!known) return { error: "That letter is not in the registry." };
    /* The registry's own flag, which the dispatcher reads at fire time; the
       list below is the same judgement held in code, with the reason. */
    if (!(known as { rule_can_send?: boolean }).rule_can_send)
      return { error: `A rule cannot send ${code} — the registry marks it as needing more than a rule carries.` };
    /* Registered is not enough: the sender refuses a letter whose required
       keys the payload lacks, and a rule's payload is only the member and the
       episode. Refused here, by name, rather than queued to fail. */
    const cannot = LETTERS_A_RULE_CANNOT_FILL[code];
    if (cannot) return { error: `A rule cannot send ${code} — that letter needs ${cannot}, which no rule carries.` };
    action = { kind: "email", template: code };
  } else if (rule.action.kind === "sms") {
    /* A text is template-only at the provider, so a rule may only name one we
       have actually registered — otherwise it queues a message that bounces. */
    const code = rule.action.template.trim();
    if (!code) return { error: "Pick a text template." };
    const { data: known } = await supabase
      .from("sms_templates")
      .select("code, parameter_map")
      .eq("code", code)
      .eq("active", true)
      .maybeSingle();
    if (!known) return { error: "That text template is not registered." };
    const title = (rule.action.title ?? "").trim();
    const body = (rule.action.body ?? "").trim();
    if (title.length > TITLE_MAX) return { error: `A text's title runs to ${TITLE_MAX} characters.` };
    if (body.length > BODY_MAX) return { error: `A text's body runs to ${BODY_MAX} characters.` };
    /* Every variable the carrier's template reads must have a payload key the
       dispatcher will write — otherwise the member reads the placeholder
       unfilled, which is what happened before the dispatcher carried
       title/body at all. */
    const supplied = new Set<string>([...AUTOMATION_TEXT_KEYS, ...(title ? ["title"] : []), ...(body ? ["body"] : [])]);
    const unfilled = textTemplateNeeds(known.parameter_map).filter((k) => !supplied.has(k));
    if (unfilled.length) {
      const wantsWords = unfilled.every((k) => k === "title" || k === "body");
      return {
        error: wantsWords
          ? `That text reads ${unfilled.join(" and ")} from the rule — write ${unfilled.length > 1 ? "them" : "it"} below.`
          : `That text reads ${unfilled.join(", ")}, which no rule carries. Pick a text the rule can fill.`,
      };
    }
    action = { kind: "sms", template: code, ...(title ? { title } : {}), ...(body ? { body } : {}) };
  } else {
    return { error: "Pick what the rule does." };
  }

  const { error } = await supabase.from("automations").insert({
    name,
    trigger_event: rule.trigger,
    conditions,
    action,
    active: true,
    delay_minutes: delay,
  });
  if (error) return { error: ERR_LAND };
  return done();
}

export async function setAutomationActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: "No such rule." };
  const { error } = await supabase.from("automations").update({ active }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}
