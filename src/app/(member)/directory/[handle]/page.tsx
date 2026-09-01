import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Icon, Stat, Tag } from "@/components/ds";
import { CLUB_ZONE, CITY_CODES, CURRENCY, FAMILY_LABEL, knots } from "@/lib/brand";
import { logDate, roman, yearIn } from "@/lib/format";
import { PassageLog, readPassageLog } from "@/components/member/passage-log";
import { getMember } from "../../data";
import { moduleTables } from "@/lib/module-tables";
import { SendAWord } from "@/components/member/send-a-word";
import { DeclineWord } from "@/components/member/decline-word";

const TONES = new Set(["ink", "sea", "gold", "sand"]);

function toneOf(t: string | null | undefined): "ink" | "sea" | "gold" | "sand" {
  return t && TONES.has(t) ? (t as "ink" | "sea" | "gold" | "sand") : "ink";
}

type SharedVoyage = { id: string; title: string; class: string; starts_at: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${handle}` };
}

export default async function MemberPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const { supabase, user, profile: viewer, zone } = await getMember();

  const { data: member } = await supabase
    .from("member_directory")
    .select("*")
    .eq("handle", handle)
    .maybeSingle();

  if (!member) notFound();

  const own = member.id === user.id;
  const staff = viewer?.is_staff ?? false;
  /* Unlisted members are visible to themselves and to staff, nobody else. */
  if (!member.in_directory && !own && !staff) notFound();
  if (member.status !== "active" && !own && !staff) notFound();

  const { log, marks } = await readPassageLog(supabase, member.id);

  /* Whether the viewer has declined messages from this member. member_blocks
     RLS shows a member only their own blocks, so this reads at most one row
     and never anybody else's refusals. */
  let blocked = false;
  if (!own) {
    const { data: block } = await moduleTables(supabase)
      .from("member_blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", member.id)
      .maybeSingle();
    blocked = !!block;
  }

  const [harborRes, leagueRes, engagementRes, affinityRes, rsvpsRes, balanceRes] =
    await Promise.all([
      member.home_harbor
        ? supabase.from("harbors").select("*").eq("id", member.home_harbor).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("member_league").select("*").eq("profile_id", member.id).maybeSingle(),
      supabase
        .from("member_engagement")
        .select("profile_id,passes")
        .eq("profile_id", member.id)
        .maybeSingle(),
      supabase
        .from("member_affinity")
        .select("shared")
        .eq("profile_id", user.id)
        .eq("other_id", member.id)
        .maybeSingle(),
      /* A pass row is its owner's; the shared list comes from a definer that
         answers only "which voyages were you both on". */
      supabase.rpc("shared_voyages", { p_other: member.id }),
      supabase.from("fathoms_balance").select("*").eq("profile_id", user.id).maybeSingle(),
    ]);

  const harbor = harborRes.data;
  const harborCode = harbor ? CITY_CODES[harbor.slug] ?? "" : "";
  const leagueName = leagueRes.data?.league_name ?? "First League — Harborline";
  const passes = engagementRes.data?.passes ?? 0;
  const shared = affinityRes.data?.shared ?? 0;
  const joinedYear = member.joined_at
    ? yearIn(member.joined_at, CLUB_ZONE)
    : new Date().getFullYear();

  /* Voyages both were aboard for — the affinity count, made concrete. */
  let both: SharedVoyage[] = [];
  if (!own) {
    const rows = rsvpsRes.data ?? [];
    const bothIds = Array.from(
      new Set(
        rows.map((r) => r.voyage_id)
      )
    );
    if (bothIds.length) {
      const { data } = await supabase
        .from("voyages")
        .select("id,title,class,starts_at")
        .in("id", bothIds)
        .order("starts_at", { ascending: false });
      both = data ?? [];
    }
  }

  const interests = member.interests ?? [];

  return (
    <div style={{ maxWidth: 720, marginInline: "auto" }}>
      <Link href="/directory" className="dir-back mbr-mono">
        <Icon name="ArrowLeft" size={12} /> The roster
      </Link>

      <header className="dir-head">
        <Avatar name={member.full_name ?? "A member"} tone={toneOf(member.avatar_tone)} size="lg" />
        <div className="dir-head__who">
          <h1 className="dir-head__name">{member.full_name ?? "A member"}</h1>
          {member.handle ? <p className="dir-head__handle">@{member.handle}</p> : null}
          <p className="dir-head__where">
            {leagueName}
            <span className="dir-row__dot">·</span>
            {harbor?.name ?? "No home harbor"}
            {harborCode ? <span className="dir-row__code">{harborCode}</span> : null}
          </p>
          <p className="mbr-mono dir-head__no">
            {member.member_no ?? "UN-0000"} · member since {roman(joinedYear)}
          </p>
        </div>
        {!own && !blocked ? (
          <SendAWord otherId={member.id} className="dir-head__act" />
        ) : null}
      </header>

      {!member.in_directory ? (
        <p className="mbr-mono dir-hidden">Not listed in the directory</p>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow">In their words</span>
        <p className="dir-bio">
          {member.bio?.trim()
            ? member.bio
            : "No word yet. Some members prefer to be met on the water."}
        </p>
      </section>

      {interests.length ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow">Turns up for</span>
          <div className="dir-row__tags">
            {interests.map((i) => (
              <Tag key={i}>{i}</Tag>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow">The wake</span>
        <p className="mbr-mono dir-head__no">
          {passes} {passes === 1 ? "pass" : "passes"} held
          {!own ? ` · sailed together ×${shared}` : ""}
        </p>
        {!own ? (
          both.length ? (
            <>
              <p className="dir-shared__lede">You&apos;ve both sailed:</p>
              <ul className="dir-shared">
                {both.map((v) => (
                  <li key={v.id}>
                    <span className="mbr-mono">{FAMILY_LABEL[v.class] ?? "Sea Day"}</span>
                    <b>{v.title}</b>
                    <span className="mbr-mono">{logDate(v.starts_at, zone)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="dir-shared__lede">No shared water yet.</p>
          )
        ) : null}
      </section>

      <PassageLog zone={zone} log={log} marks={marks} own={own} />

      {!own ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow">The word</span>
          <DeclineWord
            otherId={member.id}
            handle={member.handle ?? null}
            firstName={(member.full_name ?? "This member").split(" ")[0]}
            blocked={blocked}
          />
        </section>
      ) : null}

      {own ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow">Your ledger</span>
          <div className="dir-knots">
            <Stat
              label={CURRENCY.name}
              value={knots(balanceRes.data?.balance ?? 0)}
              sub="MORE KNOTS, FARTHER WATER"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
