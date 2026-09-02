import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/ds";
import { SURFACES } from "@/lib/brand";
import { memberMark } from "@/lib/membership";
import { getOperator } from "./data";
import { HmClock, HmTabs } from "./nav";
import "./bridge.css";

export const metadata: Metadata = {
  title: { default: "The Bridge", template: "%s · The Bridge" },
  robots: { index: false, follow: false },
};

export default async function StaffLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, profile } = await getOperator();

  const [{ data: cities }, { data: keysOpen }] = await Promise.all([
    supabase.from("cities").select("name").order("position", { ascending: true }).limit(1),
    supabase.rpc("club_setting", { p_key: "keys_console_enabled" }),
  ]);
  const city = profile.home_city ?? cities?.[0]?.name ?? SURFACES.shoreside;
  const hidden = keysOpen ? [] : ["/bridge/keys"];

  return (
    <div className="hm-shell">
      <header className="hm-top">
        <div className="hm-top__in">
          <div>
            <Wordmark size="sm" suffix={null} />
            <span className="hm-top__sub">{SURFACES.bridge} — {city}</span>
          </div>
          <HmClock />
          <div className="hm-top__op">
            <span className="hm-mono">
              {(profile.full_name ?? "Operator").toUpperCase()}
              {profile.member_no ? ` · ${memberMark(profile.member_no)}` : ""}
            </span>
            <Link className="hm-top__back" href="/home">
              Back to Home
            </Link>
          </div>
        </div>
      </header>
      <HmTabs hidden={hidden} />
      <main id="main" className="hm-main">{children}</main>
    </div>
  );
}
