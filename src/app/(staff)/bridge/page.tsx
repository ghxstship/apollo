import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { Badge, Table } from "@/components/ds";
import { TIER_LABEL, logDateTime } from "@/lib/format";
import { memberMark } from "@/lib/membership";
import { getOperator } from "../data";
import { AppsClient, type AppRow } from "./apps-client";
import { must } from "../staff";

export const metadata: Metadata = { title: "Applications" };

type RollRow = {
  email: string;
  tier: string;
  source: string;
  invite: string;
  approved: string;
  memberNo: string | null;
  [key: string]: unknown;
};

export default async function ApplicationsPage() {
  const { supabase } = await getOperator();

  const [appsRes, rollRes] = await Promise.all([
    supabase.from("applications").select("*").order("created_at", { ascending: false }),
    supabase.from("member_roll").select("*").order("created_at", { ascending: false }),
  ]);

  const applications = must(appsRes);
  const roll = must(rollRes);

  const rollEmails = roll.map((r) => r.email);
  const joinedProfilesRes = rollEmails.length
    ? await supabase.from("profiles").select("email, member_no").in("email", rollEmails)
    : { data: [] as Array<{ email: string | null; member_no: string | null }> };
  const joined = new Map(
    (must(joinedProfilesRes))
      .filter((p) => p.email)
      .map((p) => [String(p.email).toLowerCase(), p.member_no])
  );

  const apps: AppRow[] = applications.map((a) => ({
    id: a.id,
    name: a.full_name,
    email: a.email,
    city: a.city ?? "",
    tier: TIER_LABEL[a.tier_requested] ?? a.tier_requested,
    interests: a.interests ?? [],
    inviteCode: a.invite_code ?? "",
    created: logDateTime(a.created_at, CLUB_ZONE),
    status: a.status,
  }));

  const openCount = apps.filter((a) => a.status === "received" || a.status === "review").length;

  const rollRows: RollRow[] = roll.map((r) => ({
    email: r.email,
    tier: TIER_LABEL[r.tier] ?? r.tier,
    source: r.source,
    invite: r.invite_code ?? "—",
    approved: logDateTime(r.created_at, CLUB_ZONE),
    memberNo: joined.get(r.email.toLowerCase()) ?? null,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Applications</span>
      <h1 className="hm-h1">The application queue.</h1>
      <p className="hm-lede">
        {openCount
          ? `${openCount} waiting on a decision. Move them to review, set the Port Day invite, then call it.`
          : "Nothing waiting on a decision. The queue below is the record."}
      </p>

      <AppsClient apps={apps} />

      <section className="hm-sec">
        <h2>The member roll.</h2>
        <p className="hm-note">
          Accepted emails cleared to board — joined means the card is in a hand.
        </p>
        <div className="hm-panel">
          <Table
            rowKey={(r: RollRow) => r.email}
            columns={[
              {
                key: "email",
                label: "Email",
                mono: true,
                render: (r: RollRow) => r.email.toUpperCase(),
              },
              { key: "tier", label: "Tier" },
              { key: "source", label: "Source" },
              { key: "invite", label: "Invite", mono: true },
              { key: "approved", label: "Approved", mono: true, width: 110 },
              {
                key: "state",
                label: "Status",
                render: (r: RollRow) =>
                  r.memberNo ? (
                    <Badge tone="positive">Joined · {memberMark(r.memberNo)}</Badge>
                  ) : (
                    <Badge tone="outline">Awaiting sign-in</Badge>
                  ),
              },
            ]}
            rows={rollRows}
          />
          {rollRows.length === 0 ? (
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: 13 }}>
              The roll is empty. Accept an application and it lands here.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
