"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog, Input, Select, StateBlock, Table, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { createTable, deleteTable } from "./actions";

export type TableRow = {
  id: string;
  number: number;
  seats: number;
  /* Live seats: confirmed, plus holds that have not lapsed. */
  taken: number;
  confirmed: number;
  held: number;
  [key: string]: unknown;
};

export function TablesClient({
  voyageId,
  options,
  rows,
}: {
  voyageId: string;
  options: Array<{ value: string; label: string }>;
  rows: TableRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [laying, setLaying] = React.useState(false);
  const [striking, setStriking] = React.useState<TableRow | null>(null);

  /* The next free number is the obvious default; the operator can change it. */
  const nextNumber = rows.reduce((n, r) => Math.max(n, r.number), 0) + 1;
  const [number, setNumber] = React.useState(String(nextNumber));
  const [seats, setSeats] = React.useState("6");

  const columns = [
    {
      key: "number",
      label: "Table",
      width: 100,
      mono: true,
      render: (r: TableRow) => `NO. ${r.number}`,
    },
    {
      key: "seats",
      label: "Chairs",
      width: 90,
      mono: true,
      render: (r: TableRow) => String(r.seats),
    },
    {
      key: "taken",
      label: "Taken",
      width: 120,
      mono: true,
      render: (r: TableRow) => `${r.taken} / ${r.seats}`,
    },
    {
      key: "state",
      label: "State",
      render: (r: TableRow) =>
        r.confirmed > 0 ? (
          <Badge tone="positive">
            {r.confirmed} confirmed{r.held ? ` · ${r.held} held` : ""}
          </Badge>
        ) : r.held > 0 ? (
          <Badge tone="caution">{r.held} held</Badge>
        ) : r.taken >= r.seats ? (
          <Badge tone="gold">Full</Badge>
        ) : (
          <Badge tone="outline">Open</Badge>
        ),
    },
    {
      key: "act",
      label: "",
      width: 120,
      render: (r: TableRow) => (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || r.confirmed > 0}
          title={r.confirmed > 0 ? "Seats are confirmed — the table stays." : undefined}
          onClick={() => setStriking(r)}
        >
          Strike it
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="hm-sec" style={{ marginTop: 20 }}>
        <Select
          label="Night"
          options={options}
          value={voyageId}
          onChange={(e) => router.replace(`/bridge/tables?voyage=${e.target.value}`)}
          style={{ maxWidth: 420 }}
        />
      </div>

      <div style={{ margin: "22px 0 14px", display: "flex", gap: 10 }}>
        <Button
          variant="gold"
          onClick={() => {
            setNumber(String(nextNumber));
            setSeats("6");
            setLaying(true);
          }}
        >
          Lay a table
        </Button>
      </div>

      {rows.length === 0 ? (
        <StateBlock
          title="No tables laid."
          detail="The member page reads this room. Lay the first table and it appears on Tonight."
        />
      ) : (
        <Table columns={columns} rows={rows} rowKey={(r) => r.id} />
      )}

      <p style={{ marginTop: 14, color: "var(--text-3)", fontSize: 12.5 }}>
        A held seat lapses on its own in fifteen minutes. A confirmed seat is
        somebody&rsquo;s evening — the table stays until it is released from the
        member side, or the pass is struck and the seat follows it.
      </p>

      <Dialog
        open={laying}
        onClose={() => setLaying(false)}
        width={420}
        eyebrow="THE BRIDGE · LAY A TABLE"
        title="Lay a table"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLaying(false)}>
              Not now
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createTable(voyageId, Number(number), Number(seats));
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  setLaying(false);
                  show({ msg: "Laid. It is on Tonight now.", meta: `TABLE NO. ${number} · ${seats} CHAIRS` });
                })
              }
            >
              Lay it
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Input
            label="Number"
            hint="Printed on the card at the door."
            type="number"
            min={1}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <Input
            label="Chairs"
            hint="Two to twelve. Six is the house shape."
            type="number"
            min={2}
            max={12}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={!!striking}
        onClose={() => setStriking(null)}
        width={420}
        eyebrow={striking ? `TABLE NO. ${striking.number}` : ""}
        title="Strike this table?"
        footer={
          striking ? (
            <>
              <Button variant="ghost" onClick={() => setStriking(null)}>
                Not yet
              </Button>
              <Button
                variant="gold"
                disabled={pending}
                onClick={() => {
                  const t = striking;
                  setStriking(null);
                  startTransition(async () => {
                    const res = await deleteTable(t.id);
                    if (res.error) show({ msg: res.error, tone: "danger" });
                    else show({ msg: "Struck. It is off Tonight.", meta: `TABLE NO. ${t.number}` });
                  });
                }}
              >
                Strike it
              </Button>
            </>
          ) : null
        }
      >
        <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
          {striking && striking.held > 0
            ? `${striking.held} ${striking.held === 1 ? "seat is" : "seats are"} held here and will go with it. Nobody has confirmed.`
            : "Nobody is seated here. It comes off the member page at once."}
        </p>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
