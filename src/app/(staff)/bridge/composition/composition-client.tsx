"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog, Input, Select, Stat, StateBlock, Toast } from "@/components/ds";
import {
  SEGMENTS,
  SEGMENT_HEADS,
  SEGMENT_LABEL,
  type Segment,
  type SegmentCapacityRow,
} from "@/lib/vetting";
import { offerTheNextPlace } from "../../../(member)/vetting/actions";
import { useToast } from "../../ui";
import { liftTheComposition, setHullCeiling, setTheComposition } from "./actions";

/* The bounds setHullCeiling enforces; a "use server" module cannot export
   them, so they are stated on both sides of the wire. */
const HULL_CEILING_MIN = 1;
const HULL_CEILING_MAX = 400;
const HULL_CERTIFICATE_MAX = 200;

export type QueueLine = {
  segment: Segment;
  waiting: number;
  /** Offers whose six hours are still running. */
  offered: number;
  /** Offers whose six hours ran out and that nothing has swept yet. Shown
      rather than counted as outstanding — the seat is free again. */
  lapsed: number;
  claimed: number;
};

export function EpisodePicker({
  options,
  value,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  const router = useRouter();
  return (
    <Select
      label="Episode"
      options={options}
      value={value}
      onChange={(e) => router.replace(`/bridge/composition?episode=${e.target.value}`)}
      style={{ maxWidth: 420 }}
    />
  );
}

export function CompositionPanel({
  episodeId,
  voyageTitle,
  hull,
  hullCeiling,
  hullCertificate,
  clubCeiling,
  rows,
  lines,
}: {
  episodeId: string;
  voyageTitle: string;
  /** Heads the hull carries net of operator holds — the number guard_the_ratio
      refuses against, and the only honest denominator for the head total. */
  hull: number;
  /** episodes.hull_ceiling_heads — this flotilla's certified heads, or null to
      read the club's figure. */
  hullCeiling: number | null;
  /** episodes.hull_certificate — the vessel, the authority and the certified
      number. a_tentpole_names_its_certificate requires it for any ceiling
      above the club's figure; below that it is a note. */
  hullCertificate: string | null;
  /** club_setting('hull_ceiling_heads') — what the trigger reads when the
      episode carries no ceiling of its own. */
  clubCeiling: number;
  rows: SegmentCapacityRow[];
  lines: QueueLine[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [confirmLift, setConfirmLift] = React.useState(false);

  /* The ceiling field holds a string so that blank can mean "club default"
     rather than nought. Mounted under key={episode.id} like the rest. */
  const [ceilingDraft, setCeilingDraft] = React.useState(
    hullCeiling === null ? "" : String(hullCeiling)
  );
  /* The certificate saves in the same act as the ceiling — one update, so a
     tentpole ceiling and its certificate can never be written apart — and so
     one dirty flag covers both fields. */
  const [certificateDraft, setCertificateDraft] = React.useState(hullCertificate ?? "");
  const ceilingDirty =
    ceilingDraft.trim() !== (hullCeiling === null ? "" : String(hullCeiling)) ||
    certificateDraft.trim() !== (hullCertificate ?? "");
  /* What a_tentpole_names_its_certificate will refuse: a draft ceiling above
     the club's figure with nothing in the certificate. Said before the click,
     in the same terms the trigger will use after it. */
  const draftCeiling = ceilingDraft.trim() === "" ? null : Number(ceilingDraft);
  const needsCertificate =
    draftCeiling !== null &&
    Number.isFinite(draftCeiling) &&
    clubCeiling > 0 &&
    draftCeiling > clubCeiling &&
    certificateDraft.trim() === "";
  /* What the_hull_holds_forty will check the composition against: the
     episode's own figure when it has one, the club's otherwise. */
  const effectiveCeiling = hullCeiling ?? clubCeiling;

  /* The draft ceilings belong to the episode on screen, and the page mounts
     this panel under key={episode.id} so switching the picker starts a fresh
     one. The alternative — resetting the draft from an effect — left the
     previous episode's ceilings in the fields under the new episode's name for
     one render, and that render is the one where somebody clicks Save. */
  const capOf = (s: Segment) => rows.find((r) => r.segment === s)?.cap ?? 0;
  const [draft, setDraft] = React.useState<Record<Segment, number>>({
    single_woman: capOf("single_woman"),
    single_man: capOf("single_man"),
    couple: capOf("couple"),
  });

  const gated = rows.length > 0;
  const draftHeads = SEGMENTS.reduce((n, s) => n + draft[s] * SEGMENT_HEADS[s], 0);
  /* Passes booked before this episode was gated carry no segment and so appear
     in no cap row. They are aboard, they occupy the hull, and the ratio gate
     counts them — leaving them out of the figure the operator sets ceilings
     against is how a "Seated 0 / 32" is shown for a boat with two people on
     it. One head each: an unsegmented pass cannot be a couple. */
  const unsegmented = rows[0]?.unsegmented_aboard ?? 0;
  const seatedHeads =
    rows.reduce((n, r) => n + r.units * SEGMENT_HEADS[r.segment], 0) + unsegmented;
  /* Over the hull means over the certified ceiling — the figure the trigger
     refuses against — not over the berths on sale. */
  const overHull = effectiveCeiling > 0 && draftHeads > effectiveCeiling;
  const dirty = SEGMENTS.some((s) => draft[s] !== capOf(s));
  /* A ceiling below the seats already sold does not unseat anybody — the
     capacity view floors `remaining` at nought — but it does mean the segment
     reads FULL to everyone from now on. Worth saying before the click, not
     after. */
  const underSold = SEGMENTS.filter((s) => {
    const row = rows.find((r) => r.segment === s);
    return row ? draft[s] < row.units : false;
  });

  const save = () =>
    startTransition(async () => {
      const res = await setTheComposition(episodeId, draft);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else
        show({
          msg: gated ? "Composition set." : "Composition set. This episode is now ratio-gated.",
          meta: `${draftHeads} HEADS OF ${hull || draftHeads}`,
        });
    });

  const saveCeiling = () =>
    startTransition(async () => {
      const raw = ceilingDraft.trim();
      const heads = raw === "" ? null : Number(raw);
      const named = certificateDraft.trim();
      const res = await setHullCeiling(episodeId, heads, named === "" ? null : named);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else
        show({
          msg:
            heads === null
              ? "Ceiling cleared. This episode reads the club default."
              : "Ceiling set. Compositions on this episode are checked against it.",
          meta: `THE HULL HOLDS ${heads ?? clubCeiling}${named ? " · CERTIFICATE NAMED" : ""}`,
        });
    });

  const lift = () =>
    startTransition(async () => {
      const res = await liftTheComposition(episodeId);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else
        /* res.note names anyone released from the line. Lifting the ceilings
           dissolves the queue that was waiting on them, and the operator should
           be told that happened rather than discovering it later. */
        show({
          msg:
            "Composition lifted. The ratio gate and the vetting gate no longer run on this episode." +
            (res.note ? ` ${res.note}` : ""),
          tone: res.note ? "caution" : undefined,
        });
      setConfirmLift(false);
    });

  const offer = (s: Segment) =>
    startTransition(async () => {
      const res = await offerTheNextPlace(episodeId, s);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else
        show({
          msg: `Offered to first in line, ${SEGMENT_LABEL[s].toLowerCase()}. One notice, six hours.`,
        });
    });

  const lineOf = (s: Segment) =>
    lines.find((l) => l.segment === s) ?? { segment: s, waiting: 0, offered: 0, lapsed: 0, claimed: 0 };

  return (
    <>
      <div className="hm-row">
        <Stat
          size="sm"
          label="Gate"
          value={gated ? "Running" : "Off"}
          sub={gated ? "RATIO AND VETTING ENFORCED" : "NO COMPOSITION ON THIS EPISODE"}
        />
        <Stat
          size="sm"
          label="Seated"
          value={`${seatedHeads} / ${hull || "—"}`}
          sub={
            unsegmented > 0
              ? `HEADS · ${unsegmented} BOOKED BEFORE GATING`
              : "HEADS, COUPLES COUNT TWO"
          }
        />
        <Stat
          size="sm"
          label="Composition"
          value={`${draftHeads} heads`}
          sub={overHull ? `OVER THE HULL OF ${effectiveCeiling}` : "AT THESE CEILINGS"}
        />
      </div>

      <section className="hm-sec">
        <div className="hm-head">
          <h2>The hull.</h2>
          <span className="hm-acts">
            <Button variant="outline" size="sm" disabled={pending || !ceilingDirty} onClick={saveCeiling}>
              Save the ceiling
            </Button>
          </span>
        </div>
        <p className="hm-note">
          The heads this flotilla is certified for. A composition that seats more
          than this is refused at the database, before anyone can be sold a seat
          the hull cannot hold. Blank reads the club&apos;s figure, {clubCeiling} heads.
        </p>
        <p className="hm-note">
          A ceiling above the club&apos;s figure of {clubCeiling} heads names its
          certificate — the vessel, the authority and the certified number — and
          is refused without one. At or below {clubCeiling} the certificate is
          optional.
        </p>
        <div className="hm-form" style={{ marginTop: 18, maxWidth: 720 }}>
          <div className="hm-item">
            <div className="hm-item__head">
              <b>Ceiling</b>
              <Badge tone={hullCeiling === null ? "outline" : "ink"}>
                {hullCeiling === null ? `Club default · ${clubCeiling}` : `${hullCeiling} heads`}
              </Badge>
              <span className="hm-item__acts">
                <Input
                  label="Heads"
                  type="number"
                  inputMode="numeric"
                  min={HULL_CEILING_MIN}
                  max={HULL_CEILING_MAX}
                  placeholder={String(clubCeiling)}
                  value={ceilingDraft}
                  onChange={(e) => setCeilingDraft(e.target.value)}
                  style={{ width: 110 }}
                />
                <Input
                  label="Certificate"
                  type="text"
                  maxLength={HULL_CERTIFICATE_MAX}
                  placeholder="Vessel · authority · certified heads"
                  value={certificateDraft}
                  onChange={(e) => setCertificateDraft(e.target.value)}
                  style={{ width: 320 }}
                />
              </span>
            </div>
            <div className="hm-item__meta">
              <span>
                {HULL_CEILING_MIN}–{HULL_CEILING_MAX} · BLANK READS THE CLUB DEFAULT
              </span>
              <span>
                {hullCertificate ? "CERTIFICATE NAMED" : "NO CERTIFICATE"} · UP TO{" "}
                {HULL_CERTIFICATE_MAX} CHARACTERS
              </span>
              <span>{hull} PASSES ON SALE NET OF HOLDS</span>
            </div>
          </div>
        </div>
        {needsCertificate ? (
          <p className="hm-note" role="status" style={{ color: "var(--caution)" }}>
            {draftCeiling} heads is above the club&apos;s {clubCeiling}. The database
            refuses this ceiling until the certificate is named.
          </p>
        ) : null}
      </section>

      <section className="hm-sec">
        <div className="hm-head">
          <h2>The ceilings.</h2>
          <span className="hm-acts">
            {gated ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmLift(true)}>
                Lift the composition
              </Button>
            ) : null}
            <Button variant="gold" size="sm" disabled={pending || !dirty} onClick={save}>
              {gated ? "Save the composition" : "Gate this episode"}
            </Button>
          </span>
        </div>
        <p className="hm-note">
          One ceiling per segment, in units. A couple is one pass and two heads,
          which is why the head total is not the sum of the three numbers. A
          segment at its ceiling offers the line and never another segment.
        </p>

        <div className="hm-form" style={{ marginTop: 18, maxWidth: 720 }}>
          {SEGMENTS.map((s) => {
            const row = rows.find((r) => r.segment === s);
            const line = lineOf(s);
            const remaining = row ? row.remaining : 0;
            return (
              <div className="hm-item" key={s}>
                <div className="hm-item__head">
                  <b>{SEGMENT_LABEL[s]}</b>
                  {row ? (
                    <Badge tone={remaining === 0 ? "caution" : "positive"}>
                      {remaining === 0 ? "Full" : `${remaining} left`}
                    </Badge>
                  ) : (
                    <Badge tone="outline">Not seated</Badge>
                  )}
                  <span className="hm-item__acts">
                    <Input
                      label="Ceiling"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={96}
                      value={String(draft[s])}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [s]: Math.max(0, Math.min(96, Math.round(Number(e.target.value) || 0))),
                        }))
                      }
                      style={{ width: 110 }}
                    />
                  </span>
                </div>
                <div className="hm-item__meta">
                  <span>
                    {row ? `${row.units} SOLD` : "0 SOLD"} · {SEGMENT_HEADS[s]} HEAD
                    {SEGMENT_HEADS[s] > 1 ? "S" : ""} PER PASS
                  </span>
                  <span>
                    {line.waiting === 0 ? "NOBODY WAITING" : `${line.waiting} WAITING`}
                    {line.offered ? ` · ${line.offered} OFFERED` : ""}
                    {line.lapsed ? ` · ${line.lapsed} LAPSED` : ""}
                  </span>
                  {line.waiting > 0 && remaining > 0 ? (
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => offer(s)}>
                      Offer the next place
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {overHull ? (
          <p className="hm-note" role="status" style={{ color: "var(--caution)" }}>
            {draftHeads} heads against a hull certified for {effectiveCeiling}
            {hullCeiling === null ? " (the club default)" : ""}. The database
            refuses this composition as it stands — lower a ceiling, or raise
            the hull above if the flotilla is certified for more.
          </p>
        ) : null}
        {underSold.length ? (
          <p className="hm-note" role="status">
            {underSold.map((s) => SEGMENT_LABEL[s]).join(", ")} would sit below what is
            already sold. Nobody is unseated; the segment simply reads full from
            here on.
          </p>
        ) : null}
      </section>

      <Dialog
        open={confirmLift}
        onClose={() => setConfirmLift(false)}
        eyebrow="Lift the composition"
        title="Turn the gates off for this episode?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmLift(false)}>
              Leave it on
            </Button>
            <Button variant="gold" disabled={pending} onClick={lift}>
              Lift it
            </Button>
          </>
        }
      >
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>
          {voyageTitle.replace(/\.+$/, "")} stops being ratio-gated. The segment
          gate stops counting, and the vetting gate stops running — a pass with
          no clearance and no verified identity will board.
        </p>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", marginTop: 10 }}>
          Passes already sold keep their seats. Nobody may be standing in the
          line when this happens.
        </p>
      </Dialog>

      {toast ? <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} /> : null}
    </>
  );
}

export function NoSailings() {
  return (
    <StateBlock
      status="empty"
      icon="CalendarDays"
      title="Nothing composed yet."
      detail="A composition belongs to an episode. Put one on the board from the Episodes tab and its three ceilings show here."
    />
  );
}
