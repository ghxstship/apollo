"use client";

import React from "react";
import { Avatar, Badge, Button, Dialog, Stat, Switch, Table, Tabs, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { setCandidateStage, setRoleOpen, type CrewStage } from "./actions";

export type RoleRow = {
  id: string;
  title: string;
  port: string;
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
  [key: string]: unknown;
};

const STAGES: Array<{ id: CrewStage; label: string }> = [
  { id: "applied", label: "Applied" },
  { id: "interview", label: "Interview" },
  { id: "sea_trial", label: "Sea trial" },
  { id: "offer", label: "Offer" },
  { id: "passed", label: "Passed" },
];

const STAGE_TONE: Record<CrewStage, "brass" | "ink" | "laurel" | "clay" | "outline"> = {
  applied: "outline",
  interview: "ink",
  sea_trial: "brass",
  offer: "laurel",
  passed: "clay",
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
}: {
  roles: RoleRow[];
  candidates: CandidateRow[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [roleId, setRoleId] = React.useState(roles[0]?.id ?? "");
  const [stage, setStage] = React.useState<"all" | CrewStage>("all");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const role = roles.find((r) => r.id === roleId) ?? null;
  const pool = candidates.filter((c) => c.roleId === roleId);
  const pipeline = pool.filter((c) => c.stage !== "passed");
  const list = pool.filter((c) => stage === "all" || c.stage === stage);
  const current = candidates.find((c) => c.id === openId) ?? null;

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "siren" });
      else ok();
    });
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
    setOpenId(null);
    run(
      () => setCandidateStage(c.id, "passed"),
      () =>
        show({
          msg: `${c.name} passed — kindly, in writing.`,
          meta: role ? role.title.toUpperCase() : undefined,
          tone: "clay",
        })
    );
  };

  if (roles.length === 0) {
    return (
      <p style={{ padding: "24px 4px", color: "var(--text-3)", fontSize: 13 }}>
        No roles posted. The crew page waits on the first one.
      </p>
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
                  {r.port.toUpperCase()} · {inPipe} IN PIPE
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
                  <span className="hm-eyebrow">{role.port}</span>
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
                          <b style={{ fontWeight: 600 }}>{c.name}</b>
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
                {list.length === 0 ? (
                  <p style={{ padding: "24px 4px", color: "var(--text-3)", fontSize: 13 }}>
                    Nobody at this stage. The tide brings more.
                  </p>
                ) : null}
              </div>
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
                <Button variant="ghost" disabled={pending} onClick={() => pass(current)}>
                  Pass
                </Button>
              ) : null}
              {ADVANCE[current.stage] ? (
                <Button variant="brass" disabled={pending} onClick={() => advance(current)}>
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
            <p style={{ fontSize: 14 }}>{current.note || "No note on file."}</p>
            {current.stage === "offer" ? (
              <p className="hm-note" style={{ marginTop: 0 }}>
                Offer&apos;s out — the tide decides from here.
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
