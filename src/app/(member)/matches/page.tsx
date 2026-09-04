import type { Metadata } from "next";
import { Avatar, LockupText, StateBlock } from "@/components/ds";
import { logDate } from "@/lib/format";
import { anchorCountdown, type SharedAnchorRow } from "@/lib/radar";
import { moduleTables } from "@/lib/module-tables";
import { getMember } from "../data";

import { SendAWord } from "@/components/member/send-a-word";

export const metadata: Metadata = { title: "Matches" };

/* [un] Scripted — Matches. Every one came from a shared table and a mutual
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
      ? supabase.from("tables").select("id, number, episode_id").in("id", tableIds)
      : Promise.resolve({ data: [] }),
  ]);
  const personOf = new Map((people ?? []).map((p) => [p.id, p]));
  const tableOf = new Map((tables ?? []).map((t) => [t.id, t]));

  /* ── Shared Anchors — Radar's mutual picks, deliberately NOT matches ──────
     Two systems, two data models: `matches` is person-grain and permanent,
     `shared_anchors` is pass-grain and gone in twenty-four hours. They are
     listed side by side and never merged.

     The read is the radar page's own mine-anchors read: shared_anchors through
     the moduleTables seam, with RLS doing the ceremony — a row surfaces only
     once the envelope is opened (unlocked_at) and vanishes at expires_at, so
     an empty list is a rule holding, not a query failing. The explicit filter
     to my own passes matters only for staff, whom the policy does not scope. */
  const db = moduleTables(supabase);
  const { data: myPasses } = await supabase
    .from("passes")
    .select("id, episode_id")
    .eq("profile_id", user.id)
    .eq("status", "aboard");
  const passIds = (myPasses ?? []).map((p) => p.id);
  const passIdSet = new Set(passIds);

  let anchors: SharedAnchorRow[] = [];
  if (passIds.length) {
    const list = passIds.join(",");
    const { data } = await db
      .from("shared_anchors")
      .select("*")
      .or(`rsvp_a.in.(${list}),rsvp_b.in.(${list})`);
    const nowMs = new Date().getTime();
    anchors = ((data ?? []) as SharedAnchorRow[]).filter(
      (a) => a.unlocked_at && new Date(a.expires_at).getTime() > nowMs
    );
  }

  const anchorEpisodeIds = [...new Set(anchors.map((a) => a.episode_id))];
  const [{ data: anchorEpisodes }, sweeps] = await Promise.all([
    anchorEpisodeIds.length
      ? supabase.from("episodes").select("id, title").in("id", anchorEpisodeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    /* Names come from the sweep, the way radar draws them: first names only,
       a couple as one pin, and nothing else about anybody. The sweep is a
       definer that refuses anyone not aboard, so an error here is a rule
       holding and the card falls back to "A guest" rather than to a lookup
       that could return a surname. */
    Promise.all(
      anchorEpisodeIds.map(async (vid) => {
        const { data: pins } = await db.rpc("radar_sweep", { p_episode: vid });
        return (pins ?? []) as Array<{ rsvp_id: string; name: string; couple: boolean }>;
      })
    ),
  ]);
  const anchorEpisodeOf = new Map((anchorEpisodes ?? []).map((v) => [v.id, v.title]));
  const anchorNameOf = new Map<string, string>();
  for (const pins of sweeps) {
    for (const p of pins) anchorNameOf.set(p.rsvp_id, p.couple ? `${p.name} + 1` : p.name);
  }

  return (
    <div className="ls-fade">
      <span className="mbr-eyebrow"><LockupText division="scripted" /></span>
      <h1 className="mbr-h1">Matches.</h1>
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-2)", maxWidth: "56ch" }}>
        Everyone here shared a table with you and said your name back. That is
        the only way in.
      </p>

      {(matches ?? []).length === 0 ? (
        <StateBlock
          status="empty"
          icon="Users"
          title="That is everyone."
          /* TODO(owner): Thursday is asserted here and on Tonight; the night
             itself comes off episodes.starts_at. Confirm the standing day. */
          detail="Matches come from tables, not swiping — take a seat on Thursday."
          style={{ marginTop: 24 }}
        />
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
                  {/* Below the 22px Anton floor a name is set in Archivo 700,
                      sentence case — the display face is not a caption face. */}
                  <b style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "var(--text-lg)" }}>
                    {first}
                  </b>
                  <p className="mbr-mono" style={{ marginTop: 3 }}>
                    {t ? `MATCHED AT TABLE ${t.number}` : "MATCHED"} · {logDate(m.created_at, zone)} · YOU BOTH SAID THURSDAY
                  </p>
                  {p?.bio ? (
                    <p style={{ fontSize: "var(--text-xs)", color: "var(--text-2)", marginTop: 4 }}>{p.bio}</p>
                  ) : null}
                </div>
                <SendAWord otherId={otherId} label="Say something" />
              </div>
            );
          })}
        </div>
      )}

      {anchors.length > 0 ? (
        <section style={{ marginTop: 40 }}>
          <span className="mbr-eyebrow">From the water — Shared Anchors</span>
          <p style={{ marginTop: 10, fontSize: "var(--text-sm)", color: "var(--text-2)", maxWidth: "56ch" }}>
            Anchors come from an episode&rsquo;s radar, mutual only. Each one
            holds for twenty-four hours from the reveal, then the contact goes
            on both sides — no extension and no reminder.
          </p>
          <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
            {anchors.map((a) => {
              const mine = passIdSet.has(a.rsvp_a) ? a.rsvp_a : a.rsvp_b;
              const theirs = a.rsvp_a === mine ? a.rsvp_b : a.rsvp_a;
              const name = anchorNameOf.get(theirs) ?? "A guest";
              const left = anchorCountdown(a.expires_at);
              return (
                <div
                  key={a.id}
                  style={{
                    border: "1px solid var(--line-faint)",
                    background: "var(--surface-card)",
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <Avatar name={name} tone="sea" />
                  <div style={{ flex: 1 }}>
                    <b style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "var(--text-lg)" }}>
                      {name}
                    </b>
                    <p className="mbr-mono" style={{ marginTop: 3 }}>
                      ANCHORED · {anchorEpisodeOf.get(a.episode_id) ?? "An episode"}
                      {left ? ` · ${left}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
