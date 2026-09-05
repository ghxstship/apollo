import type { SupabaseClient } from "@supabase/supabase-js";
import { CLUB_ZONE } from "@/lib/brand";
import { logDateTime } from "@/lib/format";

/* The last change to each row of a reference table, as one line an editable
   card can carry: "Changed by Mara · 4 Sep 14:02". audit_log is written by
   record_the_change on seventeen tables and was read on Reports alone; the
   screen that writes a row now shows who last did. */
export async function lastChanges(
  supabase: SupabaseClient,
  tables: string[]
): Promise<Map<string, string>> {
  const { data: rows } = await supabase
    .from("audit_log")
    .select("table_name, row_id, actor_id, at")
    .in("table_name", tables)
    .order("at", { ascending: false })
    .limit(400);
  const latest = new Map<string, { actor_id: string | null; at: string }>();
  for (const r of (rows ?? []) as Array<{ table_name: string; row_id: string; actor_id: string | null; at: string }>) {
    const key = `${r.table_name}:${r.row_id}`;
    if (!latest.has(key)) latest.set(key, { actor_id: r.actor_id, at: r.at });
  }
  const actorIds = [...new Set([...latest.values()].map((v) => v.actor_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    for (const p of (people ?? []) as Array<{ id: string; full_name: string | null }>) names.set(p.id, (p.full_name ?? "").split(" ")[0] || "the Bridge");
  }
  const out = new Map<string, string>();
  for (const [key, v] of latest) {
    out.set(key, `Changed by ${v.actor_id ? names.get(v.actor_id) ?? "the Bridge" : "the clock"} · ${logDateTime(v.at, CLUB_ZONE)}`);
  }
  return out;
}
