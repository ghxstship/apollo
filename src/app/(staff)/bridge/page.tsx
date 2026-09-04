import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { Badge, Stat, StateBlock, Table } from "@/components/ds";
import { TIER_LABEL, logDateTime } from "@/lib/format";
import { memberMark } from "@/lib/membership";
import { getOperator } from "../data";
import { AppsClient, type AppRow, type Answer } from "./apps-client";
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

  const [appsRes, rollRes, questionsRes] = await Promise.all([
    supabase.from("applications").select("*").order("created_at", { ascending: false }),
    supabase.from("member_roll").select("*").order("created_at", { ascending: false }),
    /* Every question, live or not: an answer filed under a question since
       switched off still reads under its prompt. */
    supabase.from("application_questions").select("key, prompt, position").order("position", { ascending: true }),
  ]);

  const applications = must(appsRes);
  const roll = must(rollRes);
  const questions = must(questionsRes);

  /* The answers, joined to their prompts in question order. An answer whose key
     no longer has a question reads under the key itself rather than vanishing. */
  const readAnswers = (raw: unknown): Answer[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const o = raw as Record<string, unknown>;
    const line = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : v == null ? "" : String(v));
    const out: Answer[] = questions
      .filter((q) => q.key in o && line(o[q.key]).trim() !== "")
      .map((q) => ({ key: q.key, prompt: q.prompt, answer: line(o[q.key]) }));
    for (const key of Object.keys(o)) {
      if (!questions.some((q) => q.key === key) && line(o[key]).trim() !== "")
        out.push({ key, prompt: key.replaceAll("_", " "), answer: line(o[key]) });
    }
    return out;
  };

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
    note: a.note ?? "",
    proposer: a.proposer ?? "",
    answers: readAnswers(a.answers),
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
          ? "Move them to review, invite them ashore, then call it."
          : "Nothing waiting on a decision. The queue below is the record."}
      </p>

      {/* The one number this console exists for was a substring of the lede.
          Said as a figure, with the two states it is made of beside it. */}
      <div className="hm-row">
        <Stat size="sm" label="Waiting on a decision" value={openCount} />
        <Stat
          size="sm"
          label="In review"
          value={apps.filter((a) => a.status === "review").length}
        />
        <Stat
          size="sm"
          label="Invited ashore"
          value={apps.filter((a) => a.status === "invited").length}
        />
        <Stat size="sm" label="On the roll" value={rollRows.length} />
      </div>

      <AppsClient apps={apps} />

      <section className="hm-sec">
        <h2>The member roll.</h2>
        <p className="hm-note">
          Accepted emails cleared to board — joined means the card is in a hand.
        </p>
        {/* Six column headings over an empty body, with the line that explains
            the emptiness stranded underneath them. */}
        {rollRows.length ? (
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
        </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            <StateBlock
              status="empty"
              title="The roll is empty."
              detail="Accept an application and it lands here — the email cleared to board, and whether the card is in a hand yet."
            />
          </div>
        )}
      </section>
    </div>
  );
}
