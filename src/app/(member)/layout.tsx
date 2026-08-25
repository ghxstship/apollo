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
      {onHold ? (
        <div className="mbr-hold" role="status">
          <span className="mbr-hold__eyebrow">
            {departed ? "YOUR PLACE IS CLOSED" : "MEMBERSHIP ON HOLD"}
          </span>
          <p>
            {departed
              ? "Your log and your ledger stay as they were. Coming back is a conversation — Shoreside opens it again."
              : "Your log, your ledger and what you owe stay open. Booking, posting and contests wait until the hold lifts."}
          </p>
          <a href="/you" className="mbr-hold__link">
            Your page
          </a>
        </div>
      ) : null}
      <main id="main" className="mbr-main">{children}</main>
      <MemberTabBar userId={user.id} unreadWord={count ?? 0} />
      <ProducerLauncher />
    </div>
  );
}
