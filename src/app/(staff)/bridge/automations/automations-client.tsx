"use client";

import React from "react";
import { CLUB_ZONE, PLACE, SETTING_LABEL } from "@/lib/brand";
import { Badge, Button, Dialog, Input, ListToolbar, Select, StateBlock, Switch, Textarea, Toast } from "@/components/ds";
import { logDateTime } from "@/lib/format";
import { useToast } from "../../ui";
import {
  createAutomation,
  setAutomationActive,
  type RuleAction,
  type RuleConditions,
  type TriggerEvent,
} from "./actions";

export type RuleRow = {
  id: string;
  name: string;
  trigger: TriggerEvent;
  conditions: RuleConditions;
  action: RuleAction;
  active: boolean;
  lastRunAt: string | null;
  delayMinutes: number;
  /* Rows of this rule waiting in automation_queue. */
  waiting: number;
};

export type HookOption = { id: string; url: string; active: boolean };

/* The hook's host is what an operator recognises; the full URL is the
   tooltip. */
function hookLabel(h: HookOption): string {
  try {
    return new URL(h.url).host + (h.active ? "" : " (off)");
  } catch {
    return h.url;
  }
}

const TRIGGER_LABEL: Record<TriggerEvent, string> = {
  pass_confirmed: "A pass is confirmed",
  weather_hold: "A weather hold is called",
  voyage_completed: "An episode is logged complete",
  member_joined: "A member comes aboard",
  dues_failed: "Dues fail to settle",
};

const TIER_OPTIONS = [
  { value: "", label: "Any tier" },
  { value: "regional", label: "Regional" },
  { value: "national", label: "National" },
  { value: "global", label: "Global" },
];

/* Where the episode happens — the setting axis, not the old family codes. */
const SETTING_OPTIONS = [
  { value: "", label: "Either setting" },
  { value: "sea", label: SETTING_LABEL.sea },
  { value: "shore", label: SETTING_LABEL.shore },
];

function conditionLine(c: RuleConditions, cityLabel: (slug: string) => string): string {
  const parts: string[] = [];
  if (c.tier) parts.push(c.tier.toUpperCase());
  if (c.city) parts.push(cityLabel(c.city).toUpperCase());
  if (c.setting) parts.push((SETTING_LABEL[c.setting] ?? SETTING_LABEL.shore).toUpperCase());
  return parts.length ? parts.join(" · ") : "EVERYONE";
}

function actionLine(a: RuleAction, hooks: HookOption[] = []): string {
  if (a.kind === "email") return `Email — ${a.template}`;
  if (a.kind === "sms") return `Text — ${a.template}${a.title ? ` — ${a.title}` : ""}`;
  if (a.kind === "webhook") {
    const h = hooks.find((x) => x.id === a.webhookId);
    return `Call a webhook — ${h ? hookLabel(h) : "a hook no longer registered"}`;
  }
  return `Send the word — ${a.title}`;
}

function delayLine(minutes: number): string {
  if (minutes <= 0) return "AT ONCE";
  if (minutes % 1440 === 0) return `${minutes / 1440}D AFTER`;
  if (minutes % 60 === 0) return `${minutes / 60}H AFTER`;
  return `${minutes} MIN AFTER`;
}

