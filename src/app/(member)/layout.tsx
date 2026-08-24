import { ProducerLauncher } from "@/components/producer/launcher";
import { getMember } from "./data";
import { MemberTabBar, MemberTopBar } from "./nav";
import "./member.css";

export default async function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user, profile, onHold } = await getMember();

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
      {onHold ? (
        <div className="mbr-hold" role="status">
          <span className="mbr-hold__eyebrow">MEMBERSHIP ON HOLD</span>
          <p>
            Your log, your ledger and what you owe stay open. Booking, posting
            and contests wait until you resume — that happens on your page.
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
