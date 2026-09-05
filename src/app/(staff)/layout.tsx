import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/ds";
import { SURFACES } from "@/lib/brand";
import { memberMark } from "@/lib/membership";
import { getOperator } from "./data";
import { HmClock, HmRail, HmTabs } from "./nav";
import { CommandBar } from "./command-bar";
import "./bridge.css";

export const metadata: Metadata = {
  title: { default: "The Bridge", template: "%s · The Bridge" },
  robots: { index: false, follow: false },
};

export default async function StaffLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, profile, door } = await getOperator();

  /* A door grant opens exactly one console — the gangway — and the layout
     shows it nothing it cannot follow: no tabs, no rail, no way back to a
     Home it may not have. The page itself names the episode and the expiry. */
  if (door) {
    return (
      <div className="hm-shell">
        <main id="main" className="hm-main">{children}</main>
      </div>
    );
  }

  const [{ data: cities }, { data: keysOpen }] = await Promise.all([
    supabase.from("cities").select("id, name").order("position", { ascending: true }),
    supabase.rpc("club_setting", { p_key: "keys_console_enabled" }),
  ]);
  /* home_city is an id; the bar printed the uuid for any operator with a home
     city set. The name, or the first city, or Shoreside. */
  const city = cities?.find((c) => c.id === profile.home_city)?.name ?? cities?.[0]?.name ?? SURFACES.shoreside;
  const hidden = keysOpen ? [] : ["/bridge/keys"];

  return (
    <div className="hm-shell">
      <header className="hm-top">
        <div className="hm-top__in">
          <div>
            <Wordmark size="sm" suffix={null} />
            <span className="hm-top__sub">{SURFACES.bridge} — {city}</span>
          </div>
          <CommandBar />
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
      <div className="hm-deck">
        <HmRail hidden={hidden} />
        <main id="main" className="hm-main">{children}</main>
      </div>
    </div>
  );
}
