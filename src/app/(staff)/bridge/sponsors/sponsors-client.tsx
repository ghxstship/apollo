"use client";

import React from "react";
import { Badge, Button, Dialog, Input, Select, StateBlock, Switch, Table, Toast } from "@/components/ds";
import { logDate, price } from "@/lib/format";
import { useToast } from "../../ui";
import {
  attachSponsor,
  createSponsor,
  detachSponsor,
  setSponsorActive,
  type SponsorTier,
} from "./actions";

export type SponsorItem = {
  id: string;
  name: string;
  tier: SponsorTier;
  monthlyCents: number;
  contactEmail: string | null;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
  active: boolean;
  activations: Array<{ voyageId: string; label: string; placement: string | null }>;
  [key: string]: unknown;
};

export const TIER_LABEL: Record<SponsorTier, string> = {
  presenting_partner: "Presenting Partner",
  sandbar_hub: "Sandbar Hub",
  confessional_pod: "Confessional Pod",
  shore_leave_partner: "Shore Leave Partner",
};

/* operations.md §5 — the rate card. The select fills these as an opening
   figure; the retainer field stays the operator's to override. */
const RATE_CARD: Record<SponsorTier, number> = {
  presenting_partner: 1000000,
  sandbar_hub: 400000,
  confessional_pod: 300000,
  shore_leave_partner: 200000,
};

const TIERS: SponsorTier[] = [
  "presenting_partner",
  "sandbar_hub",
  "confessional_pod",
  "shore_leave_partner",
];

/* starts_on/ends_on are date-only rows; read them on UTC so the term shown
   is the term signed, whatever clock the console runs on. */
function termLine(s: SponsorItem): string {
  if (!s.startsOn && !s.endsOn) return "—";
  const from = s.startsOn ? logDate(s.startsOn, "UTC") : "OPEN";
  const to = s.endsOn ? logDate(s.endsOn, "UTC") : "OPEN";
  return `${from} — ${to}`;
}

