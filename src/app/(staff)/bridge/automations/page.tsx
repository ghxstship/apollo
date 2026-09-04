import type { Metadata } from "next";
import { CITY_CODES } from "@/lib/brand";
import { moduleTables } from "@/lib/module-tables";
import { getOperator } from "../../data";
import { AutomationsClient, type RuleRow } from "./automations-client";
import type { RuleAction, RuleConditions, TriggerEvent } from "./actions";
import { must } from "../../staff";

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
  return { tier: pick("tier"), city: pick("city"), setting: pick("setting") };
}

/* The letter registry — email_templates — is not in the shared type file, so
   it is read through the module seam and typed at the boundary. */
interface LetterRecord {
  code: string;
  description: string;
}

function readAction(raw: unknown): RuleAction {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.kind === "email")
      return { kind: "email", template: typeof o.template === "string" ? o.template : "" };
    if (o.kind === "sms")
      return { kind: "sms", template: typeof o.template === "string" ? o.template : "" };
    if (o.kind === "webhook")
      return { kind: "webhook", webhookId: typeof o.webhook_id === "string" ? o.webhook_id : "" };
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

  const [rulesRes, citiesRes, smsRes, lettersRes, hooksRes, waitingRes] = await Promise.all([
    supabase.from("automations").select("*").order("created_at", { ascending: false }),
    supabase.from("cities").select("slug, name").order("position", { ascending: true }),
    supabase.from("sms_templates").select("code").eq("active", true).order("code"),
    /* Only a letter the sender can render — the same test run_automations
       applies when the rule fires, asked here so the picker cannot offer a
       letter that would be refused. */
    moduleTables(supabase).from("email_templates").select("code, description").eq("active", true).order("code"),
    /* Every hook, live or not: a rule pointing at a hook since switched off
       should still name it rather than read as a blank. */
    supabase.from("webhooks").select("id, url, active").order("created_at", { ascending: true }),
    /* What is waiting its turn — delayed rules the five-minute clock has not
       yet brought back through the dispatcher. */
    supabase.from("automation_queue").select("automation_id, run_at").is("done_at", null).order("run_at", { ascending: true }),
  ]);

  const hooks = must(hooksRes);
  const waiting = must(waitingRes);
  const waitingByRule = new Map<string, number>();
  for (const w of waiting) waitingByRule.set(w.automation_id, (waitingByRule.get(w.automation_id) ?? 0) + 1);

  const rows: RuleRow[] = (must(rulesRes)).map((a) => ({
    id: a.id,
    name: a.name,
    trigger: (TRIGGERS as string[]).includes(a.trigger_event)
      ? (a.trigger_event as TriggerEvent)
      : "pass_confirmed",
    conditions: readConditions(a.conditions),
    action: readAction(a.action),
    active: a.active,
    lastRunAt: a.last_run_at,
    delayMinutes: a.delay_minutes,
    waiting: waitingByRule.get(a.id) ?? 0,
  }));

  const cities = (must(citiesRes)).map((h) => ({
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
      <AutomationsClient
        rows={rows}
        cities={cities}
        webhooks={hooks.map((h) => ({ id: h.id, url: h.url, active: h.active }))}
        waiting={waiting.length}
        nextRunAt={waiting[0]?.run_at ?? null}
        smsTemplates={(must(smsRes)).map((t) => t.code)}
        letters={must(lettersRes as { data: LetterRecord[] | null; error: null }).map((l) => ({
          code: l.code,
          description: l.description,
        }))}
      />
    </div>
  );
}
