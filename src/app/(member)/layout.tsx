import { ProducerLauncher } from "@/components/producer/launcher";
import { getMember } from "./data";
import { MemberTabBar, MemberTopBar } from "./nav";
import "./member.css";

export default async function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user, profile, onHold } = await getMember();
  const departed = (profile?.status ?? "active") === "departed";

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .eq("read", false);

  return (
    <div className="mbr-shell">
      <MemberTopBar
        memberNo={profile?.member_no ?? null}
        userId={user.id}
        unreadWord={count ?? 0}
        isStaff={profile?.is_staff ?? false}
      />
      {/* This said "wait until you resume — that happens on your page" to
          everyone whose standing was not active, including departed members,
          for whom there is nothing on that page to resume with and never was.
          A banner that gives an instruction the product cannot carry out is
          worse than one that says nothing. */}
      {/* The banner is a child of the shell, which has no max-width, so it ran
          full-bleed while everything under it stopped at 1080 — the first thing
          a paused member saw was the one element that lined up with nothing.
          .mbr-holdbox is .mbr-main's box, and only that. */}
      {onHold ? (
        <div className="mbr-holdbox">
          <div className="mbr-hold" role="status">
            <span className="mbr-hold__eyebrow">
              {departed ? "YOUR PLACE IS CLOSED" : "MEMBERSHIP PAUSED"}
            </span>
            <p>
              {departed
                ? "Your log and your ledger stay as they were. Coming back is a conversation — Shoreside opens it again."
                : profile?.hold_reason === "dues"
                  ? "Held for dues. Your log and your ledger stay open; clear the balance on Account and the hold lifts on its own. Booking, posting and contests wait until then."
                  : profile?.status_set_by && profile.status_set_by !== user.id
                    ? "Held by the club. Your log, your ledger and what you owe stay open; Shoreside can say why and when."
                    : "Your log, your ledger and what you owe stay open. Booking, posting and contests wait until it resumes — resume it on You."}
            </p>
            {/* The one action that lifts it, named for the reason. */}
            <a href={departed ? "/support" : profile?.hold_reason === "dues" ? "/account" : profile?.status_set_by && profile.status_set_by !== user.id ? "/support" : "/you"} className="mbr-hold__link">
              {departed ? "Shoreside" : profile?.hold_reason === "dues" ? "Account" : profile?.status_set_by && profile.status_set_by !== user.id ? "Shoreside" : "You"}
            </a>
          </div>
        </div>
      ) : null}
      <main id="main" className="mbr-main">{children}</main>
      <MemberTabBar userId={user.id} unreadWord={count ?? 0} />
      <ProducerLauncher />
    </div>
  );
}
