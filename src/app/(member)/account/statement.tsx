import { LEDGER_KIND } from "@/lib/brand";
import { Stat } from "@/components/ds";
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

function StatementTable({ lines, zone }: { lines: Line[]; zone: Zone }) {
  return (
    <div className="ls-table-wrap">
      <table className="ls-table" style={{ minWidth: 640 }}>
        <thead>
          <tr>
            <th scope="col" style={{ width: 90 }}>
              Date
            </th>
            <th scope="col">Entry</th>
            <th scope="col" style={{ width: 90 }}>
              Kind
            </th>
            <th scope="col" className="num--end">
              Amount
            </th>
            <th scope="col" className="num--end">
              Balance
            </th>
          </tr>
        </thead>
        {byMonth(lines, zone).map((m) => (
          <tbody key={m.key}>
            <tr className="stm-month">
              <th scope="rowgroup" colSpan={3}>
                {m.key}
              </th>
              <td className="num num--end">{signed(m.net)}</td>
              <td></td>
            </tr>
            {m.lines.map(({ row, balance }) => (
              <tr key={row.id}>
                <td className="num">{logDate(row.created_at, zone)}</td>
                <td>
                  {row.memo ?? (LEDGER_KIND[row.kind] ?? row.kind).toUpperCase()}
                  {/* Tax is inside the amount, not beside it, so the line says so.
                      Charged only where a city has recorded a rate and the club
                      is registered to collect — see /bridge/tax. */}
                  {typeof row.tax_cents === "number" && row.tax_cents > 0 ? (
                    <span className="mbr-mono" style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--text-3)" }}>
                      INCL. ${(row.tax_cents / 100).toFixed(2)} TAX
                    </span>
                  ) : null}
                </td>
                <td className="num">{(LEDGER_KIND[row.kind] ?? row.kind).toUpperCase()}</td>
                <td className="num num--end">
                  <span style={{ color: row.delta_cents < 0 ? "var(--siren)" : "var(--laurel)" }}>
                    {signed(row.delta_cents)}
                  </span>
                </td>
                <td className="num num--end">{signed(balance)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
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
    <div className="ptl-panel" style={{ padding: "20px 20px 16px" }}>
      {/* The balance led the page instead of trailing it in 10px mono: it is
          the largest figure on the screen because it is the one the member came
          for. */}
      <Stat label="Balance" value={money(balanceCents)} sub={balanceState(balanceCents)} />
      <div style={{ marginTop: 18 }}>
        <StatementTable lines={shown} zone={zone} />
      </div>
      {rest.length > 0 ? (
        <details className="stm-more">
          <summary>See the full statement</summary>
          <StatementTable lines={rest} zone={zone} />
        </details>
      ) : null}
      {balanceCents < 0 && processorLive ? (
        <div style={{ marginTop: 12 }}>
          <SettleCardButton amountLabel={money(balanceCents)} />
        </div>
      ) : balanceCents < 0 ? (
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", marginTop: 12 }}>
          Settled at the gangway or by invoice — Shoreside posts payments.
        </p>
      ) : null}
    </div>
  );
}
