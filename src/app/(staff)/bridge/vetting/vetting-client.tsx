"use client";

import React from "react";
import { Badge, Button, Checkbox, Dialog, Input, Select, StateBlock, Table, Toast } from "@/components/ds";
import {
  BACKGROUND_LABEL,
  BACKGROUND_LINE,
  BACKGROUND_STATES,
  type BackgroundState,
} from "@/lib/vetting";
import { useToast } from "../../ui";
import { advanceTheFile, openTheFile, sweepSpentIdentityRecords } from "./actions";

export type FileRow = {
  id: string;
  profileId: string;
  name: string;
  memberNo: string;
  state: BackgroundState;
  idVerified: boolean;
  ageOk: boolean;
  fastTrack: boolean;
  /** Pre-formatted for display; the wall-clock form for the field is separate. */
  clearedUntil: string | null;
  interviewAt: string | null;
  interviewLocal: string;
  purgeDue: string | null;
  sheetComplete: boolean;
  [key: string]: unknown;
};

function stateTone(s: BackgroundState): "gold" | "positive" | "caution" | "outline" {
  if (s === "cleared") return "positive";
  if (s === "needs_a_call") return "caution";
  if (s === "declined") return "outline";
  return "outline";
}

export function VettingClient({
  rows,
  unfiled,
}: {
  rows: FileRow[];
  unfiled: Array<{ value: string; label: string }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [open, setOpen] = React.useState<FileRow | null>(null);
  const [opening, setOpening] = React.useState(false);
  const [newProfile, setNewProfile] = React.useState("");
  const [confirmDecline, setConfirmDecline] = React.useState(false);
  const [filter, setFilter] = React.useState("");

  /* The dialog's own copy of the file. Editing in place would write on every
     keystroke; this collects the four decisions and commits them once. */
  const [draft, setDraft] = React.useState({
    idVerified: false,
    ageOk: false,
    state: "submitted" as BackgroundState,
    interview: "",
  });

  const openFile = (r: FileRow) => {
    setDraft({
      idVerified: r.idVerified,
      ageOk: r.ageOk,
      state: r.state,
      interview: r.interviewLocal,
    });
    setConfirmDecline(false);
    setOpen(r);
  };

  const commit = (row: FileRow) =>
    startTransition(async () => {
      const res = await advanceTheFile(row.id, {
        idVerified: draft.idVerified,
        ageOk: draft.ageOk,
        backgroundState: draft.state,
        interviewAt: draft.interview,
      });
      if (res.error) {
        show({ msg: res.error, tone: "danger" });
        return;
      }
      show({ msg: `File saved. ${BACKGROUND_LINE[draft.state]}`, meta: row.name.toUpperCase() });
      setOpen(null);
      setConfirmDecline(false);
    });

  const create = () =>
    startTransition(async () => {
      const res = await openTheFile(newProfile);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        show({ msg: "File open. It reads SUBMITTED to the member — with the vetting team, 48 hours." });
        setOpening(false);
        setNewProfile("");
      }
    });

  const sweep = () =>
    startTransition(async () => {
      const res = await sweepSpentIdentityRecords();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else
        show({
          msg:
            res.swept === 0
              ? "Nothing was due. Every due date was recomputed against its last sailing."
              : `${res.swept} identity record${res.swept === 1 ? "" : "s"} cleared.`,
        });
    });

  const q = filter.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.memberNo.toLowerCase().includes(q))
    : rows;

  const columns = [
    {
      key: "name",
      label: "Member",
      render: (r: FileRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{r.name}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>{r.memberNo}</span>
        </span>
      ),
    },
    {
      key: "state",
      label: "Background",
      width: 140,
      render: (r: FileRow) => <Badge tone={stateTone(r.state)}>{BACKGROUND_LABEL[r.state]}</Badge>,
    },
    {
      key: "identity",
      label: "Identity",
      width: 130,
      render: (r: FileRow) => (
        <span className="hm-mono">
          {r.idVerified ? "VERIFIED" : "NOT SEEN"}
          <span style={{ display: "block" }}>{r.ageOk ? "AGE OK" : "AGE UNCONFIRMED"}</span>
        </span>
      ),
    },
    {
      key: "cleared",
      label: "Clearance",
      width: 150,
      render: (r: FileRow) => (
        <span className="hm-mono">
          {r.clearedUntil ? `GOOD TO ${r.clearedUntil}` : r.interviewAt ? `CALL ${r.interviewAt}` : "—"}
        </span>
      ),
    },
    {
      key: "sheet",
      label: "Sheet",
      width: 100,
      render: (r: FileRow) => (
        <span className="hm-mono">{r.sheetComplete ? "COMPLETE" : "OPEN"}</span>
      ),
    },
    {
      key: "act",
      label: "",
      width: 120,
      render: (r: FileRow) => (
        <Button size="sm" variant="ghost" onClick={() => openFile(r)}>
          Open the file
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="hm-filters">
        <div className="hm-filters__grow">
          <Input
            label="Find"
            placeholder="Name or member number"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <span className="hm-filters__acts">
          <Button variant="ghost" size="sm" disabled={pending} onClick={sweep}>
            Sweep spent identity records
          </Button>
          <Button variant="gold" size="sm" disabled={unfiled.length === 0} onClick={() => setOpening(true)}>
            Open a file
          </Button>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="hm-sec">
          <StateBlock
            status="empty"
            icon="ShieldCheck"
            title="No files open."
            detail="A vetting file is the club's record about a member: identity, age, and the background state. Until one is open, four of the six gates on that member's own checklist cannot turn, and no ratio-gated sailing will seat them."
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="hm-sec">
          <StateBlock status="empty" title="Nobody by that name." detail="Clear the filter to see every open file." />
        </div>
      ) : (
        <div className="hm-sec">
          <Table columns={columns} rows={shown} rowKey={(r) => r.id} onRowClick={(r) => openFile(r)} />
          <span className="hm-count">
            {shown.length} of {rows.length} files · {unfiled.length} member
            {unfiled.length === 1 ? "" : "s"} with no file
          </span>
        </div>
      )}

      {/* Open a file */}
      <Dialog
        open={opening}
        onClose={() => setOpening(false)}
        eyebrow="Vetting"
        title="Open a file"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpening(false)}>
              Cancel
            </Button>
            <Button variant="gold" disabled={pending || !newProfile} onClick={create}>
              Open it
            </Button>
          </>
        }
      >
        <Select
          label="Member"
          placeholder="Pick a member"
          options={unfiled}
          value={newProfile}
          onChange={(e) => setNewProfile(e.target.value)}
        />
        <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 12 }}>
          The file opens SUBMITTED. The member reads &ldquo;with the vetting
          team, 48 hours&rdquo; and nothing else — no counts, no queue position,
          nothing about anybody else.
        </p>
      </Dialog>

      {/* Advance a file */}
      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        width={560}
        eyebrow={open ? open.memberNo : undefined}
        title={open ? open.name : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>
              Close
            </Button>
            <Button
              variant="gold"
              disabled={pending || (draft.state === "declined" && !confirmDecline)}
              onClick={() => open && commit(open)}
            >
              Save the file
            </Button>
          </>
        }
      >
        {open ? (
          <div className="hm-form">
            <Checkbox
              label="Identity verified"
              description="The record is cleared thirty days after their last sailing, by the sweep."
              checked={draft.idVerified}
              onChange={(e) => setDraft((d) => ({ ...d, idVerified: e.target.checked }))}
            />
            <Checkbox
              label="Age 25 to 45 confirmed"
              description="No exceptions — the gate refuses at checkout and names the range."
              checked={draft.ageOk}
              onChange={(e) => setDraft((d) => ({ ...d, ageOk: e.target.checked }))}
            />

            <Select
              label="Background state"
              value={draft.state}
              disabled={open.state === "declined"}
              onChange={(e) => {
                const next = e.target.value as BackgroundState;
                setConfirmDecline(false);
                setDraft((d) => ({ ...d, state: next }));
              }}
              options={BACKGROUND_STATES.map((s) => ({ value: s, label: BACKGROUND_LABEL[s] }))}
              hint={BACKGROUND_LINE[draft.state]}
            />

            {draft.state === "needs_a_call" ? (
              <Input
                label="Interview at"
                type="datetime-local"
                value={draft.interview}
                onChange={(e) => setDraft((d) => ({ ...d, interview: e.target.value }))}
                hint="Ten minutes, on video. The member is told a call finishes their clearance, so it needs a time on it."
              />
            ) : null}

            {open.state === "declined" ? (
              <p className="hm-note">
                This file is declined. We do not explain declines and we do not
                reopen them, so the state cannot be moved from here.
              </p>
            ) : draft.state === "declined" ? (
              <Checkbox
                label="I understand a decline is final"
                description="It is never explained and it is not reopened from this screen. The member is told only that we do not reopen them."
                checked={confirmDecline}
                onChange={(e) => setConfirmDecline(e.target.checked)}
              />
            ) : null}

            <div className="hm-item">
              <div className="hm-item__meta">
                <span>{open.fastTrack ? "FAST-TRACK · MEMBERSHIP" : "NO FAST-TRACK"}</span>
                <span>{open.clearedUntil ? `CLEARED TO ${open.clearedUntil}` : "NOT CLEARED"}</span>
                {/* "NO PURGE DUE" read as reassurance and meant the opposite.
                    purge_spent_identity_records derives a due date only from a
                    COMPLETED aboard sailing, so a member who is verified and
                    never sails is scheduled for nothing and their identity
                    record is kept indefinitely. Say which of the two this is. */}
                <span>
                  {open.purgeDue
                    ? `ID PURGE DUE ${open.purgeDue}`
                    : open.idVerified
                      ? "ID HELD — NO PURGE SCHEDULED (NO COMPLETED SAILING)"
                      : "NO ID ON FILE"}
                </span>
              </div>
              <p className="hm-item__body">
                Fast-track follows the membership and is never set here. Twelve
                months from clearance, and thirty days from the last sailing for
                the identity record, are both settled by the database.
              </p>
            </div>
          </div>
        ) : null}
      </Dialog>

      {toast ? <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} /> : null}
    </>
  );
}
