import { getMember } from "./data";
import { MemberTabBar, MemberTopBar } from "./nav";
import "./member.css";

export default async function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await getMember();

  return (
    <div className="mbr-shell">
      <MemberTopBar memberNo={profile?.member_no ?? null} />
      <main className="mbr-main">{children}</main>
      <MemberTabBar />
    </div>
  );
}
