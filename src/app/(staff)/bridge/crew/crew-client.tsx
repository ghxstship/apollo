"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { Avatar, Badge, Button, Dialog, Input, ListToolbar, Stat, StateBlock, Switch, Table, Tabs, Textarea, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { addCandidateNote, setCandidateStage, setRoleOpen, type CrewStage } from "./actions";

export type RoleRow = {
  id: string;
  title: string;
  city: string;
  meta: string;
  open: boolean;
};

export type CandidateRow = {
  id: string;
  roleId: string;
  name: string;
  email: string;
  note: string;
  stage: CrewStage;
  applied: string;
  phone: string;
  links: string;
  source: string;
  rejectedReason: string;
  [key: string]: unknown;
};

/* Append-only, newest first. The table it comes from has no UPDATE grant and no
   update policy, so a rejection reason cannot be quietly rewritten after the
   fact — which is exactly the thing that gets quietly rewritten. */
export type EventRow = {
  id: string;
  candidateId: string;
  at: string;
  kind: "applied" | "stage" | "note" | "email" | "decision";
  fromStage: string | null;
  toStage: string | null;
  body: string;
};

const STAGES: Array<{ id: CrewStage; label: string }> = [
  { id: "applied", label: "Applied" },
  { id: "interview", label: "Interview" },
  { id: "sea_trial", label: "Sea trial" },
  { id: "offer", label: "Offer" },
  { id: "passed", label: "Passed" },
];

const STAGE_TONE: Record<CrewStage, "gold" | "ink" | "positive" | "caution" | "outline"> = {
  applied: "outline",
  interview: "ink",
  sea_trial: "gold",
  offer: "positive",
  passed: "caution",
};

const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<
  CrewStage,
  string
>;

const ADVANCE: Partial<Record<CrewStage, CrewStage>> = {
  applied: "interview",
  interview: "sea_trial",
  sea_trial: "offer",
};

