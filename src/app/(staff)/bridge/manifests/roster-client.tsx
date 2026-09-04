"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Dialog,
  FilterPills,
  Input,
  ListToolbar,
  Select,
  StateBlock,
  Stepper,
  Table,
  Toast,
  type TableColumn,
} from "@/components/ds";
import { avatarTone, useToast } from "../../ui";
import { addToManifest, assignVesselsEvenly, checkInPass, setPassVessel } from "./actions";

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
      onChange={(e) => router.replace(`/bridge/manifests?episode=${e.target.value}`)}
      style={{ maxWidth: 380 }}
    />
  );
}

export type FleetVessel = {
  id: string;
  name: string;
  capacity: number;
  filled: number;
};

/* The flotilla at a glance — one card per yacht, berths filled over capacity,
   plus whoever is still on the dock. */
export function FleetStrip({
  episodeId,
  vessels,
  unassigned,
}: {
  episodeId: string;
  vessels: FleetVessel[];
  unassigned: number;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();

  if (vessels.length === 0) return null;

  const distribute = () => {
    startTransition(async () => {
      const res = await assignVesselsEvenly(episodeId);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else show({ msg: "Passes spread across the flotilla.", tone: "positive" });
    });
  };

  return (
    <section className="hm-sec">
      <div className="hm-head">
        <h2>The flotilla.</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={pending || unassigned === 0}
          onClick={distribute}
        >
          Assign evenly
        </Button>
      </div>
      <div className="hm-fleet">
        {vessels.map((v) => (
          <div
            key={v.id}
            className={
              v.filled < v.capacity ? "hm-fleet__card hm-fleet__card--open" : "hm-fleet__card"
            }
          >
            <b>{v.name}</b>
            <span>
              {v.filled} / {v.capacity} ABOARD
            </span>
          </div>
        ))}
        <div className="hm-fleet__card">
          <b>On the dock</b>
          <span>{unassigned} UNASSIGNED</span>
        </div>
      </div>
      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </section>
  );
}

/* Box office — walk a member onto the manifest with guests, comped or not. */
export function AddToManifest({
  episodeId,
  voyageTitle,
  members,
}: {
  episodeId: string;
  voyageTitle: string;
  members: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [profileId, setProfileId] = React.useState("");
  const [comp, setComp] = React.useState(false);
  const [guests, setGuests] = React.useState(0);
  const [guestNames, setGuestNames] = React.useState<string[]>(["", ""]);

  const reset = () => {
    setProfileId("");
    setComp(false);
    setGuests(0);
    setGuestNames(["", ""]);
  };

  const submit = () => {
    startTransition(async () => {
      const res = await addToManifest(episodeId, profileId, comp, guestNames.slice(0, guests));
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        setOpen(false);
        reset();
        const name = members.find((m) => m.value === profileId)?.label ?? "Member";
        show({
          msg: `${name} on the manifest.`,
          meta: comp ? "COMP · COMPLIMENTARY" : voyageTitle.toUpperCase(),
          tone: "positive",
        });
      }
    });
  };

  return (
    <section className="hm-sec">
      <div className="hm-head">
        <h2>The roster.</h2>
        <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
          Add to manifest
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        width={460}
        eyebrow={voyageTitle}
        title="Add to the manifest."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Not yet
            </Button>
            <Button variant="gold" disabled={pending || !profileId} onClick={submit}>
              Put them aboard
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Select
            label="Member"
            placeholder="Pick a member"
            options={members}
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          />
          <Checkbox
            label="Complimentary — logged as comp"
            checked={comp}
            onChange={(e) => setComp(e.target.checked)}
          />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span className="hm-mono">GUESTS</span>
            <Stepper size="sm" min={0} max={2} value={guests} onChange={setGuests} />
          </span>
          {Array.from({ length: guests }, (_, i) => (
            <Input
              key={i}
              label={`Guest ${i + 1}`}
              placeholder="Full name"
              value={guestNames[i] ?? ""}
              onChange={(e) =>
                setGuestNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))
              }
            />
          ))}
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </section>
  );
}

export type RosterRow = {
  passId: string;
  name: string;
  tone: string;
  memberNo: string;
  guests: number;
  guestNames: string[];
  /* Named guests with their own filming consent. */
  guestParty: Array<{ name: string; onCamera: boolean }>;
  comp: boolean;
  boardingCode: string;
  status: "aboard" | "waitlist";
  checkedInAt: string | null;
  waiverMissing: boolean;
  offCamera: boolean;
  vesselId: string | null;
  [key: string]: unknown;
};

