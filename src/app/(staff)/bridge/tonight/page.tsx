import type { Metadata } from "next";
import { StateBlock } from "@/components/ds";
import { logDate, logTime } from "@/lib/format";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { memberMark } from "@/lib/membership";
import { TablesClient, type Seated, type TableRow } from "./tonight-client";

export const metadata: Metadata = { title: "Tonight" };

/* [un] Scripted, from the Bridge side. The member page reads the next two
   shore nights and the tables laid on them; this is where the tables get laid.

   The route moved from /bridge/tables on 2026-09-02 under the owner rule that
   Tables is never a route and that a route, its nav label, its title and its
   h1 all say the same word. It answers to Tonight now, matching the member
   surface it operates. A table is still a table — that noun means the blind
   dinner for six and nothing else, which is the one thing it always meant. */

export default async function TablesPage({
  searchParams,
}: {
  searchParams: Promise<{ episode?: string }>;
}) {
  const { supabase } = await getOperator();
  const sp = await searchParams;

  /* Tonight stays on the board for 24 hours after it starts; the rest line
     up after it. Shore nights only — a table is laid in a room. */
  const cutoff = new Date(new Date().getTime() - 24 * 3600 * 1000).toISOString();
  const nightsRes = await supabase
    .from("episodes")
    .select("id, title, starts_at, time_zone, status, setting")
    .eq("setting", "shore")
    .in("status", ["scheduled", "live"])
    .gte("starts_at", cutoff)
    .order("starts_at", { ascending: true });
  const nights = must(nightsRes);

  if (nights.length === 0) {
    return (
      <div>
        <span className="hm-eyebrow">Tonight</span>
        <h1 className="hm-h1">Tonight.</h1>
        <div className="hm-sec">
          <StateBlock
            title="No shore night on the board."
            detail="Tables are laid ashore. Raise a night ashore on the Episodes tab, then come back to lay the room."
          />
        </div>
      </div>
    );
  }

  const night = nights.find((n) => n.id === sp.episode) ?? nights[0];

  const tablesRes = await supabase
    .from("tables")
    .select("*")
    .eq("episode_id", night.id)
    .order("number", { ascending: true });
  const tables = must(tablesRes);

  const tableIds = tables.map((t) => t.id);
  const seatsRes = tableIds.length
    ? await supabase.from("table_seats").select("table_id, profile_id, state, held_until").in("table_id", tableIds)
    : { data: [] };
  const seats = must(seatsRes);

  /* The "sit near again" hints. After a Table night a member may mark, of the
     people at their table, anyone they would sit near again — a hint to the
     Bridge for the next seating, not a match, and never shown to members. Read
     here as a count per seated member of the picks that name THEM, from prior
     nights' tables; the picker is not read, so the hint carries a number and
     no names. Empty when the Bridge has no read on table_picks. */
  const seatedIds = [...new Set(seats.map((s) => s.profile_id))];
  const [picksRes, namesRes] = await Promise.all([
    seatedIds.length
      ? supabase.from("table_picks").select("table_id, picked").eq("again", true).in("picked", seatedIds)
      : Promise.resolve({ data: [] as Array<{ table_id: string; picked: string }>, error: null }),
    seatedIds.length
      ? supabase.from("profiles").select("id, full_name, member_no").in("id", seatedIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; member_no: string | null }>, error: null }),
  ]);
  const againFor = new Map<string, number>();
  for (const p of must(picksRes)) {
    /* Picks made at a table on THIS night are not prior — they are tonight. */
    if (tableIds.includes(p.table_id)) continue;
    againFor.set(p.picked, (againFor.get(p.picked) ?? 0) + 1);
  }
  const names = new Map(must(namesRes).map((p) => [p.id, p]));

  /* Server-rendered per request, so "now" is request time — the same rule
     the member page and claim_table_seat apply. */
  const now = new Date().getTime();
  const rows: TableRow[] = tables.map((t) => {
    const mine = seats.filter((s) => s.table_id === t.id);
    const confirmed = mine.filter((s) => s.state === "confirmed").length;
    const held = mine.filter(
      (s) => s.state === "held" && new Date(s.held_until).getTime() >= now
    ).length;
    const seated: Seated[] = mine
      .filter((s) => s.state === "confirmed" || new Date(s.held_until).getTime() >= now)
      .map((s) => ({
        id: s.profile_id,
        name: names.get(s.profile_id)?.full_name ?? "A member",
        memberNo: memberMark(names.get(s.profile_id)?.member_no ?? null) || "—",
        again: againFor.get(s.profile_id) ?? 0,
      }));
    return {
      id: t.id,
      number: t.number,
      seats: t.seats,
      taken: confirmed + held,
      confirmed,
      held,
      seated,
    };
  });

  const laid = rows.reduce((n, r) => n + r.seats, 0);
  const filled = rows.reduce((n, r) => n + r.taken, 0);

  return (
    <div>
      <span className="hm-eyebrow">Tonight</span>
      <h1 className="hm-h1">Tonight.</h1>
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
        episodeId={night.id}
        options={nights.map((n) => ({
          value: n.id,
          label: `${logDate(n.starts_at, n.time_zone)} · ${logTime(n.starts_at, n.time_zone)} — ${n.title}`,
        }))}
        rows={rows}
      />
    </div>
  );
}