export function AutomationsClient({
  rows,
  cities,
  webhooks,
  waiting,
  nextRunAt,
  smsTemplates,
  letters,
}: {
  rows: RuleRow[];
  cities: Array<{ slug: string; label: string }>;
  webhooks: HookOption[];
  /* Rows waiting in automation_queue across every rule, and the soonest. */
  waiting: number;
  nextRunAt: string | null;
  /* Texts are template-only at the provider; the rule picks from what is
     registered rather than typing a code that will bounce on send. `needs` is
     the payload keys the template's parameter_map reads — a text that reads
     title or body takes them from the rule. */
  smsTemplates: Array<{ code: string; needs: string[] }>;
  /* The letter registry (email_templates). The dispatcher refuses a letter
     the sender cannot render, so the rule picks one off the registry rather
     than typing a key that would be refused at fire time with nothing said
     to the operator. */
  letters: Array<{ code: string; description: string }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [writing, setWriting] = React.useState(false);

  const [name, setName] = React.useState("");
  const [trigger, setTrigger] = React.useState<TriggerEvent>("pass_confirmed");
  const [tier, setTier] = React.useState("");
  const [city, setCity] = React.useState("");
  const [klass, setKlass] = React.useState("");
  const [actionKind, setActionKind] = React.useState<"notify" | "email" | "sms" | "webhook">("notify");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [template, setTemplate] = React.useState("");
  const [hookId, setHookId] = React.useState("");
  const [delay, setDelay] = React.useState("0");
  const [query, setQuery] = React.useState("");

  const cityLabel = (slug: string) => cities.find((h) => h.slug === slug)?.label ?? slug;
  const textNeeds = smsTemplates.find((t) => t.code === template)?.needs ?? [];

  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || actionLine(r.action, webhooks).toLowerCase().includes(q))
    : rows;
  const live = rows.filter((r) => r.active).length;

  return (
    <>
      <div className="hm-head hm-tabbody">
        <span className="hm-mono">
          {waiting} WAITING
          {waiting > 0 && nextRunAt ? ` · NEXT ${logDateTime(nextRunAt, CLUB_ZONE).toUpperCase()}` : ""}
          {" · THE CLOCK DRAINS THE QUEUE EVERY FIVE MINUTES"}
        </span>
        <Button variant="gold" size="sm" onClick={() => setWriting(true)}>
          New rule
        </Button>
      </div>
      {/* This said "WIRED TO THE TRIGGERS NEXT; RULES SAVE NOW." while four
          triggers were live and the one existing rule had already sent 194
          notifications to members. The dangerous direction: an operator writes
          a rule believing it is a draft, and it messages the club. */}
      <ListToolbar
        search={
          <Input
            label="Search the rules"
            placeholder="A rule's name, or what it sends"
            aria-label="Search the rules"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
        resultCount={shown.length}
        resultNoun="rule"
        countSuffix={` · ${live} LIVE — A SAVED RULE FIRES ON THE NEXT MATCHING EVENT`}
      />

      {shown.length ? (
        shown.map((r) => (
          <div className="hm-item" key={r.id}>
            <div className="hm-item__head">
              <b>{r.name}</b>
              {r.active ? <Badge tone="positive">Live</Badge> : <Badge tone="outline">Held</Badge>}
              <div className="hm-item__acts">
                <Switch
                  label={r.active ? "Live" : "Held"}
                  checked={r.active}
                  disabled={pending}
                  onChange={(e) => {
                    const next = e.target.checked;
                    startTransition(async () => {
                      const res = await setAutomationActive(r.id, next);
                      if (res.error) show({ msg: res.error, tone: "danger" });
                      else
                        show({
                          msg: next ? "Rule is live." : "Rule held.",
                          meta: r.name.toUpperCase(),
                        });
                    });
                  }}
                />
              </div>
            </div>
            <div className="hm-item__meta">
              <span>WHEN {TRIGGER_LABEL[r.trigger].toUpperCase()}</span>
              <span>·</span>
              <span>IF {conditionLine(r.conditions, cityLabel)}</span>
              <span>·</span>
              <span>LAST RUN {r.lastRunAt ? logDateTime(r.lastRunAt, CLUB_ZONE).toUpperCase() : "NEVER"}</span>
              <span>·</span>
              <span>{delayLine(r.delayMinutes)}</span>
              {r.waiting > 0 ? (
                <>
                  <span>·</span>
                  <span>{r.waiting} WAITING</span>
                </>
              ) : null}
            </div>
            <div className="hm-item__body">{actionLine(r.action, webhooks)}</div>
          </div>
        ))
      ) : rows.length ? (
        <div style={{ marginTop: 20 }}>
          <StateBlock status="empty" title="No rule by that name." detail="Clear the search to see every rule." />
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <StateBlock
            status="empty"
            title="No rules written."
            detail="Write one and it holds for the season — a word on every confirmed pass, say."
          />
        </div>
      )}

      <Dialog
        open={writing}
        onClose={() => setWriting(false)}
        width={520}
        eyebrow="New rule"
        title="Write a rule."
        footer={
          <>
            <Button variant="ghost" onClick={() => setWriting(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const action: RuleAction =
                  actionKind === "email"
                    ? { kind: "email", template: template.trim() }
                    : actionKind === "sms"
                      ? { kind: "sms", template: template.trim(), title: title.trim(), body: body.trim() }
                      : actionKind === "webhook"
                        ? { kind: "webhook", webhookId: hookId }
                        : { kind: "notify", title: title.trim(), body: body.trim() };
                const rule = {
                  name,
                  trigger,
                  conditions: {
                    tier: tier || undefined,
                    city: city || undefined,
                    setting: klass || undefined,
                  },
                  action,
                  delayMinutes: Number(delay) || 0,
                };
                startTransition(async () => {
                  const res = await createAutomation(rule);
                  if (res.error) show({ msg: res.error, tone: "danger" });
                  else {
                    setWriting(false);
                    setName("");
                    setTitle("");
                    setBody("");
                    setTemplate("");
                    setHookId("");
                    setDelay("0");
                    show({ msg: "Rule saved and live.", meta: "FIRES ON THE NEXT MATCHING EVENT" });
                  }
                });
              }}
            >
              Save and go live
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Input
            label="Name"
            placeholder="Word to Global members on every episode afloat"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label="When"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as TriggerEvent)}
            options={(Object.keys(TRIGGER_LABEL) as TriggerEvent[]).map((t) => ({
              value: t,
              label: TRIGGER_LABEL[t],
            }))}
          />
          <div className="hm-form__row">
            <Select
              label="Tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              options={TIER_OPTIONS}
            />
            <Select
              label={PLACE.market}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              options={[
                { value: "", label: "Any city" },
                ...cities.map((h) => ({ value: h.slug, label: h.label })),
              ]}
            />
          </div>
          <Select
            label="Setting"
            value={klass}
            onChange={(e) => setKlass(e.target.value)}
            options={SETTING_OPTIONS}
          />
          <Input
            label="Delay"
            type="number"
            inputMode="numeric"
            min={0}
            max={43200}
            hint="Fires N minutes after the event; 0 = at once. Up to 43,200, thirty days."
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
          />
          <Select
            label="Then"
            value={actionKind}
            onChange={(e) => {
              setActionKind(e.target.value as "notify" | "email" | "sms" | "webhook");
              setTemplate("");
              setHookId("");
            }}
            options={[
              { value: "notify", label: "Send the word" },
              { value: "email", label: "Send an email" },
              { value: "sms", label: "Send a text" },
              { value: "webhook", label: "Call a webhook" },
            ]}
          />
          {actionKind === "notify" ? (
            <>
              <Input
                label="Title"
                placeholder="Your pass is confirmed."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                label="Body"
                rows={3}
                placeholder="Muster is on the manifest. Bring soft shoes."
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </>
          ) : actionKind === "webhook" ? (
            <Select
              label="Webhook"
              hint="One of the hooks on Keys. The event, the member and the episode go in the body, signed with the hook's secret."
              placeholder={webhooks.some((h) => h.active) ? "Pick a hook" : "No live webhook registered — add one on Keys"}
              value={hookId}
              onChange={(e) => setHookId(e.target.value)}
              options={webhooks.filter((h) => h.active).map((h) => ({ value: h.id, label: hookLabel(h) }))}
            />
          ) : actionKind === "sms" ? (
            <>
              <Select
                label="Text template"
                hint="Only registered templates send; the provider takes no ad-hoc text. The member, the episode and a link are filled in by the rule."
                placeholder="Pick a template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                options={smsTemplates.map((t) => ({
                  value: t.code,
                  label: t.needs.length ? `${t.code} — reads ${t.needs.join(", ")}` : t.code,
                }))}
              />
              {textNeeds.includes("title") ? (
                <Input
                  label="Title"
                  hint="Fills the text's title. {member} and {episode} are written in."
                  placeholder="{episode}"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              ) : null}
              {textNeeds.includes("body") ? (
                <Textarea
                  label="Body"
                  hint="Fills the text's body. {member} and {episode} are written in."
                  rows={3}
                  placeholder="Muster is on the manifest. Bring soft shoes."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              ) : null}
            </>
          ) : (
            <Select
              label="Letter"
              hint="Only a letter in the registry sends; any other is refused when the rule fires."
              placeholder="Pick a letter"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              options={letters.map((l) => ({ value: l.code, label: `${l.code} — ${l.description}` }))}
            />
          )}
          <p className="hm-mono">SAVED IS LIVE — THE RULE FIRES ON THE NEXT MATCHING EVENT.</p>
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
