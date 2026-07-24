import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/ds";
import { getOperator } from "./data";
import { HmClock, HmTabs } from "./nav";
import "./harbormaster.css";

export const metadata: Metadata = {
  title: { default: "Harbormaster", template: "%s · Harbormaster" },
  robots: { index: false, follow: false },
};

export default async function StaffLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, profile } = await getOperator();

  const { data: harbors } = await supabase
    .from("harbors")
    .select("name")
    .order("position", { ascending: true })
    .limit(1);
  const harbor = profile.home_harbor ?? harbors?.[0]?.name ?? "Shore office";

  return (
    <div className="hm-shell">
      <header className="hm-top">
        <div className="hm-top__in">
          <div>
            <Wordmark size="sm" />
            <span className="hm-top__sub">Harbormaster — {harbor}</span>
          </div>
          <HmClock />
          <div className="hm-top__op">
            <span className="hm-mono">
              {(profile.full_name ?? "Operator").toUpperCase()}
              {profile.member_no ? ` · ${profile.member_no}` : ""}
            </span>
            <Link className="hm-top__back" href="/harbor">
              Back to harbor
            </Link>
          </div>
        </div>
      </header>
      <HmTabs />
      <main className="hm-main">{children}</main>
    </div>
  );
}