export function RosterTable({
  rows,
  muster,
  vessels,
}: {
  rows: RosterRow[];
  muster: string;
  vessels: FleetVessel[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [query, setQuery] = React.useState("");
  const [standing, setStanding] = React.useState<"all" | "aboard" | "waitlist" | "checked_in" | "waiver_missing">("all");

  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (standing === "aboard" && r.status !== "aboard") return false;
    if (standing === "waitlist" && r.status !== "waitlist") return false;
    if (standing === "checked_in" && !r.checkedInAt) return false;
    if (standing === "waiver_missing" && !r.waiverMissing) return false;
    if (q) {
      const hay = `${r.name} ${r.memberNo} ${r.boardingCode} ${r.guestNames.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const STANDING_LABEL: Record<typeof standing, string> = {
    all: "All",
    aboard: "Aboard",
    waitlist: "Waitlist",
    checked_in: "Checked in",
    waiver_missing: "Waiver missing",
  };

  const checkIn = (r: RosterRow) => {
    startTransition(async () => {
      const res = await checkInPass(r.passId);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else
        show({
          msg: `${r.name} aboard.`,
          meta: `${r.boardingCode || "NO CODE"} · MUSTER ${muster}`,
          tone: "positive",
        });
    });
  };

  const moveTo = (r: RosterRow, vesselId: string | null) => {
    startTransition(async () => {
      const res = await setPassVessel(r.passId, vesselId);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        const name = vessels.find((v) => v.id === vesselId)?.name;
        show({
          msg: name ? `${r.name} on ${name}.` : `${r.name} back on the dock.`,
          tone: "ink",
        });
      }
    });
  };

  const vesselOptions = [
    { value: "", label: "Unassigned" },
    ...vessels.map((v) => ({ value: v.id, label: v.name })),
  ];

  const columns: TableColumn<RosterRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (r: RosterRow) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <Avatar name={r.name} size="sm" tone={avatarTone(r.tone)} />
          <b style={{ fontWeight: 700 }}>{r.name}</b>
        </span>
      ),
    },
    { key: "memberNo", label: "No.", mono: true },
    {
      key: "guests",
      label: "Guests",
      width: 140,
      render: (r: RosterRow) => (
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="hm-mono" style={{ color: "var(--text-2)" }}>
            {r.guests}
          </span>
          {r.guestParty.length ? (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>
              {r.guestParty.map((g, i) => (
                <span key={g.name + i}>
                  {i > 0 ? ", " : ""}
                  {g.name}
                  {g.onCamera ? "" : " (off camera)"}
                </span>
              ))}
            </span>
          ) : r.guestNames.length ? (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{r.guestNames.join(", ")}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "boardingCode",
      label: "Boarding",
      mono: true,
      render: (r: RosterRow) => r.boardingCode || "—",
    },
    ...(vessels.length > 0
      ? ([
          {
            key: "vessel",
            label: "Yacht",
            width: 160,
            render: (r: RosterRow) =>
              r.status === "aboard" ? (
                <Select
                  options={vesselOptions}
                  value={r.vesselId ?? ""}
                  disabled={pending}
                  onChange={(e) => moveTo(r, e.target.value || null)}
                  aria-label={`Yacht for ${r.name}`}
                />
              ) : (
                <span className="hm-mono">—</span>
              ),
          },
        ] satisfies TableColumn<RosterRow>[])
      : []),
    {
      key: "status",
      label: "Status",
      render: (r: RosterRow) => (
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" as const }}>
          {r.checkedInAt ? (
            <Badge tone="positive">Checked in</Badge>
          ) : r.status === "waitlist" ? (
            <Badge tone="outline">Waitlist</Badge>
          ) : (
            <Badge tone="outline">Aboard</Badge>
          )}
          {r.comp ? (
            <Badge
              tone="outline"
              style={{ color: "var(--neon-violet)", borderColor: "var(--neon-violet)" }}
            >
              Comp
            </Badge>
          ) : null}
          {r.waiverMissing ? <Badge tone="caution">Waiver missing</Badge> : null}
          {r.offCamera ? <Badge tone="outline">Off camera</Badge> : null}
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
  ];

  return (
    <>
      <ListToolbar
        search={
          <Input
            label="Search the roster"
            placeholder="A name, a member number, a code, a guest"
            aria-label="Search the roster"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
        filterCount={standing === "all" ? 0 : 1}
        filters={
          <FilterPills
            label="Standing"
            value={standing}
            onChange={(next) => setStanding(next as typeof standing)}
            options={[
              { id: "aboard", label: "Aboard", count: rows.filter((r) => r.status === "aboard").length },
              { id: "waitlist", label: "Waitlist", count: rows.filter((r) => r.status === "waitlist").length },
              { id: "checked_in", label: "Checked in", count: rows.filter((r) => r.checkedInAt).length },
              { id: "waiver_missing", label: "Waiver missing", count: rows.filter((r) => r.waiverMissing).length },
            ]}
            allCount={rows.length}
          />
        }
        chips={standing === "all" ? [] : [{ key: "standing", label: "Standing", value: STANDING_LABEL[standing] }]}
        onDropChip={() => setStanding("all")}
        onClear={() => setStanding("all")}
        resultCount={shown.length}
        resultNoun="pass"
        resultNounPlural="passes"
        countSuffix={` of ${rows.length} on the manifest`}
      />
      {/* The table rendered its column headings over an empty body, with the
          explanation stranded underneath. Nothing to show means no table. */}
      {rows.length === 0 ? (
        <StateBlock
          status="empty"
          icon="Users"
          title="No passes claimed yet."
          detail="The roster fills as passes land — or walk a member on from the box office above."
        />
      ) : shown.length === 0 ? (
        <StateBlock status="empty" title="Nobody under that filter." detail="Widen the search, or clear the standing filter." />
      ) : (
        <div className="hm-panel">
          <Table rowKey={(r: RosterRow) => r.passId} columns={columns} rows={shown} />
        </div>
      )}
      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
