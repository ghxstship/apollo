"use client";

import React from "react";
import { Badge, Button, Dialog, Input, Select, StateBlock, Table, Tabs, Textarea, Toast } from "@/components/ds";
import type { ClauseCategory } from "@/lib/supabase/types";
import { logDate } from "@/lib/format";
import { useToast } from "../../ui";
import {
  createClause,
  draftNextVersion,
  publishVersion,
  redactSignature,
  reviseClause,
  setDraftClause,
} from "./actions";

export type ClauseRow = {
  code: string;
  title: string;
  category: string;
  versions: number;
  latestVersion: number;
  latestVersionId: string;
  body: string;
  publishedAt: string | null;
  [key: string]: unknown;
};

export type DocRow = {
  code: string;
  title: string;
  kind: string;
  audience: string;
  validityMonths: number | null;
  gates: string[];
  publishedVersion: number | null;
  publishedVersionId: string | null;
  publishedClauses: number;
  draftVersion: number | null;
  draftVersionId: string | null;
  draftClauses: number;
  signedCount: number;
  draftComposition: Array<{
    clauseVersionId: string;
    position: number;
    condition: Record<string, string>;
  }>;
  [key: string]: unknown;
};

export type SignatureRow = {
  id: string;
  document: string;
  signer: string;
  kind: string;
  hash: string;
  signedAt: string;
  isGuest: boolean;
  redacted: boolean;
  [key: string]: unknown;
};

const CATEGORIES: ClauseCategory[] = ["liability", "conduct", "media", "privacy", "payment", "crew", "general"];
const CONDITIONS: Array<[string, string]> = [
  ["", "Always"],
  ["sea", "Sea Days only"],
  ["shore", "Port Days only"],
];

