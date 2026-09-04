"use client";

import React from "react";
import { Badge, Button, Dialog, Input, Select, StateBlock, Stat, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { assignCrew, setAssignmentStatus, setEpisodeNeed } from "./actions";

export type GapRow = {
  episodeId: string;
  slug: string;
  title: string;
  starts: string;
  daysOut: number;
  setting: string;
  positionSlug: string;
  positionLabel: string;
  needed: number;
  confirmed: number;
  offered: number;
  short: number;
};

export type CrewOption = {
  id: string;
  name: string;
  roleTitle: string;
  /* Episode ids this person is already on, so the picker can say so rather than
     letting the unique index refuse the insert after the fact. */
  onEpisodes: string[];
  /* Dates they said they cannot work, as YYYY-MM-DD ranges. */
  blackouts: Array<{ from: string; to: string }>;
};

export type BillingRow = {
  id: string;
  episodeId: string;
  crewId: string;
  crewName: string;
  positionSlug: string;
  status: "offered" | "confirmed" | "declined" | "released";
};

const STATUS_TONE: Record<string, "gold" | "ink" | "positive" | "caution" | "outline"> = {
  offered: "gold",
  confirmed: "positive",
  declined: "caution",
  released: "outline",
};

/* The rota, and it is a list of holes rather than a calendar.

   A grid of everyone against every night is the thing rota software reaches for
   and it answers a question nobody has. The question is which nights are short
   and how soon — so that is the whole surface, sorted by soonest, with the
   offers that have not been answered called out separately because an offer
   nobody accepted is not cover. */
export function Rota({
  gaps,
  crew,
  billings,
}: {
  gaps: GapRow[];
  crew: CrewOption[];
  billings: BillingRow[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [filling, setFilling] = React.useState<GapRow | null>(null);
  const [pick, setPick] = React.useState("");
  /* A night's own headcount for a position, typed but not yet set. */
  const [need, setNeed] = React.useState<Record<string, string>>({});

  const short = gaps.filter((g) => g.short > 0);
  const soon = short.filter((g) => g.daysOut <= 14);
  /* An offer still outstanding inside two days is the other kind of gap — the
     one that looks filled on the board and is not. */
  const unanswered = gaps.filter((g) => g.offered > 0 && g.short > 0 && g.daysOut <= 2);

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  const offer = () => {
    if (!filling || !pick) return;
    const g = filling;
    const who = crew.find((c) => c.id === pick);
    setFilling(null);
    setPick("");
    run(
      () => assignCrew(g.episodeId, pick, g.positionSlug),
      () => show({ msg: `${who?.name ?? "Offered"} → ${g.title}.`, meta: g.positionLabel.toUpperCase() })
    );
  };

  const setStatus = (b: BillingRow, status: BillingRow["status"]) => {
    run(
      () => setAssignmentStatus(b.id, status),
      () => show({ msg: `${b.crewName} — ${status}.`, meta: "ROTA" })
    );
  };

  /* Who can actually take this slot: not already on that night, and not
     blacked out across its date. The unique index and the humans both get to
     stop being surprised. */
  const candidatesFor = (g: GapRow) => {
    const day = g.starts.slice(0, 10);
    return crew.filter(
      (c) =>
        !c.onEpisodes.includes(g.episodeId) &&
        !c.blackouts.some((b) => b.from <= day && b.to >= day)
    );
  };

  if (crew.length === 0) {
    return (
      <StateBlock
        status="empty"
        icon="Users"
        title="Nobody on the crew list."
        detail="Add the people first — a rota with no crew in it is a list of holes and no way to fill them."
      />
    );
  }

  return (
    <>
      <div className="hm-row">
        <Stat label="Short" value={short.length} sub={`${soon.length} INSIDE 14 DAYS`} />
        <Stat label="Unanswered" value={unanswered.length} sub="OFFERS INSIDE 48H" />
        <Stat label="Crew" value={crew.length} sub="ON THE LIST" />
      </div>

      {short.length === 0 ? (
        <StateBlock
          status="empty"
          icon="Check"
          title="Every night is crewed."
          detail="Nothing on the board is short. It will not last, but it is true now."
        />
      ) : (
        <div className="hm-rota">
          {short.map((g) => {
            const onThis = billings.filter(
              (b) =>
                b.episodeId === g.episodeId &&
                b.positionSlug === g.positionSlug &&
                b.status !== "released" &&
                b.status !== "declined"
            );
            return (
              <div key={`${g.episodeId}-${g.positionSlug}`} className="hm-rota__row">
                <div className="hm-rota__when">
                  <b>{g.starts.slice(0, 10)}</b>
                  <span>
                    {g.daysOut <= 0 ? "TODAY" : `${g.daysOut}D OUT`}
                  </span>
                </div>
                <div className="hm-rota__what">
                  <div className="hm-rota__t">{g.title}</div>
                  <div className="hm-rota__m">
                    <span>{g.positionLabel}</span>
                    <span>·</span>
                    <span>
                      {g.confirmed} of {g.needed} confirmed
                    </span>
                    {onThis.map((b) => (
                      <Badge key={b.id} tone={STATUS_TONE[b.status]}>
                        {b.crewName} — {b.status}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="hm-rota__act">
                  {onThis
                    .filter((b) => b.status === "offered")
                    .map((b) => (
                      <React.Fragment key={b.id}>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => setStatus(b, "confirmed")}
                        >
                          Confirm {b.crewName.split(" ")[0]}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => setStatus(b, "released")}
                        >
                          Release
                        </Button>
                      </React.Fragment>
                    ))}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setFilling(g);
                      setPick("");
                    }}
                  >
                    Offer it
                  </Button>
                  {(() => {
                    const key = `${g.episodeId}-${g.positionSlug}`;
                    const typed = need[key] ?? String(g.needed);
                    const changed = typed !== String(g.needed);
                    return (
                      <span className="hm-need">
                        <Input
                          label="Needs"
                          type="number"
                          min={0}
                          max={50}
                          value={typed}
                          onChange={(e) => setNeed((s) => ({ ...s, [key]: e.target.value }))}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending || !changed}
                          onClick={() =>
                            run(
                              () => setEpisodeNeed(g.episodeId, g.positionSlug, Number(typed)),
                              () => show({ msg: `${g.title} — ${g.positionLabel} needs ${typed}.`, meta: "ROTA" })
                            )
                          }
                        >
                          Set
                        </Button>
                      </span>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!filling}
        onClose={() => setFilling(null)}
        width={440}
        eyebrow={filling ? filling.positionLabel : ""}
        title={filling ? filling.title : ""}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setFilling(null)}>
              Not now
            </Button>
            <Button variant="gold" size="sm" disabled={pending || !pick} onClick={offer}>
              Offer it
            </Button>
          </>
        }
      >
        {filling ? (
          <div className="hm-form">
            <Select
              label="Who"
              placeholder="Pick someone"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              options={candidatesFor(filling).map((c) => ({
                value: c.id,
                label: `${c.name} — ${c.roleTitle}`,
              }))}
            />
            <p className="hm-note">
              Anyone already on this episode, or blacked out across{" "}
              {filling.starts.slice(0, 10)}, is not in the list. An offer is not
              cover until they confirm.
            </p>
          </div>
        ) : null}
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