export function SponsorsClient({
  rows,
  voyages,
}: {
  rows: SponsorItem[];
  voyages: Array<{ value: string; label: string }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [signing, setSigning] = React.useState(false);

  const [name, setName] = React.useState("");
  const [tier, setTier] = React.useState<SponsorTier>("presenting_partner");
  const [retainer, setRetainer] = React.useState(String(RATE_CARD.presenting_partner / 100));
  const [email, setEmail] = React.useState("");
  const [startsOn, setStartsOn] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [notes, setNotes] = React.useState("");

  /* Per-sponsor picks for the activation control below the book. */
  const [picks, setPicks] = React.useState<Record<string, { voyage: string; placement: string }>>({});
  const pickFor = (id: string) => picks[id] ?? { voyage: "", placement: "" };
  const setPick = (id: string, patch: Partial<{ voyage: string; placement: string }>) =>
    setPicks((p) => ({ ...p, [id]: { ...pickFor(id), ...patch } }));

  const columns = [
    {
      key: "name",
      label: "Sponsor",
      render: (r: SponsorItem) => (
        <span>
          <b style={{ fontWeight: 600 }}>{r.name}</b>
          {r.contactEmail ? (
            <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>
              {r.contactEmail}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "tier",
      label: "Tier",
      width: 170,
      render: (r: SponsorItem) => TIER_LABEL[r.tier],
    },
    {
      key: "retainer",
      label: "Retainer",
      width: 110,
      mono: true,
      /* price(0) reads COMPLIMENTARY — right for a pass, wrong for a ledger. */
      render: (r: SponsorItem) => `${r.monthlyCents ? price(r.monthlyCents) : "$0"} / MO`,
    },
    {
      key: "term",
      label: "Term",
      width: 170,
      mono: true,
      render: (r: SponsorItem) => termLine(r),
    },
    {
      key: "active",
      label: "State",
      width: 100,
      render: (r: SponsorItem) => (
        <Badge tone={r.active ? "positive" : "outline"}>{r.active ? "Active" : "Retired"}</Badge>
      ),
    },
    {
      key: "act",
      label: "",
      width: 70,
      render: (r: SponsorItem) => (
        <Switch
          aria-label={r.active ? `Retire ${r.name}` : `Reinstate ${r.name}`}
          checked={r.active}
          disabled={pending}
          onChange={() =>
            startTransition(async () => {
              const res = await setSponsorActive(r.id, !r.active);
              if (res.error) show({ msg: res.error, tone: "danger" });
              else if (r.active)
                show({ msg: "Retired. The shore stops crediting them now.", meta: r.name.toUpperCase() });
              else show({ msg: "Back on the book.", meta: r.name.toUpperCase() });
            })
          }
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ margin: "22px 0 14px", display: "flex", gap: 10 }}>
        <Button variant="gold" onClick={() => setSigning(true)}>
          Sign a sponsor
        </Button>
      </div>

      {rows.length === 0 ? (
        <StateBlock
          title="No names on the book."
          detail="A sponsor keeps a retainer and gets a credit on the sailings it rides. Sign the first one and place it below."
        />
      ) : (
        <Table columns={columns} rows={rows} rowKey={(r) => r.id} />
      )}

      {rows.length > 0 ? (
        <section className="hm-sec">
          <h2>Placements.</h2>
          <p className="hm-lede" style={{ marginTop: 4 }}>
            An activation puts the name on a sailing — the public page reads it as a
            credit line, presenting partner first. Placement is a note for the crew,
            not copy for the shore.
          </p>
          {rows.map((s) => {
            const pick = pickFor(s.id);
            const taken = new Set(s.activations.map((a) => a.voyageId));
            const open = voyages.filter((v) => !taken.has(v.value));
            return (
              <div key={s.id} className="hm-panel" style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <b style={{ fontWeight: 600 }}>{s.name}</b>
                  <span className="ls-mono-data" style={{ color: "var(--text-3)", textTransform: "uppercase" }}>
                    {TIER_LABEL[s.tier]}
                    {s.active ? "" : " · RETIRED"}
                  </span>
                </div>

                {s.activations.length > 0 ? (
                  <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                    {s.activations.map((a) => (
                      <div
                        key={a.voyageId}
                        style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                      >
                        <span style={{ fontSize: 13 }}>
                          {a.label}
                          {a.placement ? (
                            <span style={{ color: "var(--text-3)" }}> · {a.placement}</span>
                          ) : null}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const res = await detachSponsor(a.voyageId, s.id);
                              if (res.error) show({ msg: res.error, tone: "danger" });
                              else show({ msg: "Taken off the sailing.", meta: s.name.toUpperCase() });
                            })
                          }
                        >
                          Take it off
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ marginTop: 10, fontSize: 13, color: "var(--text-3)" }}>
                    On no sailing yet.
                  </p>
                )}

                {s.active ? (
                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    <Select
                      label="Sailing"
                      value={pick.voyage}
                      onChange={(e) => setPick(s.id, { voyage: e.target.value })}
                      style={{ minWidth: 260 }}
                      options={[
                        {
                          value: "",
                          label: open.length ? "Pick the sailing" : "Nothing open to place it on",
                        },
                        ...open,
                      ]}
                    />
                    <Input
                      label="Placement"
                      hint="Optional — where the asset sits."
                      value={pick.placement}
                      onChange={(e) => setPick(s.id, { placement: e.target.value })}
                      style={{ minWidth: 220 }}
                    />
                    <Button
                      variant="outline"
                      disabled={pending || !pick.voyage}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await attachSponsor(pick.voyage, s.id, pick.placement);
                          if (res.error) {
                            show({ msg: res.error, tone: "danger" });
                            return;
                          }
                          setPick(s.id, { voyage: "", placement: "" });
                          show({ msg: "Placed. The credit rides with the sailing.", meta: s.name.toUpperCase() });
                        })
                      }
                    >
                      Place it
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      <Dialog
        open={signing}
        onClose={() => setSigning(false)}
        eyebrow="THE BRIDGE · SIGN A SPONSOR"
        title="Sign a sponsor"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSigning(false)}>
              Not now
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createSponsor({
                    name,
                    tier,
                    monthlyCents: Math.round((Number(retainer) || 0) * 100),
                    contactEmail: email,
                    startsOn,
                    endsOn,
                    notes,
                  });
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  setSigning(false);
                  setName("");
                  setTier("presenting_partner");
                  setRetainer(String(RATE_CARD.presenting_partner / 100));
                  setEmail("");
                  setStartsOn("");
                  setEndsOn("");
                  setNotes("");
                  show({ msg: "Signed.", meta: "ON THE BOOK · PLACE IT ON A SAILING" });
                })
              }
            >
              Sign them
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select
            label="Tier"
            hint="Picking a tier fills the rate-card figure below."
            value={tier}
            onChange={(e) => {
              const t = e.target.value as SponsorTier;
              setTier(t);
              /* The card is the default, not the deal — the operator can
                 override the figure after picking. */
              setRetainer(String(RATE_CARD[t] / 100));
            }}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </Select>
          <Input
            label="Monthly retainer"
            hint="Dollars a month, as agreed."
            type="number"
            min={0}
            value={retainer}
            onChange={(e) => setRetainer(e.target.value)}
          />
          <Input
            label="Contact email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Term begins"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
          <Input
            label="Term ends"
            hint="Left blank, the term runs open."
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
          <Input
            label="Notes"
            hint="Bridge reading only."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
