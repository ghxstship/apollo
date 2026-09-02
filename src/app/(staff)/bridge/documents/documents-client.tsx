"use client";

import React from "react";
import { CLUB_ZONE, SETTING_LABEL } from "@/lib/brand";
import { Badge, Button, Dialog, Input, Select, Stat, StateBlock, Table, Tabs, Textarea, Toast } from "@/components/ds";
import type { ClauseCategory } from "@/lib/supabase/types";
import { logDate } from "@/lib/format";
import { useToast } from "../../ui";
import {
  counterSign,
  createClause,
  draftNextVersion,
  sendSeasonCards,
  publishVersion,
  redactSignature,
  reviseClause,
  setDraftClause,
} from "./actions";

export type ClauseRow = {
  code: string;
  title: string;
  category: string;
  active: boolean;
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
  active: boolean;
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
    clauseCode: string;
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
  isContract: boolean;
  counterSignedBy: string | null;
  [key: string]: unknown;
};

const CATEGORIES: ClauseCategory[] = ["liability", "conduct", "media", "privacy", "payment", "crew", "general"];
/* A clause can be held back to one setting — the clauses that only make sense
   with the boat under you, and the ones that only make sense ashore. */
const CONDITIONS: Array<[string, string]> = [
  ["", "Always"],
  ["sea", `${SETTING_LABEL.sea} only`],
  ["shore", `${SETTING_LABEL.shore} only`],
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
  const [countering, setCountering] = React.useState<SignatureRow | null>(null);
  const [cardsOpen, setCardsOpen] = React.useState(false);
  const [signerTitle, setSignerTitle] = React.useState("For the club");
  const [seasonFrom, setSeasonFrom] = React.useState("");
  const [seasonTo, setSeasonTo] = React.useState("");
  const [seasonLabel, setSeasonLabel] = React.useState("");

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
        <span style={{ opacity: c.active ? 1 : 0.55 }}>
          <b style={{ fontWeight: 700 }}>{c.title}</b>
          {c.active ? null : (
            <>
              {" "}
              <Badge tone="outline">Out of use</Badge>
            </>
          )}
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
      render: (c: ClauseRow) => (c.publishedAt ? logDate(c.publishedAt, CLUB_ZONE) : "—"),
    },
    {
      key: "act",
      label: "",
      width: 110,
      /* Rewording a withdrawn clause publishes a version nothing can carry —
         publish_document_version() refuses a document that holds one. */
      render: (c: ClauseRow) =>
        c.active ? (
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
        ) : null,
    },
  ];

  const docColumns = [
    {
      key: "title",
      label: "Document",
      render: (d: DocRow) => (
        <span style={{ opacity: d.active ? 1 : 0.55 }}>
          <b style={{ fontWeight: 700 }}>{d.title}</b>
          {d.active ? null : (
            <>
              {" "}
              <Badge tone="outline">Not in use</Badge>
            </>
          )}
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
          <Badge tone="caution">v{d.draftVersion} · {d.draftClauses}</Badge>
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
                  if (res.error) show({ msg: res.error, tone: "danger" });
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
                if (res.error) show({ msg: res.error, tone: "danger" });
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
          {s.redacted ? <Badge tone="caution">Redacted</Badge> : null}
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
      render: (s: SignatureRow) => logDate(s.signedAt, CLUB_ZONE),
    },
    {
      key: "force",
      label: "In force",
      width: 150,
      /* Three states in one column, and one of them was grey body text between
         two badges — a waiver read as an absence rather than as a kind. */
      render: (s: SignatureRow) =>
        !s.isContract ? (
          <Badge tone="outline">Waiver</Badge>
        ) : s.counterSignedBy ? (
          <Badge tone="positive">Counter-signed</Badge>
        ) : (
          <Badge tone="caution">Awaiting the club</Badge>
        ),
    },
    {
      key: "act",
      label: "",
      width: 160,
      render: (s: SignatureRow) =>
        s.redacted ? null : (
          <span style={{ display: "flex", gap: 8 }}>
            {s.isContract && !s.counterSignedBy ? (
              <Button size="sm" variant="ghost" onClick={() => setCountering(s)}>
                Counter-sign
              </Button>
            ) : null}
            {/* Redact strips the person out of a signed record for good;
                Counter-sign beside it puts an agreement in force. They were the
                same ghost button. */}
            <Button size="sm" variant="danger" onClick={() => setConfirmRedact(s)}>
              Redact
            </Button>
          </span>
        ),
    },
  ];

  /* Keyed on the CLAUSE, not on the version the catalogue happens to consider
     latest. Keying on latestVersionId meant a draft holding v1 of a clause that
     had since been revised to v2 showed that clause unticked — tick it and v2
     joined the orphaned v1, two versions of one clause in one document. The
     database refuses to publish that now; this stops the dialog offering it. */
  const composition = new Map(
    (composing?.draftComposition ?? []).map((c) => [c.clauseCode, c] as const)
  );

  /* A withdrawn clause is not on the menu. The library kept probe clauses from
     old hardening rounds active, and they sat in this dialog looking exactly
     like the ones that bind people. One already in the draft still shows, or
     there would be no way to untick it. */
  const offerable = clauses.filter((c) => c.active || composition.has(c.code));

  /* A draft version is the state this screen exists to move, and it was
     readable only by scanning the Draft column of the documents tab. */
  const drafts = docs.filter((d) => d.draftVersionId).length;
  const awaiting = register.filter((s) => s.isContract && !s.counterSignedBy && !s.redacted).length;

  return (
    <>
      <div className="hm-row">
        <Stat size="sm" label="Clauses" value={clauses.length} />
        <Stat size="sm" label="Documents" value={docs.length} sub={`${drafts} IN DRAFT`} />
        <Stat
          size="sm"
          label="Signatures"
          value={register.length}
          sub={`${awaiting} AWAITING THE CLUB`}
        />
      </div>

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
            <Button variant="gold" onClick={() => setWriting(true)}>
              Write a clause
            </Button>
          </div>
          {clauses.length === 0 ? (
            <StateBlock title="No clauses yet." detail="A document is a composition of clauses; start with one." />
          ) : (
            <Table tall columns={clauseColumns} rows={clauses} rowKey={(c) => c.code} />
          )}
        </>
      ) : null}

      {tab === "documents" ? (
        <div style={{ marginTop: 18 }}>
          <Table tall columns={docColumns} rows={docs} rowKey={(d) => d.code} />
        </div>
      ) : null}

      {tab === "register" ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ marginBottom: 14 }}>
            <Button variant="ghost" onClick={() => setCardsOpen(true)}>
              Send the season&rsquo;s cards
            </Button>
          </div>
          {register.length === 0 ? (
            <StateBlock title="Nothing signed yet." detail="Signatures land here with their hash and the exact wording agreed." />
          ) : (
            <Table tall columns={registerColumns} rows={register} rowKey={(s) => s.id} />
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
              variant="gold"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createClause({ code, title, category, body });
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
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
              variant="gold"
              disabled={pending}
              onClick={() => {
                const target = revising;
                if (!target) return;
                startTransition(async () => {
                  const res = await reviseClause(target.code, body, note);
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
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
        <p className="hm-body" style={{ marginBottom: 14 }}>
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
        <p className="hm-body" style={{ marginBottom: 14 }}>
          Tick the clauses this document carries and say when each one applies. A
          clause held to afloat is left out when the document renders for a night
          ashore — one document, assembled per occasion.
        </p>
        <div style={{ display: "grid", gap: 10, maxHeight: "48vh", overflowY: "auto" }}>
          {offerable.map((c, i) => {
            const chosen = composition.get(c.code);
            /* Ticked at a version that is no longer the newest wording. Say so,
               rather than letting it read as though the draft is up to date. */
            const stale = !!chosen && chosen.clauseVersionId !== c.latestVersionId;
            const cond = chosen?.condition?.setting ?? "";
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
                      /* Remove the version the draft actually holds; add the
                         newest wording. Passing latestVersionId both ways meant
                         unticking a clause composed at an older version tried to
                         remove a row that was not there and left the old one
                         orphaned in the document. */
                      const res = await setDraftClause(
                        target.draftVersionId!,
                        e.target.checked ? c.latestVersionId : chosen?.clauseVersionId ?? c.latestVersionId,
                        chosen?.position ?? i + 1,
                        cond ? { class: cond } : {},
                        e.target.checked
                      );
                      if (res.error) show({ msg: res.error, tone: "danger" });
                    });
                  }}
                />
                <span className="hm-body">
                  {c.title}
                  {stale ? (
                    <>
                      {" "}
                      <Badge tone="caution">Older wording in this draft</Badge>
                    </>
                  ) : null}
                  <span className="hm-mono" style={{ display: "block" }}>
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
                      /* The row the draft actually holds, not the newest one.
                         document_clauses' PK is (version, clause_version), so
                         upserting the latest id against a draft composed at an
                         older one INSERTS a second row rather than updating —
                         which is the duplicate the publish guard now refuses,
                         reached through the dropdown instead of the checkbox.
                         Saying when a clause applies must not change what it
                         says; re-wording is an untick and a retick. */
                      const res = await setDraftClause(
                        target.draftVersionId!,
                        chosen?.clauseVersionId ?? c.latestVersionId,
                        chosen?.position ?? i + 1,
                        value ? { class: value } : {},
                        true
                      );
                      if (res.error) show({ msg: res.error, tone: "danger" });
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
              variant="danger"
              disabled={pending}
              onClick={() => {
                const target = confirmRedact;
                if (!target) return;
                startTransition(async () => {
                  const res = await redactSignature(target.id);
                  setConfirmRedact(null);
                  if (res.error) show({ msg: res.error, tone: "danger" });
                  else show({ msg: "Redacted.", meta: "PERSON REMOVED · PROOF KEPT" });
                });
              }}
            >
              Redact
            </Button>
          </>
        }
      >
        <p className="hm-body">
          This answers an erasure request without destroying the record. The name,
          address, IP and the signature itself are removed. What was agreed, when,
          and the hash that proves it are kept — erasure does not reach a record
          needed to answer a legal claim, and this is that record.
        </p>
      </Dialog>

      <Dialog
        open={Boolean(countering)}
        onClose={() => setCountering(null)}
        title="Sign the club's side?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCountering(null)}>Not yet</Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const target = countering;
                if (!target) return;
                startTransition(async () => {
                  const res = await counterSign(target.id, signerTitle);
                  setCountering(null);
                  if (res.error) show({ msg: res.error, tone: "danger" });
                  else show({ msg: "Counter-signed.", meta: "IN FORCE · BOTH SIDES" });
                });
              }}
            >
              Counter-sign
            </Button>
          </>
        }
      >
        <p className="hm-body" style={{ marginBottom: 14 }}>
          Until the club signs, this is an offer rather than an agreement. Signing
          puts it in force and tells the other party. Like every signature here it
          is a record — it cannot be edited or withdrawn afterwards.
        </p>
        <Input
          label="Signing as"
          hint="Shown on the agreement beside your name."
          value={signerTitle}
          onChange={(e) => setSignerTitle(e.target.value)}
        />
      </Dialog>

      <Dialog
        open={cardsOpen}
        onClose={() => setCardsOpen(false)}
        title="Send the season's cards"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCardsOpen(false)}>Cancel</Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await sendSeasonCards(seasonFrom, seasonTo, seasonLabel);
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  setCardsOpen(false);
                  show({
                    msg: `${res.queued ?? 0} card${res.queued === 1 ? "" : "s"} queued.`,
                    meta: "MEMBERS WHO SAILED",
                  });
                })
              }
            >
              Queue them
            </Button>
          </>
        }
      >
        <p className="hm-body" style={{ marginBottom: 14 }}>
          One card per member who actually sailed inside the window — miles,
          episodes, cities, crew met, and any Marks rounded. Members who did not
          sail get nothing; a card reading nought miles is a reproach, not a
          keepsake.
        </p>
        <div style={{ display: "grid", gap: 14 }}>
          <Input label="Season opens" type="date" value={seasonFrom} onChange={(e) => setSeasonFrom(e.target.value)} />
          <Input label="Season closes" type="date" value={seasonTo} onChange={(e) => setSeasonTo(e.target.value)} />
          <Input label="What to call it" hint="Reads in the subject line." value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} />
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
