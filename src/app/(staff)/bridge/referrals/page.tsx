import type { Metadata } from "next";
import { ListToolbar, Stat, StateBlock, Table } from "@/components/ds";
import { knots } from "@/lib/brand";
import { logDate } from "@/lib/format";
import { memberMark } from "@/lib/membership";
import { getOperator } from "../../data";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Referrals" };

type ReferralRow = {
  code: string;
  sponsor: string;
  uses: string;
  aboard: string;
  knotsAwarded: string;
  cut: string;
  [key: string]: unknown;
};

export default async function ReferralsPage() {
  const { supabase } = await getOperator();

  const [invitesRes, rollRes, knotsRes] = await Promise.all([
    supabase.from("invites").select("*").order("created_at", { ascending: false }),
    supabase.from("member_roll").select("email, invite_code, created_at").not("invite_code", "is", null),
    supabase.from("knots_ledger").select("profile_id, delta, reason").ilike("reason", "Referral signature%"),
  ]);

  const invites = must(invitesRes);
  const roll = must(rollRes);

  const inviterIds = [...new Set(invites.map((i) => i.inviter_id))];
  const rollEmails = roll.map((r) => r.email);

  const [sponsorsRes, joinedRes] = await Promise.all([
    inviterIds.length
      ? supabase.from("profiles").select("id, full_name, member_no").in("id", inviterIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; member_no: string | null }> }),
    rollEmails.length
      ? supabase.from("profiles").select("email, full_name, member_no").in("email", rollEmails)
      : Promise.resolve({ data: [] as Array<{ email: string | null; full_name: string | null; member_no: string | null }> }),
  ]);

  const sponsors = new Map((must(sponsorsRes)).map((p) => [p.id, p]));
  const joined = new Map(
    (must(joinedRes))
      .filter((p) => p.email)
      .map((p) => [String(p.email).toLowerCase(), p])
  );

  /* Every signature that held, filed under the code that carried it. */
  const camebyCode = new Map<string, string[]>();
  for (const r of roll) {
    const code = (r.invite_code ?? "").toUpperCase();
    if (!code) continue;
    const profile = joined.get(r.email.toLowerCase());
    const name = profile?.full_name ?? r.email;
    const list = camebyCode.get(code) ?? [];
    list.push(profile?.member_no ? `${name} · ${memberMark(profile.member_no)}` : name);
    camebyCode.set(code, list);
  }

  const knotsByInviter = new Map<string, number>();
  for (const f of must(knotsRes)) {
    knotsByInviter.set(f.profile_id, (knotsByInviter.get(f.profile_id) ?? 0) + f.delta);
  }

  const rows: ReferralRow[] = invites.map((i) => {
    const sponsor = sponsors.get(i.inviter_id);
    const came = camebyCode.get(i.code.toUpperCase()) ?? [];
    return {
      code: i.code,
      sponsor: sponsor?.full_name
        ? `${sponsor.full_name}${sponsor.member_no ? ` · ${memberMark(sponsor.member_no)}` : ""}`
        : "Sponsor off the roll",
      uses: `${i.uses}/${i.max_uses}`,
      aboard: came.length ? came.join(" · ") : "—",
      knotsAwarded: knots(knotsByInviter.get(i.inviter_id) ?? 0),
      /* UTC, not the server's local zone: an invite cut 01:17Z rendered
         AUG 22 here and AUG 23 on a UTC deploy. */
      cut: logDate(i.created_at, "UTC"),
    };
  });

  const totalAboard = [...camebyCode.values()].reduce((t, l) => t + l.length, 0);
  const totalKnots = [...knotsByInviter.values()].reduce((t, n) => t + n, 0);

  return (
    <div>
      <span className="hm-eyebrow">Referrals</span>
      <h1 className="hm-h1">Who vouched for whom.</h1>
      <p className="hm-lede">
        A member puts their name on someone. When that signature holds, the ledger says so — 250
        Knots, once, and no more than that. These are sponsorships, not sales.
      </p>

      <div className="hm-row">
        <Stat label="Sponsorships" value={invites.length} sub="CODES IN HANDS" />
        <Stat label="Came aboard" value={totalAboard} sub="SIGNATURES THAT HELD" />
        <Stat label="Knots awarded" value={knots(totalKnots)} sub="TO THE SPONSORS" />
      </div>

      <section className="hm-sec">
        <h2>Code by code.</h2>
        {/* Six column headings over an empty body, with the explanation
            stranded beneath them, whenever nobody holds a code. */}
        {rows.length ? (
          <>
          <ListToolbar resultCount={rows.length} resultNoun="code" countSuffix={` · ${totalAboard} came aboard`} />
          <div className="hm-panel">
            <Table
              rowKey={(r: ReferralRow) => r.code}
              columns={[
                { key: "sponsor", label: "Sponsor" },
                { key: "code", label: "Code", mono: true, width: 130 },
                { key: "uses", label: "Used", mono: true, width: 80 },
                { key: "aboard", label: "Came aboard" },
                { key: "knotsAwarded", label: "Knots", mono: true, width: 100 },
                { key: "cut", label: "Cut", mono: true, width: 80 },
              ]}
              rows={rows}
            />
          </div>
          </>
        ) : (
          <div style={{ marginTop: 20 }}>
            <StateBlock
              status="empty"
              title="No codes in hands yet."
              detail="A member sponsors someone with a code of their own. Every code cut shows here with what it brought aboard."
            />
          </div>
        )}
      </section>
    </div>
  );
}
