import { LEDGER_KIND } from "@/lib/brand";
import { Stat, Table, tableColumns } from "@/components/ds";
import { logDate, logDateYear, type Zone } from "@/lib/format";
import { SettleCardButton } from "../portal/settle-card";

/* — The account statement — one implementation, two pages.

   The Account room and the Portal each drew this table, each read the whole of
   account_ledger with no ceiling, and each wrote its own balance line: the
   Account's knew three states and the Portal's knew two, so a member in credit
   was told "SETTLED" on one screen and the truth on the other. A statement is
   one document; it is written once here and read from both.

   Three things the old table did not do, and a statement must:
   · it stops. Sixty rows in, a member reading for what they owe is reading a
     database dump. Twenty-four stand in the open and the rest sit behind a
     disclosure.
   · it carries a running balance. Every line said what moved and none said
     where that left you, which is the only figure the page exists to answer.
     Rows arrive newest-first, so the balance beside a row is today's balance
     less everything written after it — no column, no query, no schema change.
   · it groups by month, with the month's net on the eyebrow. A year of house
     charges is a year, not a list. */

export type StatementRow = {
  id: string;
  created_at: string;
  kind: string;
  memo: string | null;
  delta_cents: number;
  /* The part of delta_cents that is tax. Absent on rows read before the
     column existed; zero means untaxed. */
  tax_cents?: number;
};

/* What the query asks for, and what the page shows without being asked. */
export const STATEMENT_MAX = 120;
export const STATEMENT_SHOWN = 24;

export function money(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/* Three states, not two. A member $776 in credit owes nothing — which is not
   the same fact as having nothing of theirs on the books. */
export function balanceState(cents: number): string {
  return cents < 0 ? "DUE" : cents > 0 ? "IN CREDIT" : "SETTLED";
}

/* "MAR 04 · 2026" → "MAR 2026". The month label is read out of the zone-correct
   formatter's own output rather than computed again here: format.ts is the only
   thing in the app allowed to say what day it is, and a second clock in this
   file is exactly how a row lands under the wrong month. */
function monthOf(iso: string, zone: Zone): string {
  const [head, year] = logDateYear(iso, zone).split(" · ");
  return [head.split(" ")[0], year].filter(Boolean).join(" ");
}

type Line = { row: StatementRow; balance: number };
type Month = { key: string; net: number; lines: Line[] };

function byMonth(lines: Line[], zone: Zone): Month[] {
  const out: Month[] = [];
  for (const line of lines) {
    const key = monthOf(line.row.created_at, zone);
    const last = out[out.length - 1];
    if (last && last.key === key) {
      last.lines.push(line);
      last.net += line.row.delta_cents;
    } else {
      out.push({ key, net: line.row.delta_cents, lines: [line] });
    }
  }
  return out;
}

/* A movement carries its direction; a standing figure carries only a minus when
   the money is owed. */
function signed(cents: number): string {
  return `${cents < 0 ? "−" : "+"}${money(cents)}`;
}

/* Rows arrive newest-first, so the balance beside a row is today's balance less
   everything written after it. Built in one pass by a plain function rather
   than by carrying a variable across the component's own map — the React
   Compiler refuses the latter, and confining the accumulator to a helper says
   the arithmetic more plainly anyway. */
function withBalances(rows: StatementRow[], balanceCents: number): Line[] {
  const lines: Line[] = [];
  let carried = balanceCents;
  for (const row of rows) {
    lines.push({ row, balance: carried });
    carried -= row.delta_cents;
  }
  return lines;
}

/* The kit's Table, grouped: one <tbody> per month under a rowgroup header,
   and the month's net drawn as that group's summary row — the shape the kit
   built `groups` for. */
function StatementTable({ lines, zone }: { lines: Line[]; zone: Zone }) {
  const columns = tableColumns<Line>([
    { key: "date", label: "Date", width: 90, mono: true, render: (l) => logDate(l.row.created_at, zone) },
    {
      key: "entry",
      label: "Entry",
      render: (l) => (
        <>
          {l.row.memo ?? (LEDGER_KIND[l.row.kind] ?? l.row.kind).toUpperCase()}
          {/* Tax is inside the amount, not beside it, so the line says so.
              Charged only where a city has recorded a rate and the club
              is registered to collect — see /bridge/tax. */}
          {typeof l.row.tax_cents === "number" && l.row.tax_cents > 0 ? (
            <span className="mbr-mono stm-memo">
              INCL. ${(l.row.tax_cents / 100).toFixed(2)} TAX
            </span>
          ) : null}
        </>
      ),
    },
    { key: "kind", label: "Kind", width: 90, mono: true, render: (l) => (LEDGER_KIND[l.row.kind] ?? l.row.kind).toUpperCase() },
    {
      key: "amount",
      label: "Amount",
      numeric: true,
      render: (l) => <span className={l.row.delta_cents < 0 ? "stm-neg" : "stm-pos"}>{signed(l.row.delta_cents)}</span>,
    },
    { key: "balance", label: "Balance", numeric: true, render: (l) => signed(l.balance) },
  ]);
  return (
    <Table<Line>
      columns={columns}
      rowKey={(l) => l.row.id}
      groups={byMonth(lines, zone).map((m) => ({
        key: m.key,
        label: m.key,
        rows: m.lines,
        summary: { amount: signed(m.net) },
      }))}
    />
  );
}

export function AccountStatement({
  rows,
  balanceCents,
  zone,
  processorLive,
}: {
  rows: StatementRow[];
  balanceCents: number;
  zone: Zone;
  processorLive: boolean;
}) {
  const lines = withBalances(rows, balanceCents);
  const shown = lines.slice(0, STATEMENT_SHOWN);
  const rest = lines.slice(STATEMENT_SHOWN);

  return (
    <div className="ptl-panel acc-panel--stm">
      {/* The balance led the page instead of trailing it in 10px mono: it is
          the largest figure on the screen because it is the one the member came
          for. */}
      <Stat label="Balance" value={money(balanceCents)} sub={balanceState(balanceCents)} />
      <div className="mbr-sub--lg">
        <StatementTable lines={shown} zone={zone} />
      </div>
      {rest.length > 0 ? (
        <details className="stm-more">
          <summary>See the full statement</summary>
          <StatementTable lines={rest} zone={zone} />
        </details>
      ) : null}
      {balanceCents < 0 && processorLive ? (
        <div className="mbr-sub--sm">
          <SettleCardButton amountLabel={money(balanceCents)} />
        </div>
      ) : balanceCents < 0 ? (
        <p className="ls-note mbr-sub--sm">
          Settled at the gangway or by invoice — Shoreside posts payments.
        </p>
      ) : null}
    </div>
  );
}
