"use client";

import React from "react";
import { Badge, Button, Checkbox, Dialog, Input, Select, StateBlock, Switch, Textarea, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import {
  createQuestion,
  moveQuestion,
  setQuestionActive,
  updateQuestion,
  type QuestionInput,
  type QuestionKind,
} from "./actions";

export type QuestionRow = {
  key: string;
  prompt: string;
  kind: QuestionKind;
  options: string[];
  required: boolean;
  active: boolean;
  position: number;
};

const KIND_LABEL: Record<QuestionKind, string> = {
  text: "A line",
  long: "A paragraph",
  choice: "A choice",
};

type Draft = { key: string; prompt: string; kind: QuestionKind; options: string; required: boolean };
const BLANK: Draft = { key: "", prompt: "", kind: "text", options: "", required: false };

function toInput(d: Draft): QuestionInput {
  return {
    key: d.key,
    prompt: d.prompt,
    kind: d.kind,
    options: d.options.split("\n").map((o) => o.trim()).filter(Boolean),
    required: d.required,
  };
}

/* A key is typed once, on creation, and derived from the prompt when it is
   left blank — the door files answers under it, so it never changes after. */
function keyFrom(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 41);
}

export function QuestionsClient({ rows }: { rows: QuestionRow[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  /* null = closed; "" = a new question; otherwise the key being edited. */
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft>(BLANK);

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  const openNew = () => {
    setDraft(BLANK);
    setEditing("");
  };
  const openEdit = (q: QuestionRow) => {
    setDraft({ key: q.key, prompt: q.prompt, kind: q.kind, options: q.options.join("\n"), required: q.required });
    setEditing(q.key);
  };

  const save = () => {
    const isNew = editing === "";
    const input = toInput(isNew ? { ...draft, key: draft.key.trim() || keyFrom(draft.prompt) } : draft);
    const key = editing ?? "";
    run(
      () => (isNew ? createQuestion(input) : updateQuestion(key, input)),
      () => {
        setEditing(null);
        show({ msg: isNew ? "Asked from now on." : "Question changed.", meta: (input.key || key).toUpperCase() });
      }
    );
  };

  const live = rows.filter((r) => r.active).length;

  return (
    <>
      <div className="hm-head hm-tabbody">
        <span className="hm-mono">
          {rows.length} {rows.length === 1 ? "QUESTION" : "QUESTIONS"} · {live} ASKED AT THE DOOR
        </span>
        <Button variant="gold" size="sm" onClick={openNew}>
          Add a question
        </Button>
      </div>

      {rows.length ? (
        rows.map((q, i) => (
          <div className="hm-item" key={q.key}>
            <div className="hm-item__head">
              <span className="hm-mono hm-q__n">{String(i + 1).padStart(2, "0")}</span>
              <b>{q.prompt}</b>
              <Badge tone="outline">{KIND_LABEL[q.kind]}</Badge>
              {q.required ? <Badge tone="ink">Required</Badge> : null}
              {!q.active ? <Badge tone="caution">Off</Badge> : null}
              <div className="hm-item__acts">
                <Button variant="ghost" size="sm" disabled={pending || i === 0} aria-label={`Move “${q.prompt}” up`} onClick={() => run(() => moveQuestion(q.key, "up"), () => undefined)}>
                  Up
                </Button>
                <Button variant="ghost" size="sm" disabled={pending || i === rows.length - 1} aria-label={`Move “${q.prompt}” down`} onClick={() => run(() => moveQuestion(q.key, "down"), () => undefined)}>
                  Down
                </Button>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => openEdit(q)}>
                  Edit
                </Button>
                <Switch
                  label={q.active ? "Asked" : "Off"}
                  checked={q.active}
                  disabled={pending}
                  onChange={(e) => {
                    const next = e.target.checked;
                    run(
                      () => setQuestionActive(q.key, next),
                      () => show({ msg: next ? "Asked from now on." : "Off the application. Filed answers still read.", meta: q.key.toUpperCase() })
                    );
                  }}
                />
              </div>
            </div>
            <div className="hm-item__meta">
              <span>KEY {q.key.toUpperCase()}</span>
              {q.kind === "choice" ? (
                <>
                  <span>·</span>
                  <span>{q.options.join(" / ").toUpperCase()}</span>
                </>
              ) : null}
            </div>
          </div>
        ))
      ) : (
        <div className="hm-tabbody">
          <StateBlock
            status="empty"
            title="The application asks nothing yet."
            detail="Add the first question and the door asks it of the next applicant."
          />
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        width={520}
        eyebrow={editing ? editing.toUpperCase() : "New question"}
        title={editing ? "Change the question." : "Ask something new."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Not yet
            </Button>
            <Button variant="gold" disabled={pending} onClick={save}>
              {editing ? "Save" : "Ask it"}
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Textarea
            label="Prompt"
            rows={2}
            maxLength={200}
            placeholder="What brings you to the water?"
            value={draft.prompt}
            onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
          />
          {editing === "" ? (
            <Input
              label="Key"
              hint="Answers file under it, so it never changes. Left blank, it comes from the prompt."
              placeholder={keyFrom(draft.prompt) || "what_brings_you"}
              value={draft.key}
              onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
            />
          ) : null}
          <div className="hm-form__row">
            <Select
              label="Kind"
              value={draft.kind}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as QuestionKind }))}
              options={(Object.keys(KIND_LABEL) as QuestionKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            />
            <Checkbox
              label="Required"
              description="The application does not send without it."
              checked={draft.required}
              onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
            />
          </div>
          {draft.kind === "choice" ? (
            <Textarea
              label="Options"
              hint="One per line. Two to twelve."
              rows={4}
              placeholder={"Afloat\nAshore\nEither"}
              value={draft.options}
              onChange={(e) => setDraft((d) => ({ ...d, options: e.target.value }))}
            />
          ) : null}
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
