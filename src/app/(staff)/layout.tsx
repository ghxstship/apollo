import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
  const { supabase, profile, user, door } = await getOperator();

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

  const [{ data: cities }, { data: keysOpen }, { data: mfaFrom }] = await Promise.all([
    supabase.from("cities").select("id, name").order("position", { ascending: true }),
    supabase.rpc("club_setting", { p_key: "keys_console_enabled" }),
    supabase.rpc("club_setting_text", { p_key: "staff_mfa_required_from" }),
  ]);

  /* Two-step stops being optional for the Bridge on a date the owner sets.
     Until 2026-09-06 it was optional for everyone, which meant an operator who
     had enrolled nothing was protected by a password alone — and that operator
     reads every member's personal data, moves money, mints API keys and exports
     the roster. The step-up machinery was good and simply never asked, because
     it asks only when a factor already exists.

     Enforced HERE and not in the proxy. The proxy cannot know who is staff —
     that is a database question and its own comment is clear it should not
     become one — and this layout has already fetched the operator. A door grant
     is exempt by construction: it returned above, and a hired door holding one
     console for one night is not who this is about.

     A date, not a switch, and the reason is the failure mode. Turning it on
     instantly locks out every operator who has not enrolled, the owner
     included, with no way back in to enrol. Before the date they are warned on
     every screen; on and after it they are sent to enrol and can do nothing
     else. Clearing the setting disables it entirely, which is a thing somebody
     may need at three in the morning. */
  const enrolled = (user.factors ?? []).some((f) => f.status === "verified");
  const requiredFrom = typeof mfaFrom === "string" && mfaFrom ? mfaFrom : null;
  /* Compared as calendar dates in the club's own reckoning rather than as
     instants: "from the twentieth" means the whole of the twentieth, and an
     operator in a different timezone should not be locked out an evening early
     because a UTC boundary passed. */
  const today = new Date().toISOString().slice(0, 10);
  const mfaOverdue = !enrolled && requiredFrom !== null && today >= requiredFrom;
  const mfaDue = !enrolled && requiredFrom !== null && !mfaOverdue;

  /* Sent to their own settings, where the two-step control lives, with a reason
     the page can show. Not to a Bridge screen: the whole point is that no
     Bridge screen renders until they have enrolled. */
  if (mfaOverdue) redirect("/you?enrol=bridge");
  /* home_city is an id; the bar printed the uuid for any operator with a home
     city set. The name, or the first city, or Shoreside. */
  const city = cities?.find((c) => c.id === profile.home_city)?.name ?? cities?.[0]?.name ?? SURFACES.shoreside;
  const hidden = keysOpen ? [] : ["/bridge/keys"];

  return (
    <div className="hm-shell">
      {mfaDue ? (
        <div className="hm-warn" role="status">
          <span className="hm-mono">TWO-STEP BECOMES REQUIRED ON THE BRIDGE FROM {requiredFrom}</span>
          <Link href="/you?enrol=bridge">Set it up now</Link>
        </div>
      ) : null}
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