export function CrewClient({
  roles,
  candidates,
  events,
}: {
  roles: RoleRow[];
  candidates: CandidateRow[];
  events: EventRow[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [roleId, setRoleId] = React.useState(roles[0]?.id ?? "");
  const [stage, setStage] = React.useState<"all" | CrewStage>("all");
  const [openId, setOpenId] = React.useState<string | null>(null);
  /* Passing asks for a reason before it takes one. A pipeline that records the
     decision and not the why leaves the next person reading this row with no
     idea whether to approach them again. */
  const [passing, setPassing] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const fromUrl = useSearchParams().get("q") ?? "";
  const [query, setQuery] = React.useState(fromUrl);

  const role = roles.find((r) => r.id === roleId) ?? null;
  const pool = candidates.filter((c) => c.roleId === roleId);
  const pipeline = pool.filter((c) => c.stage !== "passed");
  const q = query.trim().toLowerCase();
  const list = pool.filter(
    (c) =>
      (stage === "all" || c.stage === stage) &&
      (!q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
  );
  const current = candidates.find((c) => c.id === openId) ?? null;

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  const fileNote = (c: CandidateRow) => {
    const body = note;
    setNote("");
    run(() => addCandidateNote(c.id, body), () => show({ msg: "Filed.", meta: "CREW HISTORY" }));
  };

  const advance = (c: CandidateRow) => {
    const next = ADVANCE[c.stage];
    if (!next) return;
    setOpenId(null);
    run(
      () => setCandidateStage(c.id, next),
      () =>
        show({
          msg: `${c.name} → ${STAGE_LABEL[next]}.`,
          meta: role ? role.title.toUpperCase() : undefined,
        })
    );
  };

  const pass = (c: CandidateRow) => {
    const why = reason;
    setOpenId(null);
    setPassing(false);
    setReason("");
    run(
      () => setCandidateStage(c.id, "passed", why),
      () =>
        show({
          msg: `${c.name} passed — kindly, in writing.`,
          meta: role ? role.title.toUpperCase() : undefined,
          tone: "caution",
        })
    );
  };

  if (roles.length === 0) {
    return (
      <div style={{ marginTop: 20 }}>
        <StateBlock
          status="empty"
          icon="Users"
          title="No roles posted."
          detail="The crew page waits on the first one. Candidates apply against a posted role from the crew page."
        />
      </div>
    );
  }

  return (
    <>
      <div className="hm-crew">
        <aside className="hm-roles">
          {roles.map((r) => {
            const inPipe = candidates.filter(
              (c) => c.roleId === r.id && c.stage !== "passed"
            ).length;
            return (
              <button
                type="button"
                key={r.id}
                className={"hm-role" + (roleId === r.id ? " on" : "")}
                onClick={() => {
                  setRoleId(r.id);
                  setStage("all");
                }}
              >
                <b>{r.title}</b>
                <span>
                  {r.meta ? `${r.meta.toUpperCase()} · ` : ""}
                  {r.city.toUpperCase()} · {inPipe} IN PIPE
                </span>
              </button>
            );
          })}
        </aside>

        <div>
          {role ? (
            <>
              <div className="hm-head">
                <div>
                  <span className="hm-eyebrow">{role.city}</span>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-display-xs)", marginTop: 4 }}>
                    {role.title}
                  </h2>
                </div>
                <Switch
                  label="Open on the crew page"
                  checked={role.open}
                  disabled={pending}
                  onChange={(e) => {
                    const open = e.target.checked;
                    run(
                      () => setRoleOpen(role.id, open),
                      () =>
                        show({
                          msg: open ? "Role opened." : "Role closed.",
                          meta: role.title.toUpperCase(),
                        })
                    );
                  }}
                />
              </div>

              <div className="hm-row">
                <Stat
                  size="sm"
                  label="In pipeline"
                  value={pipeline.length}
                  sub={`${pool.filter((c) => c.stage === "offer").length} AT OFFER`}
                />
                <Stat
                  size="sm"
                  label="Sea trials"
                  value={pool.filter((c) => c.stage === "sea_trial").length}
                  sub="GUEST-DIRECTS ONE SAIL"
                />
              </div>

              <Tabs
                items={[{ id: "all", label: "All" }, ...STAGES]}
                value={stage}
                onChange={(id) => setStage(id as "all" | CrewStage)}
              />

              <ListToolbar
                search={
                  <Input
                    label="Search the candidates"
                    placeholder="A name or an email"
                    aria-label="Search the candidates"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                }
                resultCount={list.length}
                resultNoun="candidate"
                countSuffix={` of ${pool.length} for this role`}
              />

              {/* A stage with nobody at it rendered four column headings over
                  an empty body, with the explanation stranded below them. */}
              {list.length === 0 ? (
                <div style={{ marginTop: 20 }}>
                  <StateBlock
                    status="empty"
                    title={q ? "Nobody by that name." : "Nobody at this stage."}
                    detail={q ? "Clear the search to see everyone at this stage." : "The tide brings more. Candidates move up the stages from here."}
                  />
                </div>
              ) : (
              <div className="hm-panel">
                <Table
                  rowKey={(c: CandidateRow) => c.id}
                  onRowClick={(c: CandidateRow) => setOpenId(c.id)}
                  columns={[
                    {
                      key: "name",
                      label: "Candidate",
                      render: (c: CandidateRow) => (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={c.name} size="sm" tone="sand" />
                          <b style={{ fontWeight: 700 }}>{c.name}</b>
                        </span>
                      ),
                    },
                    {
                      key: "stage",
                      label: "Stage",
                      render: (c: CandidateRow) => (
                        <Badge tone={STAGE_TONE[c.stage]}>{STAGE_LABEL[c.stage]}</Badge>
                      ),
                    },
                    {
                      key: "email",
                      label: "Email",
                      mono: true,
                      render: (c: CandidateRow) => c.email.toUpperCase(),
                    },
                    { key: "applied", label: "Applied", mono: true, width: 110 },
                  ]}
                  rows={list}
                />
              </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      <Dialog
        open={!!current}
        onClose={() => setOpenId(null)}
        width={520}
        eyebrow={current && role ? `${role.title} · ${STAGE_LABEL[current.stage]}` : ""}
        title={current ? current.name : ""}
        footer={
          current ? (
            <>
              {current.stage !== "passed" ? (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => (passing ? pass(current) : setPassing(true))}
                >
                  {passing ? "Pass, with that reason" : "Pass"}
                </Button>
              ) : null}
              {ADVANCE[current.stage] ? (
                <Button variant="gold" disabled={pending} onClick={() => advance(current)}>
                  Advance → {STAGE_LABEL[ADVANCE[current.stage]!]}
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {current ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="hm-mod__meta">
              <span>APPLIED {current.applied}</span>
              <span>·</span>
              <span>{current.email.toUpperCase()}</span>
            </div>
            {current.phone || current.links || current.source ? (
              <div className="hm-mod__meta">
                {[current.phone, current.links, current.source ? `VIA ${current.source}` : ""]
                  .filter(Boolean)
                  .map((bit, i) => (
                    <span key={`${i}-${bit}`}>
                      {i > 0 ? "· " : ""}
                      {bit.toUpperCase()}
                    </span>
                  ))}
              </div>
            ) : null}
            <p style={{ fontSize: 14 }}>{current.note || "No note on file."}</p>
            {current.stage === "offer" ? (
              <p className="hm-note" style={{ marginTop: 0 }}>
                Offer&apos;s out — the tide decides from here.
              </p>
            ) : null}
            {passing ? (
              <Textarea
                label="Why — this goes in the history and does not come back out"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Strong, wrong season. Keep warm for the LA opening."
              />
            ) : null}

            <div className="hm-hist">
              <span className="hm-mono">HISTORY</span>
              {events
                .filter((e) => e.candidateId === current.id)
                .map((e) => (
                  <div key={e.id} className="hm-hist__row">
                    <span className="hm-hist__at">{e.at}</span>
                    <span className="hm-hist__what">
                      {e.kind === "applied"
                        ? "Applied"
                        : e.kind === "note"
                          ? "Note"
                          : e.fromStage
                            ? `${STAGE_LABEL[e.fromStage as CrewStage] ?? e.fromStage} → ${STAGE_LABEL[e.toStage as CrewStage] ?? e.toStage}`
                            : (e.toStage ?? "")}
                      {e.body ? <em>{e.body}</em> : null}
                    </span>
                  </div>
                ))}
            </div>

            <Textarea
              label="File a note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What you would want the next reader to know."
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pending || note.trim().length === 0}
              onClick={() => fileNote(current)}
            >
              File it
            </Button>
          </div>
        ) : null}
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
