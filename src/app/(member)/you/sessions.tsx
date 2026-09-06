"use client";

import React from "react";
import { Badge, Button, Notice, Table, tableColumns } from "@/components/ds";
import { revokeSession } from "./actions";

/* — Where you are signed in, and how to shut one. —

     The club had one control here and it was all-or-nothing: "Sign out", which
     revokes globally. A member who signed in on a borrowed laptop, or whose
     phone was taken, had no way to close that one door without closing every
     door they had.

     The list is the auth provider's own record, not a copy of it, so it cannot
     drift and cannot miss a sign-in path nobody remembered to instrument. */

export type SessionRow = {
  id: string;
  started_at: string;
  last_seen_at: string;
  user_agent: string | null;
  from_address: string | null;
  second_step: boolean;
  is_this_one: boolean;
};

/* A user-agent string is not a sentence and nobody should be asked to read
   one. This turns it into the two facts a person actually checks against
   their own memory: what kind of thing it was, and roughly what it runs. */
function describe(agent: string | null): string {
  if (!agent) return "A device that did not say what it was";
  const os =
    /iPhone|iPad|iOS/i.test(agent) ? "iPhone or iPad"
    : /Android/i.test(agent) ? "Android"
    : /Mac OS X|Macintosh/i.test(agent) ? "Mac"
    : /Windows/i.test(agent) ? "Windows"
    : /Linux/i.test(agent) ? "Linux"
    : null;
  const browser =
    /Edg\//i.test(agent) ? "Edge"
    : /OPR\/|Opera/i.test(agent) ? "Opera"
    : /Firefox\//i.test(agent) ? "Firefox"
    : /Chrome\//i.test(agent) ? "Chrome"
    : /Safari\//i.test(agent) ? "Safari"
    : null;
  if (os && browser) return `${browser} on ${os}`;
  if (os) return os;
  if (browser) return browser;
  /* Something the club has no name for — a script, a crawler, an app. Shown
     as itself rather than guessed at, and truncated so a hostile agent string
     cannot take over the row. */
  return agent.slice(0, 60);
}

const COLUMNS = tableColumns<{
  id: string; device: string; where: string; last: string; standing: React.ReactNode; act: React.ReactNode;
}>([
  { key: "device", label: "Device" },
  { key: "where", label: "From", align: "start" },
  { key: "last", label: "Last used", align: "start" },
  { key: "standing", label: "" },
  { key: "act", label: "" },
]);

export function Sessions({ rows, zone }: { rows: SessionRow[]; zone: string | null }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [gone, setGone] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);

  const shut = (id: string) => {
    setError(null);
    setBusy(id);
    startTransition(async () => {
      const res = await revokeSession(id);
      setBusy(null);
      if (res.error) setError(res.error);
      else setGone((g) => [...g, id]);
    });
  };

  const live = rows.filter((r) => !gone.includes(r.id));
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      ...(zone ? { timeZone: zone } : {}),
    });

  return (
    <div>
      <Table
        rowKey={(r) => String(r.id)}
        columns={COLUMNS}
        rows={live.map((r) => ({
          id: r.id,
          device: describe(r.user_agent),
          where: r.from_address ?? "—",
          last: when(r.last_seen_at),
          standing: (
            <span className="you-pair">
              {r.is_this_one ? <Badge tone="positive">This one</Badge> : null}
              {r.second_step ? <Badge tone="outline">Two-step</Badge> : null}
            </span>
          ),
          act: r.is_this_one ? (
            /* Shutting the session you are reading on is just signing out, and
               there is already a button for that which says so. Offering a
               second one here that logs you out mid-sentence is a trap. */
            <span className="you-note">Use Sign out below</span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              pending={pending && busy === r.id}
              pendingLabel="Shutting…"
              onClick={() => shut(r.id)}
            >
              Shut this one
            </Button>
          ),
        }))}
      />
      {error ? (
        <Notice tone="danger" compact>
          {error}
        </Notice>
      ) : gone.length ? (
        <span role="status" className="mbr-status mbr-status--inline">
          Shut. That device has to sign in again — it may take up to an hour to
          notice, which is how long its current pass lasts.
        </span>
      ) : null}
    </div>
  );
}
