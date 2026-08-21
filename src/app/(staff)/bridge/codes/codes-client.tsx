"use client";

import React from "react";
import { Badge, Button, Dialog, Input, Select, StateBlock, Table, Toast } from "@/components/ds";
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

function valueLine(kind: CodeKind, value: number): string {
  if (kind === "comp") return "COMPLIMENTARY";
  if (kind === "percent") return `${value}% OFF`;
  return `$${value} OFF`;
}

export function CodesClient({
  rows,
  voyages,
}: {
  rows: CodeRow[];
  voyages: Array<{ id: string; title: string }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [cutting, setCutting] = React.useState(false);
  const [confirmOff, setConfirmOff] = React.useState<CodeRow | null>(null);
  const [reconciling, setReconciling] = React.useState(false);

  const [code, setCode] = React.useState("");
  const [kind, setKind] = React.useState<CodeKind>("percent");
  const [value, setValue] = React.useState("10");
  const [voyageId, setVoyageId] = React.useState("");
  const [maxUses, setMaxUses] = React.useState("1");
  const [expires, setExpires] = React.useState("");
  const [note, setNote] = React.useState("");

  const columns = [
    {
      key: "code",
      label: "Code",
      mono: true,
      render: (r: CodeRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{r.code}</b>
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
      render: (r: CodeRow) => (r.expiresAt ? logDate(r.expiresAt) : "—"),
    },
    {
      key: "active",
      label: "State",
      width: 110,
      render: (r: CodeRow) =>
        r.active ? <Badge tone="positive">Live</Badge> : <Badge tone="outline">Retired</Badge>,
    },
    {
      key: "acts",
      label: "",
      width: 110,
      render: (r: CodeRow) =>
        r.active ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmOff(r)}>
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
      <span className="hm-count">
        REDEMPTION CHECKS THE CODE BUT NEVER MARKS IT — RECONCILE RECOUNTS PASSES AND SETS THE TALLY
      </span>

      {rows.length ? (
        <div className="hm-panel">
          <Table rowKey={(r: CodeRow) => r.code} columns={columns} rows={rows} />
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
                  value: Number(value) || 0,
                  voyageId,
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
            value={voyageId}
            onChange={(e) => setVoyageId(e.target.value)}
            options={[
              { value: "", label: "Any sailing" },
              ...voyages.map((v) => ({ value: v.id, label: v.title })),
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
                variant="gold"
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
        <p style={{ fontSize: 13 }}>
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
                      msg: "Tallies set straight.",
                      meta: `${res.adjusted ?? 0} CORRECTED OF ${res.scanned ?? 0} SCANNED`,
                    });
                });
              }}
            >
              Reconcile
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13 }}>
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
