import type { Metadata } from "next";
import Link from "next/link";
import { Badge, StateBlock, Table, tableColumns } from "@/components/ds";
import { logDate, logDateTime } from "@/lib/format";
import { SUBPROCESSORS } from "@/lib/subprocessors";
import { getMember } from "../../data";
import { ExportDataButton } from "../../account/export-data";
import { AskAboutMyData } from "./data-client";
import "./data.css";

export const metadata: Metadata = { title: "Your data" };

/* The one surface that answers "what do you have on me, and what can I do
   about it".

   Before this page the privacy notice was linked only from the marketing
   footer, so a signed-in member could not reach it from anywhere at all; the
   retention periods were enforced by six scheduled jobs and disclosed to
   nobody; the subprocessor list did not exist; and there was no way to ask for
   anything — the legal page promised an answer "within a week" and no request
   could be made, recorded or timed.

   Everything here reads from the same place the club runs on. The retention
   figures come from the dials the jobs themselves read, so a published period
   cannot drift from an enforced one; the history is the audit trail; the
   consents are the ledger. Nothing on this page is a copy of a fact kept
   somewhere else. */

const KIND_WORD: Record<string, string> = {
  access: "Tell me what you hold",
  portability: "Give me my data to take elsewhere",
  rectification: "Something is wrong",
  erasure: "Delete something",
  restriction: "Stop using it for now",
  objection: "Stop working things out about me",
};

const CONSENT_WORD: Record<string, string> = {
  filming: "Appearing on camera",
  manifest: "Your name on the manifest",
  marketing_email: "Letters the club chooses to send",
  marketing_sms: "Texts the club chooses to send",
  transactional_sms: "Texts about nights you hold",
};

const RETENTION_COLUMNS = tableColumns<{ dial: string; what: string; howLong: string; why: string }>([
  { key: "what", label: "What" },
  { key: "howLong", label: "How long", numeric: true },
  { key: "why", label: "Notes" },
]);

const SUBPROCESSOR_COLUMNS = tableColumns<{ name: string; does: string; where: string }>([
  { key: "name", label: "Who" },
  { key: "does", label: "What they do" },
  { key: "where", label: "Where" },
]);

const CONSENT_COLUMNS = tableColumns<{ what: string; granted: boolean; since: string }>([
  { key: "what", label: "What" },
  {
    key: "granted",
    label: "Standing",
    /* A badge as well as a word, because "On" and "Off" three characters apart
       in a column is exactly the case the no-colour-alone rule is about — the
       badge carries the word too. */
    render: (r) => <Badge tone={r.granted ? "positive" : "outline"}>{r.granted ? "On" : "Off"}</Badge>,
  },
  { key: "since", label: "Since", align: "start" },
]);

const HISTORY_COLUMNS = tableColumns<{ id: string; when: string; what: string; who: string }>([
  { key: "when", label: "When", align: "start" },
  { key: "what", label: "What" },
  { key: "who", label: "Who" },
]);

const REQUEST_COLUMNS = tableColumns<{
  id: number; asked: string; what: string; state: string; outcome: string | null; due: string;
}>([
  { key: "asked", label: "Asked", align: "start" },
  { key: "what", label: "What" },
  {
    key: "state",
    label: "Standing",
    render: (r) => (
      <>
        <Badge tone={r.state === "done" ? "positive" : r.state === "refused" ? "outline" : "caution"}>
          {r.state === "open"
            ? "Open"
            : r.state === "acknowledged"
              ? "Being looked at"
              : r.state === "done"
                ? "Answered"
                : r.state === "refused"
                  ? "Refused"
                  : "Withdrawn"}
        </Badge>
        {r.outcome ? <p className="dsr-outcome">{r.outcome}</p> : null}
      </>
    ),
  },
  { key: "due", label: "Answer owed by", align: "start" },
]);

