"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Button, Select, Table, Toast } from "@/components/ds";
import { avatarTone, useToast } from "../../ui";
import { checkInRsvp } from "./actions";

export function VoyagePicker({
  options,
  value,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  const router = useRouter();
  return (
    <Select
      label="Voyage"
      options={options}
      value={value}
      onChange={(e) => router.replace(`/harbormaster/manifests?voyage=${e.target.value}`)}
      style={{ maxWidth: 380 }}
    />
  );
}

export type RosterRow = {
  rsvpId: string;
  name: string;
  tone: string;
  memberNo: string;
  guests: number;
  boardingCode: string;
  status: "aboard" | "waitlist";
  checkedInAt: string | null;
  waiverMissing: boolean;
  [key: string]: unknown;
};

export function RosterTable({
  rows,
  muster,
}: {
  rows: RosterRow[];
  muster: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();

  const checkIn = (r: RosterRow) => {
    startTransition(async () => {
      const res = await checkInRsvp(r.rsvpId);
      if (res.error) show({ msg: res.error, tone: "siren" });
      else
        show({
          msg: `${r.name} aboard.`,
          meta: `${r.boardingCode || "NO CODE"} · MUSTER ${muster}`,
          tone: "laurel",
        });
    });
  };

  return (
    <>
      <div className="hm-panel">
        <Table
          rowKey={(r: RosterRow) => r.rsvpId}
          columns={[
            {
              key: "name",
              label: "Name",
              render: (r: RosterRow) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={r.name} size="sm" tone={avatarTone(r.tone)} />
                  <b style={{ fontWeight: 600 }}>{r.name}</b>
                </span>
              ),
            },
            { key: "memberNo", label: "No.", mono: true },
            { key: "guests", label: "Guests", mono: true, width: 70 },
            {
              key: "boardingCode",
              label: "Boarding",
              mono: true,
              render: (r: RosterRow) => r.boardingCode || "—",
            },
            {
              key: "status",
              label: "Status",
              render: (r: RosterRow) => (
                <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" as const }}>
                  {r.checkedInAt ? (
                    <Badge tone="laurel">Checked in</Badge>
                  ) : r.status === "waitlist" ? (
                    <Badge tone="outline">Waitlist</Badge>
                  ) : (
                    <Badge tone="outline">Aboard</Badge>
                  )}
                  {r.waiverMissing ? <Badge tone="clay">Waiver missing</Badge> : null}
                </span>
              ),
            },
            {
              key: "act",
              label: "",
              render: (r: RosterRow) =>
                !r.checkedInAt && r.status === "aboard" ? (
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => checkIn(r)}>
                    Check in
                  </Button>
                ) : null,
            },
          ]}
          rows={rows}
        />
        {rows.length === 0 ? (
          <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: 13 }}>
            No berths claimed yet. The roster fills as RSVPs land.
          </p>
        ) : null}
      </div>
      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
