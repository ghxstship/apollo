"use client";

import React from "react";
import { Badge, Button, Input, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { setCityTax } from "./actions";

export type CityTaxCard = {
  cityId: string;
  name: string;
  status: string;
  admissionsBp: number | null;
  goodsBp: number | null;
  registered: boolean;
  determinedBy: string;
  determinedOn: string;
  note: string;
};

type Draft = { adm: string; goods: string; registered: boolean; by: string; on: string; note: string };

const pct = (bp: number | null) => (bp === null ? "—" : `${(bp / 100).toFixed(2).replace(/\.?0+$/, "")}%`);

export function TaxClient({ cards }: { cards: CityTaxCard[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [draft, setDraft] = React.useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      cards.map((c) => [
        c.cityId,
        {
          adm: c.admissionsBp === null ? "" : String(c.admissionsBp),
          goods: c.goodsBp === null ? "" : String(c.goodsBp),
          registered: c.registered,
          by: c.determinedBy,
          on: c.determinedOn,
          note: c.note,
        },
      ])
    )
  );

  const save = (c: CityTaxCard) => {
    const d = draft[c.cityId];
    startTransition(async () => {
      const res = await setCityTax(c.cityId, {
        admissions_rate_bp: d.adm.trim() === "" ? null : Number(d.adm),
        goods_rate_bp: d.goods.trim() === "" ? null : Number(d.goods),
        registered: d.registered,
        determined_by: d.by,
        determined_on: d.on,
        note: d.note,
      });
      if (res.error) show({ msg: res.error, tone: "danger" });
      else show({ msg: `${c.name} recorded.`, meta: "TAX" });
    });
  };

  return (
    <>
      <div className="hm-plans">
        {cards.map((c) => {
          const d = draft[c.cityId];
          const undetermined = c.admissionsBp === null && c.goodsBp === null;
          const unregistered = !c.registered && (c.admissionsBp ?? 0) + (c.goodsBp ?? 0) > 0;
          const dirty =
            d.adm !== (c.admissionsBp === null ? "" : String(c.admissionsBp)) ||
            d.goods !== (c.goodsBp === null ? "" : String(c.goodsBp)) ||
            d.registered !== c.registered ||
            d.by !== c.determinedBy ||
            d.on !== c.determinedOn ||
            d.note !== c.note;
          const setD = (patch: Partial<Draft>) =>
            setDraft((s) => ({ ...s, [c.cityId]: { ...s[c.cityId], ...patch } }));
          return (
            <div key={c.cityId} className={"hm-plan" + (unregistered ? " hm-plan--blocked" : "")}>
              <div className="hm-plan__head">
                <b>{c.name}</b>
                <span className="hm-mono">
                  ADMISSIONS {pct(c.admissionsBp)} · GOODS {pct(c.goodsBp)}
                </span>
                {c.status !== "open" ? <Badge tone="outline">{c.status}</Badge> : null}
                {undetermined ? <Badge tone="caution">Awaiting a determination</Badge> : null}
                {unregistered ? <Badge tone="danger">Rate set, not registered — nothing charged</Badge> : null}
                {!undetermined && c.registered ? <Badge tone="positive">Collecting</Badge> : null}
              </div>
              <div className="hm-plan__ids">
                <Input
                  label="Admissions (bp)"
                  type="number"
                  min={0}
                  max={3000}
                  step={1}
                  placeholder="undetermined"
                  value={d.adm}
                  onChange={(e) => setD({ adm: e.target.value })}
                />
                <Input
                  label="Goods (bp)"
                  type="number"
                  min={0}
                  max={3000}
                  step={1}
                  placeholder="undetermined"
                  value={d.goods}
                  onChange={(e) => setD({ goods: e.target.value })}
                />
                <Input
                  label="Determined by"
                  placeholder="Name, firm"
                  value={d.by}
                  onChange={(e) => setD({ by: e.target.value })}
                />
                <Input
                  label="On"
                  type="date"
                  value={d.on}
                  onChange={(e) => setD({ on: e.target.value })}
                />
                <Button
                  variant={dirty ? "gold" : "outline"}
                  size="sm"
                  disabled={pending || !dirty}
                  onClick={() => save(c)}
                >
                  {dirty ? "Record" : "Recorded"}
                </Button>
              </div>
              <div className="hm-plan__ids">
                <label className="hm-check">
                  <input
                    type="checkbox"
                    checked={d.registered}
                    onChange={(e) => setD({ registered: e.target.checked })}
                  />
                  <span>Registered to collect in this state</span>
                </label>
                <Input
                  label="Note"
                  placeholder="Which statute, which filing, what is exempt"
                  value={d.note}
                  onChange={(e) => setD({ note: e.target.value })}
                />
              </div>
            </div>
          );
        })}
      </div>
      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