export default async function YourDataPage() {
  const { supabase, profile, zone } = await getMember();

  const [{ data: schedule }, { data: dials }, { data: history }, { data: consents }, { data: requests }] =
    await Promise.all([
      supabase.from("retention_schedule").select("*"),
      supabase.from("club_settings").select("key, value_int"),
      supabase.from("my_account_history").select("*").order("at", { ascending: false }).limit(50),
      supabase.from("current_consent").select("*"),
      supabase.from("data_requests").select("*").order("asked_at", { ascending: false }).limit(20),
    ]);

  const dial = new Map((dials ?? []).map((d) => [d.key, d.value_int]));
  const openKinds = (requests ?? []).filter((r) => r.state === "open" || r.state === "acknowledged").map((r) => r.kind);

  return (
    <>
      <section className="you-sec you-sec--head">
        <h1 className="you-h1">Your data</h1>
        <p className="you-lede">
          What the club holds about you, how long it keeps it, who else touches it,
          and what you can ask it to do. The{" "}
          <Link href="/legal#privacy">privacy notice</Link> is the longer version.
        </p>
      </section>

      <section className="you-sec">
        <div className="you-h">Take a copy</div>
        <div className="you-row">
          <div>
            <b>Everything, as a file</b>
            <p>
              Machine-readable, straight away. It holds what you gave the club and
              what the club worked out about you. It deliberately leaves out live
              keys to your own account, and other members&rsquo; words — the file says
              so itself.
            </p>
          </div>
          <ExportDataButton memberNo={profile?.member_no ?? null} />
        </div>
      </section>

      <section className="you-sec">
        <div className="you-h">How long the club keeps things</div>
        <p className="you-note">
          These are the periods the club&rsquo;s own scheduled jobs enforce, read from
          the same settings those jobs read. If one is changed, this page changes
          with it.
        </p>
        <Table
          rowHeader="what"
          rowKey={(r) => String(r.dial)}
          columns={RETENTION_COLUMNS}
          rows={(schedule ?? []).map((r) => ({
            dial: r.dial ?? "",
            what: r.what ?? "",
            howLong:
              dial.get(r.dial ?? "") == null
                ? "—"
                : `${dial.get(r.dial ?? "")} ${(r.dial ?? "").endsWith("_years") ? "years" : "days"}`,
            why: r.why ?? "",
          }))}
        />
        <p className="you-note">
          Everything else is kept while you are a member. Thirty days after you
          depart, your name, address and telephone number are erased from your
          profile and from the sign-in behind it. The signed declarations and the
          figures on the ledger stay, without you attached to them, because
          accounting and limitation law require them.
        </p>
      </section>

      <section className="you-sec">
        <div className="you-h">Who else touches it</div>
        <p className="you-note">
          Every third party that processes anything about you, and what each one
          gets. The agreements with them are held by Shoreside.
        </p>
        <Table
          rowHeader="name"
          rowKey={(r) => String(r.name)}
          columns={SUBPROCESSOR_COLUMNS}
          rows={SUBPROCESSORS.map((x) => ({ name: x.name, does: x.does, where: x.where }))}
        />
      </section>

      <section className="you-sec">
        <div className="you-h">What you have agreed to</div>
        {consents && consents.length ? (
          <Table
            rowHeader="what"
            rowKey={(r) => String(r.what)}
            columns={CONSENT_COLUMNS}
            rows={consents.map((c) => ({
              what: CONSENT_WORD[c.subject ?? ""] ?? c.subject ?? "",
              granted: !!c.granted,
              since: c.at ? logDate(c.at, zone) : "—",
            }))}
          />
        ) : (
          <StateBlock
            title="Nothing recorded yet"
            detail="The club started keeping a record of what you agree to on 6 September 2026. Change any switch on your settings and it will show here."
          />
        )}
      </section>

      <section className="you-sec">
        <div className="you-h">What has happened to your account</div>
        {history && history.length ? (
          <Table
            rowKey={(r) => String(r.id)}
            columns={HISTORY_COLUMNS}
            rows={history.map((h, i) => ({
              id: `${h.at}-${i}`,
              when: h.at ? logDateTime(h.at, zone) : "—",
              what:
                h.what === "consent"
                  ? `${h.action === "GRANTED" ? "Agreed to" : "Withdrew"} ${CONSENT_WORD[h.fields?.[0] ?? ""] ?? h.fields?.[0] ?? ""}`
                  : `Changed: ${(h.fields ?? []).join(", ")}`,
              who: h.by_the_club ? "The club" : "You",
            }))}
          />
        ) : (
          <StateBlock
            title="Nothing to show yet"
            detail="Changes to your account have been recorded since 6 September 2026. Anything before that was not kept."
          />
        )}
      </section>

      <section className="you-sec">
        <div className="you-h">Ask the club something</div>
        {requests && requests.length ? (
          <Table
            rowHeader="what"
            rowKey={(r) => String(r.id)}
            columns={REQUEST_COLUMNS}
            rows={requests.map((r) => ({
              id: r.id,
              asked: logDate(r.asked_at, zone),
              what: KIND_WORD[r.kind] ?? r.kind,
              state: r.state,
              outcome: r.outcome,
              due: logDate(r.due_at, zone),
            }))}
          />
        ) : null}
        <AskAboutMyData openKinds={openKinds} />
      </section>
    </>
  );
}
