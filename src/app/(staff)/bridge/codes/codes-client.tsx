"use client";

import React from "react";
import { CLUB_ZONE } from "@/lib/brand";
import { Badge, Button, Dialog, Input, ListToolbar, Select, StateBlock, Table, Toast } from "@/components/ds";
import { logDate } from "@/lib/format";
import { useToast } from "../../ui";
import { createCode, reconcileUses, setCodeActive, type CodeKind } from "./actions";

export type CodeRow = {
  code: string;
  kind: CodeKind;
  value: number;
  scope: string;
  uses: number;
  maxUses: number;
  expiresAt: string | null;
  active: boolean;
  note: string;
  [key: string]: unknown;
};

/* The same three things check_promo refuses on, asked once so the badge and
   the tally above the table can never disagree about what "live" means. */
function isLive(r: CodeRow): boolean {
  if (!r.active) return false;
  if (r.expiresAt && new Date(r.expiresAt) <= new Date()) return false;
  if (r.maxUses != null && r.uses >= r.maxUses) return false;
  return true;
}

function valueLine(kind: CodeKind, value: number): string {
  if (kind === "comp") return "COMPLIMENTARY";
  if (kind === "percent") return `${value}% OFF`;
  /* Stored in cents, like every other money column. */
  return `$${(value / 100).toFixed(value % 100 ? 2 : 0)} OFF`;
}

