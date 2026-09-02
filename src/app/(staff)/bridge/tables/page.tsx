import type { Metadata } from "next";
import { StateBlock } from "@/components/ds";
import { logDate, logTime } from "@/lib/format";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { TablesClient, type TableRow } from "./tables-client";

export const metadata: Metadata = { title: "Tables" };

/* [un] Scripted, from the Bridge side. The member page reads the next two
   shore nights and the tables laid on them; this is where the tables get laid. */

export default async function TablesPage({
  searchParams,
}: {
  searchParams: Promise<{ voyage?: string }>;
}) {
  const { supabase } = await getOperator();
  const sp = await searchParams;

  /* Tonight stays on the board for 24 hours after it starts; the rest line
     up after it. Shore nights only — a table is laid in a room. */
  const cutoff = new Date(new Date().getTime() - 24 * 3600 * 1000).toISOString();
  const nightsRes = await supabase
    .from("voyages")
    .select("id, title, starts_at, time_zone, status, class")
    .eq("class", "shore")
    .in("status", ["scheduled", "live"])
    .gte("starts_at", cutoff)
    .order("starts_at", { ascending: true });
  const nights = must(nightsRes);

  if (nights.length === 0) {
    return (
      <div>
        <span className="hm-eyebrow">Tables</span>
        <h1 className="hm-h1">Tables for the night.</h1>
        <div className="hm-sec">
          <StateBlock
            title="No shore night on the board."
            detail="Tables are laid ashore. Raise a night ashore on the Voyages tab, then come back to lay the room."
          />
        </div>
      </div>
    );
  }

  const night = nights.find((n) => n.id === sp.voyage) ?? nights[0];

  const tablesRes = await supabase
    .from("dating_tables")
    .select("*")
    .eq("voyage_id", night.id)
    .order("number", { ascending: true });
  const tables = must(tablesRes);

  const tableIds = tables.map((t) => t.id);
  const seatsRes = tableIds.length
    ? await supabase.from("table_seats").select("table_id, state, held_until").in("table_id", tableIds)
    : { data: [] };
  const seats = must(seatsRes);

  /* Server-rendered per request, so "now" is request time — the same rule
     the member page and claim_table_seat apply. */
  const now = new Date().getTime();
  const rows: TableRow[] = tables.map((t) => {
    const mine = seats.filter((s) => s.table_id === t.id);
    const confirmed = mine.filter((s) => s.state === "confirmed").length;
    const held = mine.filter(
      (s) => s.state === "held" && new Date(s.held_until).getTime() >= now
    ).length;
    return {
      id: t.id,
      number: t.number,
      seats: t.seats,
      taken: confirmed + held,
      confirmed,
      held,
    };
  });

  const laid = rows.reduce((n, r) => n + r.seats, 0);
  const filled = rows.reduce((n, r) => n + r.taken, 0);

  return (
    <div>
      <span className="hm-eyebrow">Tables</span>
      <h1 className="hm-h1">Tables for the night.</h1>
      <p className="hm-lede">
        Blind tables for six, laid on a shore night. A member takes a seat and
        confirms it at the door; matches come from tables, not swiping. Lay the
        room here — number and chairs — and strike a table only while nobody
        has confirmed a seat at it.
      </p>
      <p
        className="ls-mono-data"
        style={{ marginTop: 16, color: "var(--text-2)", textTransform: "uppercase" }}
      >
        {night.title.replace(/\.+$/, "")} · {logDate(night.starts_at, night.time_zone)} ·{" "}
        {logTime(night.starts_at, night.time_zone)} · {rows.length}{" "}
        {rows.length === 1 ? "table" : "tables"} · {filled}/{laid} seats taken
      </p>
      <TablesClient
        voyageId={night.id}
        options={nights.map((n) => ({
          value: n.id,
          label: `${logDate(n.starts_at, n.time_zone)} · ${logTime(n.starts_at, n.time_zone)} — ${n.title}`,
        }))}
        rows={rows}
      />
    </div>
  );
}
