import type { Metadata } from "next";
import { Badge } from "@/components/ds";
import { logDate, logTime } from "@/lib/format";
import { getMember } from "../data";
import { TableCard, type TableView } from "./table-card";

export const metadata: Metadata = { title: "Tonight" };

/* Syrius Dating — Tonight. Blind tables for six on the next Table night.
   Matches come from tables, not swiping: you sit, and afterwards you privately
   say who you'd meet again. Rose accent rides data-theme="shore". */

export default async function TablesPage() {
  const { supabase, user } = await getMember();

  const { data: nights } = await supabase
    .from("voyages")
    .select("*")
    .eq("class", "shore")
    .in("status", ["scheduled", "live"])
    .order("starts_at", { ascending: true })
    .limit(2);

  const nightIds = (nights ?? []).map((n) => n.id);
  const [{ data: tables }, { data: myPicks }] = await Promise.all([
    nightIds.length
      ? supabase.from("dating_tables").select("*").in("voyage_id", nightIds).order("number")
      : Promise.resolve({ data: [] }),
    supabase.from("table_picks").select("*").eq("picker", user.id),
  ]);

  const tableIds = (tables ?? []).map((t) => t.id);
  const { data: seats } = tableIds.length
    ? await supabase.from("table_seats").select("*").in("table_id", tableIds)
    : { data: [] };

  /* Server-rendered per request, so "now" is request time. */
  const now = new Date().getTime();
  const live = (s: { state: string; held_until: string }) =>
    s.state === "confirmed" || new Date(s.held_until).getTime() >= now;

  /* Seatmate names surface only where I hold a seat — the blind table stays
     blind from outside, enforced by RLS; this join just renders what RLS let
     through. */
  const seatmateIds = [...new Set((seats ?? []).map((s) => s.profile_id))];
  const { data: people } = seatmateIds.length
    ? await supabase.from("member_directory").select("id, full_name, avatar_tone").in("id", seatmateIds)
    : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, (p.full_name ?? "A guest").split(" ")[0]]));

  const views: TableView[] = (tables ?? []).map((t) => {
    const night = (nights ?? []).find((n) => n.id === t.voyage_id);
    const mine = (seats ?? []).find((s) => s.table_id === t.id && s.profile_id === user.id);
    const taken = (seats ?? []).filter((s) => s.table_id === t.id && live(s));
    const started = night ? new Date(night.starts_at).getTime() < now : false;
    return {
      id: t.id,
      number: t.number,
      seats: t.seats,
      taken: taken.length,
      nightTitle: night?.title ?? "",
      nightWhen: night ? `${logDate(night.starts_at, night.time_zone)} · ${logTime(night.starts_at, night.time_zone)}` : "",
      started,
      mine: mine ? { state: mine.state as "held" | "confirmed", heldUntil: mine.held_until } : null,
      /* First names only — the cast rule. Picks render after the night starts. */
      seatmates: started
        ? taken
            .filter((s) => s.profile_id !== user.id)
            .map((s) => ({
              id: s.profile_id,
              name: nameOf.get(s.profile_id) ?? "A guest",
              picked: (myPicks ?? []).some(
                (p) => p.table_id === t.id && p.picked === s.profile_id
              ),
            }))
        : [],
    };
  });

  return (
    <div className="ls-fade" data-theme="shore">
      <span className="mbr-eyebrow">Syrius Dating</span>
      <h1 className="mbr-h1">Tonight.</h1>
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-2)", maxWidth: "56ch" }}>
        Blind tables for six. Matches come from tables, not swiping — take a
        seat, and after the night say who you&rsquo;d meet again. Only a mutual
        pick surfaces anything.
      </p>

      {views.length === 0 ? (
        <p style={{ marginTop: 24, fontSize: 13, color: "var(--text-3)" }}>
          No Table night on the sheet. Thursday comes around.
        </p>
      ) : (
        <div style={{ marginTop: 24, display: "grid", gap: 14 }}>
          {views.map((t) => (
            <TableCard key={t.id} table={t} />
          ))}
        </div>
      )}

      <p style={{ marginTop: 28 }}>
        <Badge tone="outline">Seat held for 15 minutes. Confirm at the door.</Badge>
      </p>
    </div>
  );
}