export function DocumentsClient({
  clauses,
  docs,
  register,
}: {
  clauses: ClauseRow[];
  docs: DocRow[];
  register: SignatureRow[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [tab, setTab] = React.useState("library");

  const [writing, setWriting] = React.useState(false);
  const [revising, setRevising] = React.useState<ClauseRow | null>(null);
  const [composing, setComposing] = React.useState<DocRow | null>(null);
  const [confirmRedact, setConfirmRedact] = React.useState<SignatureRow | null>(null);

  const [code, setCode] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<ClauseCategory>("liability");
  const [body, setBody] = React.useState("");
  const [note, setNote] = React.useState("");

  const clauseColumns = [
    {
      key: "title",
      label: "Clause",
      render: (c: ClauseRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{c.title}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>{c.code}</span>
        </span>
      ),
    },
    { key: "category", label: "Category", width: 110 },
    {
      key: "latestVersion",
      label: "Version",
      width: 110,
      mono: true,
      render: (c: ClauseRow) => `v${c.latestVersion} of ${c.versions}`,
    },
    {
      key: "publishedAt",
      label: "Published",
      width: 120,
      mono: true,
      render: (c: ClauseRow) => (c.publishedAt ? logDate(c.publishedAt) : "—"),
    },
    {
      key: "act",
      label: "",
      width: 110,
      render: (c: ClauseRow) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setRevising(c);
            setBody(c.body);
            setNote("");
          }}
        >
          Reword
        </Button>
      ),
    },
  ];

  const docColumns = [
    {
      key: "title",
      label: "Document",
      render: (d: DocRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{d.title}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>
            {d.audience} · {d.kind}
            {d.validityMonths ? ` · renews every ${d.validityMonths}m` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "gates",
      label: "Required for",
      width: 170,
      render: (d: DocRow) =>
        d.gates.length ? d.gates.join(", ").replace(/_/g, " ") : "—",
    },
    {
      key: "publishedVersion",
      label: "Published",
      width: 130,
      mono: true,
      render: (d: DocRow) =>
        d.publishedVersion ? `v${d.publishedVersion} · ${d.publishedClauses} clauses` : "—",
    },
    { key: "signedCount", label: "Signed", width: 90, mono: true },
    {
      key: "draftVersion",
      label: "Draft",
      width: 110,
      render: (d: DocRow) =>
        d.draftVersion ? (
          <Badge tone="clay">v{d.draftVersion} · {d.draftClauses}</Badge>
        ) : (
          "—"
        ),
    },
    {
      key: "act",
      label: "",
      width: 210,
      render: (d: DocRow) =>
        d.draftVersionId ? (
          <span style={{ display: "flex", gap: 8 }}>
            <Button size="sm" variant="ghost" onClick={() => setComposing(d)}>
              Compose
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await publishVersion(d.draftVersionId!);
                  if (res.error) show({ msg: res.error, tone: "siren" });
                  else show({ msg: "Published.", meta: `${d.code.toUpperCase()} · V${d.draftVersion}` });
                })
              }
            >
              Publish
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await draftNextVersion(d.code);
                if (res.error) show({ msg: res.error, tone: "siren" });
                else show({ msg: "Draft opened from the standing version." });
              })
            }
          >
            Draft next
          </Button>
        ),
    },
  ];

  const registerColumns = [
    { key: "document", label: "Document", width: 210, mono: true },
    {
      key: "signer",
      label: "Signer",
      render: (s: SignatureRow) => (
        <span>
          {s.signer}
          {s.isGuest ? <Badge tone="outline">Guest</Badge> : null}
          {s.redacted ? <Badge tone="clay">Redacted</Badge> : null}
        </span>
      ),
    },
    { key: "kind", label: "Signature", width: 100 },
    {
      key: "hash",
      label: "Hash",
      width: 150,
      mono: true,
      render: (s: SignatureRow) => s.hash.slice(0, 16),
    },
    {
      key: "signedAt",
      label: "Signed",
      width: 120,
      mono: true,
      render: (s: SignatureRow) => logDate(s.signedAt),
    },
    {
      key: "act",
      label: "",
      width: 100,
      render: (s: SignatureRow) =>
        s.redacted ? null : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmRedact(s)}>
            Redact
          </Button>
        ),
    },
  ];

  const composition = new Map(
    (composing?.draftComposition ?? []).map((c) => [c.clauseVersionId, c] as const)
  );

  return (
    <>
      <div style={{ marginTop: 22 }}>
        <Tabs
          items={[
            { id: "library", label: `Clause library (${clauses.length})` },
            { id: "documents", label: `Documents (${docs.length})` },
            { id: "register", label: `Register (${register.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "library" ? (
        <>
          <div style={{ margin: "18px 0 14px" }}>
            <Button variant="brass" onClick={() => setWriting(true)}>
              Write a clause
            </Button>
          </div>
          {clauses.length === 0 ? (
            <StateBlock title="No clauses yet." detail="A document is a composition of clauses; start with one." />
          ) : (
            <Table columns={clauseColumns} rows={clauses} rowKey={(c) => c.code} />
          )}
        </>
      ) : null}

      {tab === "documents" ? (
        <div style={{ marginTop: 18 }}>
          <Table columns={docColumns} rows={docs} rowKey={(d) => d.code} />
        </div>
      ) : null}

      {tab === "register" ? (
        <div style={{ marginTop: 18 }}>
          {register.length === 0 ? (
            <StateBlock title="Nothing signed yet." detail="Signatures land here with their hash and the exact wording agreed." />
          ) : (
            <Table columns={registerColumns} rows={register} rowKey={(s) => s.id} />
          )}
        </div>
      ) : null}

      <Dialog
        open={writing}
        onClose={() => setWriting(false)}
        title="Write a clause"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWriting(false)}>Cancel</Button>
            <Button
              variant="brass"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createClause({ code, title, category, body });
                  if (res.error) {
                    show({ msg: res.error, tone: "siren" });
                    return;
                  }
                  setWriting(false);
                  setCode(""); setTitle(""); setBody("");
                  show({ msg: "Clause written.", meta: "VERSION 1" });
                })
              }
            >
              Write it
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="Code" hint="Short, lowercase, hyphenated." value={code} onChange={(e) => setCode(e.target.value)} />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as ClauseCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Textarea label="Wording" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(revising)}
        onClose={() => setRevising(null)}
        title={revising ? `Reword — ${revising.title}` : "Reword"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevising(null)}>Cancel</Button>
            <Button
              variant="brass"
              disabled={pending}
              onClick={() => {
                const target = revising;
                if (!target) return;
                startTransition(async () => {
                  const res = await reviseClause(target.code, body, note);
                  if (res.error) {
                    show({ msg: res.error, tone: "siren" });
                    return;
                  }
                  setRevising(null);
                  show({ msg: "Reworded.", meta: `V${target.latestVersion + 1} PUBLISHED` });
                });
              }}
            >
              Publish v{(revising?.latestVersion ?? 0) + 1}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 14 }}>
          This publishes the next version alongside the last. Signatures already
          taken keep pointing at the wording they were given — nothing already
          agreed to changes. Documents pick up the new wording when you draft
          their next version.
        </p>
        <div style={{ display: "grid", gap: 14 }}>
          <Textarea label="Wording" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          <Input label="What changed" hint="Kept with the version." value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(composing)}
        onClose={() => setComposing(null)}
        title={composing ? `Compose — ${composing.title} v${composing.draftVersion}` : "Compose"}
        footer={<Button variant="ghost" onClick={() => setComposing(null)}>Done</Button>}
      >
        <p style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 14 }}>
          Tick the clauses this document carries and say when each one applies. A
          clause set to Sea Days is left out when the document renders for the
          shore — one document, assembled per occasion.
        </p>
        <div style={{ display: "grid", gap: 10, maxHeight: "48vh", overflowY: "auto" }}>
          {clauses.map((c, i) => {
            const chosen = composition.get(c.latestVersionId);
            const cond = chosen?.condition?.class ?? "";
            return (
              <div
                key={c.code}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr 150px",
                  gap: 12,
                  alignItems: "center",
                  borderTop: "1px solid var(--line-faint)",
                  paddingTop: 10,
                }}
              >
                <input
                  type="checkbox"
                  aria-label={`Include ${c.title}`}
                  checked={Boolean(chosen)}
                  disabled={pending}
                  onChange={(e) => {
                    const target = composing;
                    if (!target?.draftVersionId) return;
                    startTransition(async () => {
                      const res = await setDraftClause(
                        target.draftVersionId!,
                        c.latestVersionId,
                        chosen?.position ?? i + 1,
                        cond ? { class: cond } : {},
                        e.target.checked
                      );
                      if (res.error) show({ msg: res.error, tone: "siren" });
                    });
                  }}
                />
                <span style={{ fontSize: 13.5 }}>
                  {c.title}
                  <span style={{ display: "block", color: "var(--text-3)", fontSize: 11 }}>
                    v{c.latestVersion}
                  </span>
                </span>
                <Select
                  label=""
                  aria-label={`When ${c.title} applies`}
                  value={cond}
                  disabled={!chosen || pending}
                  onChange={(e) => {
                    const target = composing;
                    if (!target?.draftVersionId) return;
                    const value = e.target.value;
                    startTransition(async () => {
                      const res = await setDraftClause(
                        target.draftVersionId!,
                        c.latestVersionId,
                        chosen?.position ?? i + 1,
                        value ? { class: value } : {},
                        true
                      );
                      if (res.error) show({ msg: res.error, tone: "siren" });
                    });
                  }}
                >
                  {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
            );
          })}
        </div>
      </Dialog>

      <Dialog
        open={Boolean(confirmRedact)}
        onClose={() => setConfirmRedact(null)}
        title="Redact this signature?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRedact(null)}>Keep it</Button>
            <Button
              variant="brass"
              disabled={pending}
              onClick={() => {
                const target = confirmRedact;
                if (!target) return;
                startTransition(async () => {
                  const res = await redactSignature(target.id);
                  setConfirmRedact(null);
                  if (res.error) show({ msg: res.error, tone: "siren" });
                  else show({ msg: "Redacted.", meta: "PERSON REMOVED · PROOF KEPT" });
                });
              }}
            >
              Redact
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
          This answers an erasure request without destroying the record. The name,
          address, IP and the signature itself are removed. What was agreed, when,
          and the hash that proves it are kept — erasure does not reach a record
          needed to answer a legal claim, and this is that record.
        </p>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
