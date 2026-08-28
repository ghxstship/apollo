import type { Metadata } from "next";
import { Avatar } from "@/components/ds";
import { logDate } from "@/lib/format";
import { getMember } from "../data";
import { SendAWord } from "@/components/member/send-a-word";

export const metadata: Metadata = { title: "Matches" };

/* [UN] Scripted — Matches. Every one came from a shared table and a mutual
   pick; there is nothing here to browse. Messaging reuses direct threads — a
   match is an introduction, not another inbox. */

export default async function MatchesPage() {
  const { supabase, user, zone } = await getMember();

  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .or(`profile_a.eq.${user.id},profile_b.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const otherIds = (matches ?? []).map((m) => (m.profile_a === user.id ? m.profile_b : m.profile_a));
  const tableIds = [...new Set((matches ?? []).map((m) => m.table_id))];

  const [{ data: people }, { data: tables }] = await Promise.all([
    otherIds.length
      ? supabase.from("member_directory").select("id, full_name, avatar_tone, bio").in("id", otherIds)
      : Promise.resolve({ data: [] }),
    tableIds.length
      ? supabase.from("dating_tables").select("id, number, voyage_id").in("id", tableIds)
      : Promise.resolve({ data: [] }),
  ]);
  const personOf = new Map((people ?? []).map((p) => [p.id, p]));
  const tableOf = new Map((tables ?? []).map((t) => [t.id, t]));

  return (
    <div className="ls-fade" data-theme="shore">
      <span className="mbr-eyebrow">[UN] Scripted</span>
      <h1 className="mbr-h1">Matches.</h1>
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-2)", maxWidth: "56ch" }}>
        Everyone here shared a table with you and said your name back. That is
        the only way in.
      </p>

      {(matches ?? []).length === 0 ? (
        <p style={{ marginTop: 24, fontSize: 13, color: "var(--text-3)" }}>
          That is everyone. Matches come from tables, not swiping — take a seat
          on Thursday.
        </p>
      ) : (
        <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
          {(matches ?? []).map((m) => {
            const otherId = m.profile_a === user.id ? m.profile_b : m.profile_a;
            const p = personOf.get(otherId);
            const t = tableOf.get(m.table_id);
            const first = (p?.full_name ?? "A guest").split(" ")[0];
            return (
              <div
                key={m.id}
                style={{
                  border: "1px solid var(--line-faint)",
                  background: "var(--surface-card)",
                  padding: "16px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <Avatar name={first} tone={(p?.avatar_tone ?? "ink") as "ink" | "sea" | "gold" | "sand"} />
                <div style={{ flex: 1 }}>
                  <b style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 17 }}>
                    {first}
                  </b>
                  <p className="mbr-mono" style={{ marginTop: 3 }}>
                    {t ? `MATCHED AT TABLE ${t.number}` : "MATCHED"} · {logDate(m.created_at, zone)} · YOU BOTH SAID THURSDAY
                  </p>
                  {p?.bio ? (
                    <p style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>{p.bio}</p>
                  ) : null}
                </div>
                <SendAWord otherId={otherId} label="Say something" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
