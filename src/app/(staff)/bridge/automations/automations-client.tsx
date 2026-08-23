"use client";

import React from "react";
import { Badge, Button, Dialog, Input, Select, StateBlock, Switch, Textarea, Toast } from "@/components/ds";
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
};

const TRIGGER_LABEL: Record<TriggerEvent, string> = {
  pass_confirmed: "A pass is confirmed",
  weather_hold: "A weather hold is called",
  voyage_completed: "A sailing is logged complete",
  member_joined: "A member comes aboard",
  dues_failed: "Dues fail to settle",
};

const TIER_OPTIONS = [
  { value: "", label: "Any tier" },
  { value: "regional", label: "Regional" },
  { value: "national", label: "National" },
  { value: "global", label: "Global" },
];

const CLASS_OPTIONS = [
  { value: "", label: "Either family" },
  { value: "sea", label: "Sea Day" },
  { value: "shore", label: "Port Day" },
];

function conditionLine(c: RuleConditions, harborLabel: (slug: string) => string): string {
  const parts: string[] = [];
  if (c.tier) parts.push(c.tier.toUpperCase());
  if (c.harbor) parts.push(harborLabel(c.harbor).toUpperCase());
  if (c.class) parts.push(c.class === "sea" ? "SEA DAY" : "PORT DAY");
  return parts.length ? parts.join(" · ") : "EVERYONE";
}

function actionLine(a: RuleAction): string {
  if (a.kind === "email") return `Email — ${a.template}`;
  if (a.kind === "sms") return `Text — ${a.template}`;
  return `Send the word — ${a.title}`;
}

export function AutomationsClient({
  rows,
  harbors,
  smsTemplates,
}: {
  rows: RuleRow[];
  harbors: Array<{ slug: string; label: string }>;
  /* Texts are template-only at the provider; the rule picks from what is
     registered rather than typing a code that will bounce on send. */
  smsTemplates: string[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [writing, setWriting] = React.useState(false);

  const [name, setName] = React.useState("");
  const [trigger, setTrigger] = React.useState<TriggerEvent>("pass_confirmed");
  const [tier, setTier] = React.useState("");
  const [harbor, setHarbor] = React.useState("");
  const [klass, setKlass] = React.useState("");
  const [actionKind, setActionKind] = React.useState<"notify" | "email" | "sms">("notify");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [template, setTemplate] = React.useState("");

  const harborLabel = (slug: string) => harbors.find((h) => h.slug === slug)?.label ?? slug;

  return (
    <>
      <div className="hm-acts" style={{ marginTop: 20 }}>
        <Button variant="gold" size="sm" onClick={() => setWriting(true)}>
          New rule
        </Button>
      </div>
      {/* This said "WIRED TO THE TRIGGERS NEXT; RULES SAVE NOW." while four
          triggers were live and the one existing rule had already sent 194
          notifications to members. The dangerous direction: an operator writes
          a rule believing it is a draft, and it messages the club. */}
      <span className="hm-count">LIVE — A SAVED RULE FIRES ON THE NEXT MATCHING EVENT.</span>

      {rows.length ? (
        rows.map((r) => (
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
              <span>IF {conditionLine(r.conditions, harborLabel)}</span>
              <span>·</span>
              <span>LAST RUN {r.lastRunAt ? logDateTime(r.lastRunAt).toUpperCase() : "NEVER"}</span>
            </div>
            <div className="hm-item__body">{actionLine(r.action)}</div>
          </div>
        ))
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
                      ? { kind: "sms", template: template.trim() }
                      : { kind: "notify", title: title.trim(), body: body.trim() };
                const rule = {
                  name,
                  trigger,
                  conditions: {
                    tier: tier || undefined,
                    harbor: harbor || undefined,
                    class: klass || undefined,
                  },
                  action,
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
                    show({ msg: "Rule saved.", meta: "SAVED · NOT YET FIRING" });
                  }
                });
              }}
            >
              Save the rule
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Input
            label="Name"
            placeholder="Word to Global members on every Sea Day"
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
              label="Harbor"
              value={harbor}
              onChange={(e) => setHarbor(e.target.value)}
              options={[
                { value: "", label: "Any harbor" },
                ...harbors.map((h) => ({ value: h.slug, label: h.label })),
              ]}
            />
          </div>
          <Select
            label="Family"
            value={klass}
            onChange={(e) => setKlass(e.target.value)}
            options={CLASS_OPTIONS}
          />
          <Select
            label="Then"
            value={actionKind}
            onChange={(e) => {
              setActionKind(e.target.value as "notify" | "email" | "sms");
              setTemplate("");
            }}
            options={[
              { value: "notify", label: "Send the word" },
              { value: "email", label: "Send an email" },
              { value: "sms", label: "Send a text" },
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
          ) : actionKind === "sms" ? (
            <Select
              label="Text template"
              hint="Only registered templates send; the provider takes no ad-hoc text."
              placeholder="Pick a template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              options={smsTemplates.map((c) => ({ value: c, label: c }))}
            />
          ) : (
            <Input
              label="Template key"
              placeholder="welcome-aboard"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          )}
          <p className="hm-mono">RULES SAVE NOW; THE TRIGGERS ARE WIRED NEXT.</p>
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
