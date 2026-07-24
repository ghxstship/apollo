import type { Metadata } from "next";
import { ThemeToggle, Wordmark } from "@/components/ds";
import { GangwayPanel } from "./panel";
import "./gangway.css";

export const metadata: Metadata = {
  title: "The gangway",
  description: "Passwordless sign-in for LYRE SOCIAL members.",
};

export default async function GangwayPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const rawNext = sp.next ?? "/home-port";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/home-port";
  const expired = sp.error === "expired";

  return (
    <div className="gw">
      <aside className="gw-side">
        <span className="gw-side__wm">
          <Wordmark size="md" inverse />
        </span>
        <div>
          <div className="gw-side__big">Welcome back to the water.</div>
          <div className="gw-seam"></div>
        </div>
        <div className="gw-side__log">
          <span>MIAMI 25.77° N</span>
          <span>·</span>
          <span>LA 33.98° N</span>
          <span>·</span>
          <span>SEASON II</span>
        </div>
      </aside>
      <main className="gw-main">
        <div className="gw-panel">
          <GangwayPanel next={next} expired={expired} />
        </div>
        {/* Ambient, not a feature — quiet corner, inside the content margin. */}
        <div className="gw-theme">
          <ThemeToggle />
        </div>
      </main>
    </div>
  );
}
