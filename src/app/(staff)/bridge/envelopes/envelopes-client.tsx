"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Badge, Button, ListToolbar, Select, Stat, StateBlock, Table, Toast } from "@/components/ds";
import { issueTheEnvelopes } from "../../../(member)/show/actions";
import { useToast } from "../../ui";

/* The sealed envelope, made printable.

   issue_the_envelopes mints one token per aboard pass and returns a COUNT. The
   table is staff-only at the policy and nothing read it, so the crew could
   press the button, be told "40", and have no way to get the forty tokens they
   are supposed to print on forty gold-foil cards. The member's side of this
   asks them to type a token off a physical envelope — an object the product
   could not produce.

   The token is NOT a bearer secret, and this comment used to say it was.
   open_the_captains_log refuses when env.profile_id <> auth.uid() — "that
   envelope belongs to another guest" — so a token in the wrong hands opens
   nothing. The posture is stronger than the copy claimed, which is its own
   kind of defect: anyone reasoning about the blast radius of a dropped
   envelope was reasoning from a false premise. It is a claim ticket for one
   named member, and it appears on this screen and on the paper, nowhere
   else. */

export type EnvelopeRow = {
  passId: string;
  name: string;
  memberNo: string;
  boardingCode: string;
  token: string;
  opened: string | null;
  [key: string]: unknown;
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
      onChange={(e) => router.replace(`/bridge/envelopes?episode=${e.target.value}`)}
      style={{ maxWidth: 420 }}
    />
  );
}

export function EnvelopesClient({
  episodeId,
  voyageTitle,
  departs,
  aboard,
  radarOpen,
  rows,
}: {
  episodeId: string;
  voyageTitle: string;
  departs: string;
  aboard: number;
  /** Whether this episode carries a radar clock. Without one the tokens are
      inert: open_the_captains_log refuses with "radar does not run on this
      sailing" whatever is printed on the card. */
  radarOpen: boolean;
  rows: EnvelopeRow[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const opened = rows.filter((r) => r.opened).length;
  const outstanding = Math.max(aboard - rows.length, 0);

  const issue = () =>
    startTransition(async () => {
      const res = await issueTheEnvelopes(episodeId);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else
        show({
          /* Both halves now come from res.minted — what the database actually
             wrote. This read `outstanding`, computed from props captured before
             the click, so a second operator pressing the button was told "3
             envelopes minted" when nothing had been. Same shape as the "$150
             credit applied" defect: a number asserted rather than read. */
          msg:
            res.minted === 0
              ? "Every aboard pass already had one. Nothing was minted."
              : `${res.minted ?? 0} envelope${res.minted === 1 ? "" : "s"} minted. They are on the sheet below.`,
          meta: voyageTitle.replace(/\.+$/, "").toUpperCase(),
        });
    });

  const columns = [
    {
      key: "name",
      label: "Guest",
      render: (r: EnvelopeRow) => (
        <span>
          <b style={{ fontWeight: 700 }}>{r.name}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>{r.memberNo}</span>
        </span>
      ),
    },
    { key: "boardingCode", label: "Pass", width: 110, mono: true },
    {
      key: "token",
      label: "Token",
      render: (r: EnvelopeRow) => <span className="hm-secret">{r.token}</span>,
    },
    {
      key: "opened",
      label: "Opened",
      width: 130,
      render: (r: EnvelopeRow) =>
        r.opened ? <Badge tone="positive">{r.opened}</Badge> : <span className="hm-mono">SEALED</span>,
    },
  ];

  return (
    <>
      <div className="hm-row">
        <Stat size="sm" label="Aboard" value={aboard} sub={departs.toUpperCase()} />
        <Stat
          size="sm"
          label="Issued"
          value={`${rows.length} / ${aboard}`}
          sub={outstanding ? `${outstanding} STILL TO MINT` : "EVERY PASS HAS ONE"}
        />
        <Stat size="sm" label="Opened" value={opened} sub="AT 19:00, BY THE GUEST" />
      </div>

      {!radarOpen ? (
        <p className="hm-note" role="status" style={{ color: "var(--caution)" }}>
          Radar has never been opened on this episode, so a printed token opens
          nothing — the log refuses with &ldquo;radar does not run on this
          sailing&rdquo;. Set the clock on the Radar tab before these go on
          paper.
        </p>
      ) : null}

      <section className="hm-sec">
        <div className="hm-head">
          <h2>The sheet.</h2>
          <span className="hm-acts">
            <Button variant="gold" size="sm" disabled={pending || aboard === 0} onClick={issue}>
              {rows.length === 0 ? "Issue the envelopes" : "Issue any missing"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length === 0}
              onClick={() => window.print()}
            >
              Print the envelope sheet
            </Button>
          </span>
        </div>
        <p className="hm-note">
          One token per aboard pass, minted once and never re-minted — issuing
          again mints only what is missing. A token opens the log of the member
          it was minted for and nobody else&apos;s, so a card handed to the
          wrong guest opens nothing.
        </p>

        {rows.length === 0 ? (
          <StateBlock
            status="empty"
            icon="Mail"
            title={aboard === 0 ? "Nobody aboard." : "Nothing minted yet."}
            detail={
              aboard === 0
                ? "Envelopes are minted against aboard passes. When the manifest fills, the sheet fills with it."
                : "Issue them and the tokens appear here, ready to print onto the cards."
            }
          />
        ) : (
          <>
            <ListToolbar resultCount={rows.length} resultNoun="envelope" countSuffix={` · ${opened} opened`} />
            <Table columns={columns} rows={rows} rowKey={(r) => r.passId} />
          </>
        )}
      </section>

      {mounted && rows.length
        ? createPortal(
            <div className="hm-envelopes" aria-hidden="true">
              <h1>Captain&apos;s Log envelopes — {voyageTitle.replace(/\.+$/, "")}</h1>
              <p>
                {departs} · {rows.length} envelopes · one card per guest · the log opens at 19:00
              </p>
              <div className="hm-envelopes__grid">
                {rows.map((r) => (
                  <div className="hm-envelopes__card" key={r.passId}>
                    <b>{r.name}</b>
                    <span>{r.memberNo}{r.boardingCode ? ` · ${r.boardingCode}` : ""}</span>
                    <code>{r.token}</code>
                    <em>Open your log at 19:00. Twenty-four hours, then the contacts are gone on both sides.</em>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}

      {toast ? <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} /> : null}
    </>
  );
}
