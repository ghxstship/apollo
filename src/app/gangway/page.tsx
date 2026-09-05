import { safeNext } from "@/lib/safe-next";
import { ANCHOR } from "@/lib/brand";
import type { Metadata } from "next";
import { ThemeToggle, Wordmark } from "@/components/ds";
import { GangwayPanel } from "./panel";
import { enabledProviders } from "./ways";
import "./gangway.css";

export const metadata: Metadata = {
  title: "The gangway",
  description: `Sign in for the ${ANCHOR} cast — a link, a password, or a provider.`,
};

export default async function GangwayPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const expired = sp.error === "expired";
  const noPass = sp.error === "no-pass";
  const providerFailed = sp.error === "provider";
  const providers = enabledProviders();

  return (
    <div className="gw">
      <aside className="gw-side">
        <span className="gw-side__wm">
          <Wordmark size="md" suffix={null} inverse />
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
          {/* TODO(owner): Season I is the one on the playbook; this read
              SEASON II with nothing behind it. Read it off the edition once
              the gangway knows which city it is standing in. */}
          <span>SEASON I</span>
        </div>
      </aside>
      <main id="main" className="gw-main">
        <div className="gw-panel">
          <GangwayPanel next={next} expired={expired} noPass={noPass} providerFailed={providerFailed} providers={providers} />
        </div>
        {/* Ambient, not a feature — quiet corner, inside the content margin. */}
        <div className="gw-theme">
          <ThemeToggle />
        </div>
      </main>
    </div>
  );
}
