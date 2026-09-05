"use client";

import React from "react";
import { Button, Input, Select } from "@/components/ds";
import {
  FIELDS, MAX_RULES, PRESETS, RULE_FIELDS, optionsFor, ruleReady,
  type Audience, type Lookups, type Rule, type RuleField,
} from "./audience";
import { previewAudience } from "./actions";

type Filter = Extract<Audience, { kind: "filter" }>;

function blankRule(field: RuleField): Rule {
  const f = FIELDS[field];
  if (f.shape === "set") return { field, op: "in", value: [] };
  if (f.shape === "bool") return { field, op: "is", value: true };
  if (f.shape === "date") return { field, op: "after", value: "" };
  return { field, op: "gte", value: 0 };
}

/* Who hears it, built from rules rather than picked off a list. Every rule
   is a fact the club already holds about a member; rules match all or any;
   any rule can be turned around with "is not". The count on the right is the
   database's answer as the rules change, so an audience is never a guess. */
export function AudienceBuilder({
  value,
  onChange,
  lookups,
}: {
  value: Filter;
  onChange: (a: Filter) => void;
  lookups: Lookups;
}) {
  /* The last answer, with the rules it answered; "checking" is the rules
     having moved on since. State is set only from the answer's callback. */
  const [answer, setAnswer] = React.useState<{ key: string; reach: { count: number; sample: string[] } | null } | null>(null);
  const seq = React.useRef(0);
  const ready = value.rules.length > 0 && value.rules.every(ruleReady);
  const key = JSON.stringify(value);
  const reach = answer?.key === key ? answer.reach : null;
  const checking = ready && answer?.key !== key;

  React.useEffect(() => {
    if (!ready) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const res = await previewAudience(JSON.parse(key) as Audience);
      if (mine !== seq.current) return;
      setAnswer({ key, reach: res.error ? null : { count: res.count ?? 0, sample: res.sample ?? [] } });
    }, 300);
    return () => clearTimeout(t);
  }, [key, ready]);

  const setRule = (i: number, r: Rule) => onChange({ ...value, rules: value.rules.map((x, j) => (j === i ? r : x)) });
  const dropRule = (i: number) => onChange({ ...value, rules: value.rules.filter((_, j) => j !== i) });
  const addRule = () => {
    const used = new Set(value.rules.map((r) => r.field));
    const next = RULE_FIELDS.find((f) => !used.has(f)) ?? "standing";
    onChange({ ...value, rules: [...value.rules, blankRule(next)] });
  };

  return (
    <div className="hm-audience">
      <div className="hm-audience__head">
        <span className="hm-eyebrow">Who</span>
        <div className="hm-audience__match" role="radiogroup" aria-label="How the rules combine">
          <span className="hm-mono">MEMBERS WHO MATCH</span>
          <Button size="sm" variant={value.match === "all" ? "gold" : "outline"} aria-pressed={value.match === "all"} onClick={() => onChange({ ...value, match: "all" })}>
            All of these
          </Button>
          <Button size="sm" variant={value.match === "any" ? "gold" : "outline"} aria-pressed={value.match === "any"} onClick={() => onChange({ ...value, match: "any" })}>
            Any of these
          </Button>
        </div>
      </div>

      <div className="hm-rules">
        {value.rules.map((r, i) => (
          <RuleRow key={i} rule={r} lookups={lookups} onChange={(next) => setRule(i, next)} onRemove={value.rules.length > 1 ? () => dropRule(i) : undefined} />
        ))}
      </div>

      <div className="hm-audience__foot">
        <div className="hm-acts">
          <Button size="sm" variant="outline" disabled={value.rules.length >= MAX_RULES} onClick={addRule}>
            Add a rule
          </Button>
          <Select
            aria-label="Start from"
            placeholder="Start from…"
            value=""
            options={PRESETS.map((p, i) => ({ value: String(i), label: p.label }))}
            onChange={(e) => {
              const p = PRESETS[Number(e.target.value)];
              if (p && p.audience.kind === "filter") onChange({ ...p.audience, rules: p.audience.rules.map((r) => ({ ...r })) });
            }}
          />
        </div>
        <div className="hm-reach" aria-live="polite">
          {!ready ? (
            <span className="hm-mono">FINISH THE RULES TO SEE WHO HEARS IT</span>
          ) : checking ? (
            <span className="hm-mono">COUNTING…</span>
          ) : reach ? (
            <>
              <b>{reach.count === 1 ? "Reaches 1 member" : `Reaches ${reach.count} members`}</b>
              {reach.sample.length ? (
                <span className="hm-reach__names">
                  {" — "}
                  {reach.sample.join(", ")}
                  {reach.count > reach.sample.length ? ` and ${reach.count - reach.sample.length} more` : ""}
                </span>
              ) : null}
            </>
          ) : (
            <span className="hm-mono">THE COUNT DID NOT LAND — CHECK THE RULES</span>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleRow({ rule, lookups, onChange, onRemove }: { rule: Rule; lookups: Lookups; onChange: (r: Rule) => void; onRemove?: () => void }) {
  const f = FIELDS[rule.field];
  return (
    <div className="hm-rule">
      <Select
        aria-label="Rule"
        value={rule.field}
        options={RULE_FIELDS.map((k) => ({ value: k, label: FIELDS[k].label }))}
        onChange={(e) => onChange(blankRule(e.target.value as RuleField))}
      />
      <Select
        aria-label="Is or is not"
        value={rule.not ? "not" : "is"}
        options={[{ value: "is", label: f.shape === "bool" ? "is" : f.shape === "set" ? "is one of" : "is" }, { value: "not", label: f.shape === "set" ? "is none of" : "is not" }]}
        onChange={(e) => onChange({ ...rule, not: e.target.value === "not" })}
      />
      <div className="hm-rule__value">
        {f.shape === "set" && f.source ? (
          <SetValue values={Array.isArray(rule.value) ? rule.value : []} options={optionsFor(f.source, lookups)} onChange={(v) => onChange({ ...rule, value: v })} />
        ) : f.shape === "bool" ? (
          <div className="hm-acts">
            <Button size="sm" variant={rule.value === true ? "gold" : "outline"} aria-pressed={rule.value === true} onClick={() => onChange({ ...rule, value: true })}>Yes</Button>
            <Button size="sm" variant={rule.value === false ? "gold" : "outline"} aria-pressed={rule.value === false} onClick={() => onChange({ ...rule, value: false })}>No</Button>
          </div>
        ) : f.shape === "date" ? (
          <div className="hm-rule__pair">
            <Select aria-label="Before or after" value={rule.op} options={[{ value: "after", label: "on or after" }, { value: "before", label: "before" }]} onChange={(e) => onChange({ ...rule, op: e.target.value as Rule["op"] })} />
            <Input aria-label="Date" type="date" value={typeof rule.value === "string" ? rule.value : ""} onChange={(e) => onChange({ ...rule, value: e.target.value })} />
          </div>
        ) : (
          <div className="hm-rule__pair">
            <Select aria-label="At least or at most" value={rule.op} options={[{ value: "gte", label: "at least" }, { value: "lte", label: "at most" }]} onChange={(e) => onChange({ ...rule, op: e.target.value as Rule["op"] })} />
            <Input aria-label={f.unit ?? "Figure"} type="number" min={0} step={1} value={typeof rule.value === "number" ? String(rule.value) : ""} onChange={(e) => onChange({ ...rule, value: e.target.value === "" ? Number.NaN : Number(e.target.value) })} />
            <span className="hm-mono">{(f.unit ?? "").toUpperCase()}</span>
          </div>
        )}
      </div>
      {onRemove ? (
        <Button size="sm" variant="ghost" aria-label="Remove this rule" onClick={onRemove}>
          Remove
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

/* A set: toggle chips when the list is short, a picker that adds chips when
   it is long (sixty episodes are not a row of chips). */
function SetValue({ values, options, onChange }: { values: string[]; options: Array<{ value: string; label: string }>; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  if (options.length <= 6) {
    return (
      <div className="hm-acts" role="group">
        {options.map((o) => (
          <Button key={o.value} size="sm" variant={values.includes(o.value) ? "gold" : "outline"} aria-pressed={values.includes(o.value)} onClick={() => toggle(o.value)}>
            {o.label}
          </Button>
        ))}
      </div>
    );
  }
  const remaining = options.filter((o) => !values.includes(o.value));
  return (
    <div className="hm-rule__set">
      {values.map((v) => (
        <Button key={v} size="sm" variant="gold" aria-label={`Remove ${options.find((o) => o.value === v)?.label ?? v}`} onClick={() => toggle(v)}>
          {options.find((o) => o.value === v)?.label ?? v} ×
        </Button>
      ))}
      {remaining.length ? (
        <Select aria-label="Add one" placeholder={values.length ? "Add another…" : "Pick one…"} value="" options={remaining} onChange={(e) => { if (e.target.value) toggle(e.target.value); }} />
      ) : null}
    </div>
  );
}