export function CodesClient({
  rows,
  episodes,
}: {
  rows: CodeRow[];
  episodes: Array<{ id: string; title: string }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [cutting, setCutting] = React.useState(false);
  const [confirmOff, setConfirmOff] = React.useState<CodeRow | null>(null);
  const [reconciling, setReconciling] = React.useState(false);

  const [code, setCode] = React.useState("");
  const [kind, setKind] = React.useState<CodeKind>("percent");
  const [value, setValue] = React.useState("10");
  const [episodeId, setEpisodeId] = React.useState("");
  const [maxUses, setMaxUses] = React.useState("1");
  const [expires, setExpires] = React.useState("");
  const [note, setNote] = React.useState("");
  const [query, setQuery] = React.useState("");

  const q = query.trim().toUpperCase();
  const shown = q ? rows.filter((r) => r.code.includes(q) || r.note.toUpperCase().includes(q)) : rows;

  const columns = [
    {
      key: "code",
      label: "Code",
      mono: true,
      render: (r: CodeRow) => (
        <span>
          <b style={{ fontWeight: 700 }}>{r.code}</b>
          {r.note ? (
            <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>{r.note}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "kind",
      label: "Worth",
      width: 130,
      mono: true,
      render: (r: CodeRow) => valueLine(r.kind, r.value),
    },
    { key: "scope", label: "Scope" },
    {
      key: "uses",
      label: "Used",
      width: 90,
      mono: true,
      render: (r: CodeRow) => `${r.uses}/${r.maxUses}`,
    },
    {
      key: "expiresAt",
      label: "Expires",
      width: 100,
      mono: true,
      render: (r: CodeRow) => (r.expiresAt ? logDate(r.expiresAt, CLUB_ZONE) : "—"),
    },
    {
      key: "active",
      label: "State",
      width: 110,
      /* "Live" used to mean `active` alone, ignoring the two other things
         check_promo refuses on. Seven of twelve real codes were spent or
         expired and every one of them badged Live, with a Deactivate button
         beside it — an operator handing out a code the Bridge had just told
         them was good. Badge from the same predicate the guard uses. */
      render: (r: CodeRow) => {
        if (!r.active) return <Badge tone="outline">Retired</Badge>;
        if (r.expiresAt && new Date(r.expiresAt) <= new Date())
          return <Badge tone="caution">Expired</Badge>;
        if (r.maxUses != null && r.uses >= r.maxUses)
          return <Badge tone="caution">Spent</Badge>;
        return <Badge tone="positive">Live</Badge>;
      },
    },
    {
      key: "acts",
      label: "",
      width: 110,
      render: (r: CodeRow) =>
        r.active ? (
          /* Deactivate takes a code out of circulation for everyone holding
             it; Reinstate, its neighbour in the same cell, puts it back. */
          <Button variant="danger" size="sm" disabled={pending} onClick={() => setConfirmOff(r)}>
            Deactivate
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await setCodeActive(r.code, true);
                if (res.error) show({ msg: res.error, tone: "danger" });
                else show({ msg: "Back in circulation.", meta: `${r.code} · LIVE` });
              })
            }
          >
            Reinstate
          </Button>
        ),
    },
  ];

  return (
    <>
      <div className="hm-acts" style={{ marginTop: 20 }}>
        <Button variant="gold" size="sm" onClick={() => setCutting(true)}>
          New code
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setReconciling(true)}
        >
          Reconcile uses
        </Button>
      </div>
      {/* The count slot was spent on an explanation and the screen carried no
          figure at all — an operator could not tell how many of the codes in
          hands still work without reading every badge. The sentence is a note,
          which is what it always was; the count takes the count's place. */}
      <p className="hm-note">
        Redemption checks the code but never marks it — Reconcile recounts passes and sets the
        tally.
      </p>
      <ListToolbar
        search={
          <Input
            label="Search the codes"
            placeholder="A code, or the note on it"
            aria-label="Search the codes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
        resultCount={shown.length}
        resultNoun="code"
        countSuffix={` · ${rows.filter(isLive).length} of ${rows.length} live`}
      />

      {shown.length ? (
        <div className="hm-panel">
          <Table rowKey={(r: CodeRow) => r.code} columns={columns} rows={shown} />
        </div>
      ) : rows.length ? (
        <div style={{ marginTop: 20 }}>
          <StateBlock status="empty" title="No code by that name." detail="Clear the search to see every code cut." />
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <StateBlock
            status="empty"
            title="No codes cut."
            detail="Cut one for a founding-member drop, a partner comp, or the press list."
          />
        </div>
      )}

      <Dialog
        open={cutting}
        onClose={() => setCutting(false)}
        width={480}
        eyebrow="New code"
        title="Cut a code."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCutting(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const payload = {
                  code,
                  kind,
                  /* The field asks for dollars; the column keeps cents. */
                  value:
                    kind === "amount"
                      ? Math.round((Number(value) || 0) * 100)
                      : Number(value) || 0,
                  episodeId,
                  maxUses: Number(maxUses) || 1,
                  expiresAt: expires,
                  note,
                };
                startTransition(async () => {
                  const res = await createCode(payload);
                  if (res.error) show({ msg: res.error, tone: "danger" });
                  else {
                    setCutting(false);
                    setCode("");
                    setNote("");
                    show({ msg: "Code cut.", meta: `${payload.code.toUpperCase()} · LIVE` });
                  }
                });
              }}
            >
              Cut the code
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Input
            label="Code"
            placeholder="FOUNDING24"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ textTransform: "uppercase" }}
          />
          <div className="hm-form__row">
            <Select
              label="Kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as CodeKind)}
              options={[
                { value: "percent", label: "Share off" },
                { value: "amount", label: "Sum off" },
                { value: "comp", label: "Complimentary" },
              ]}
            />
            <Input
              label={kind === "percent" ? "Percent" : "Dollars"}
              type="number"
              min={0}
              value={kind === "comp" ? "0" : value}
              disabled={kind === "comp"}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Select
            label="Scope"
            value={episodeId}
            onChange={(e) => setEpisodeId(e.target.value)}
            options={[
              { value: "", label: "Any episode" },
              ...episodes.map((v) => ({ value: v.id, label: v.title })),
            ]}
          />
          <div className="hm-form__row">
            <Input
              label="Max uses"
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
            <Input
              label="Expires"
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </div>
          <Input
            label="Note"
            placeholder="Press list — two seasons of coverage."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={!!confirmOff}
        onClose={() => setConfirmOff(null)}
        width={420}
        eyebrow={confirmOff ? confirmOff.code : ""}
        title="Deactivate this code?"
        footer={
          confirmOff ? (
            <>
              <Button variant="ghost" onClick={() => setConfirmOff(null)}>
                Leave it live
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => {
                  const target = confirmOff;
                  setConfirmOff(null);
                  startTransition(async () => {
                    const res = await setCodeActive(target.code, false);
                    if (res.error) show({ msg: res.error, tone: "danger" });
                    else
                      show({
                        msg: "Code retired.",
                        meta: `${target.code} · NO LONGER REDEEMABLE`,
                        tone: "caution",
                      });
                  });
                }}
              >
                Deactivate
              </Button>
            </>
          ) : null
        }
      >
        <p className="hm-body">
          Anyone holding it stops being able to redeem it from this moment. Passes already booked on
          it stand.
        </p>
      </Dialog>

      <Dialog
        open={reconciling}
        onClose={() => setReconciling(false)}
        width={440}
        eyebrow="Reconcile"
        title="Recount every code?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReconciling(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                setReconciling(false);
                startTransition(async () => {
                  const res = await reconcileUses();
                  if (res.error) show({ msg: res.error, tone: "danger" });
                  else
                    show({
                      /* A code whose tally moved mid-reconcile is left alone
                         and said out loud. Reporting only "corrected" would
                         have the operator believe every code was settled. */
                      msg: res.skipped
                        ? "Tallies set straight, bar a few that moved."
                        : "Tallies set straight.",
                      meta:
                        `${res.adjusted ?? 0} CORRECTED OF ${res.scanned ?? 0} SCANNED` +
                        (res.skipped ? ` · ${res.skipped} MOVED WHILE COUNTING — RUN IT AGAIN` : ""),
                      tone: res.skipped ? "caution" : "ink",
                    });
                });
              }}
            >
              Reconcile
            </Button>
          </>
        }
      >
        <p className="hm-body">
          Every pass carrying a code is counted, and each code&apos;s tally is written to match. It
          only ever moves the count to what the passes say.
        </p>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
