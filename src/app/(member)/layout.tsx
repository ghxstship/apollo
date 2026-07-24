import { PurserLauncher } from "@/components/purser/launcher";
import { getMember } from "./data";
import { MemberTabBar, MemberTopBar } from "./nav";
import "./member.css";

export default async function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user, profile } = await getMember();

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
      <main className="mbr-main">{children}</main>
      <MemberTabBar userId={user.id} unreadWord={count ?? 0} />
      <PurserLauncher />
    </div>
  );
}
