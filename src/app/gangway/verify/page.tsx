import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/ds";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { VerifyForm } from "./verify-form";
import "../gangway.css";

export const metadata: Metadata = { title: "Your code", robots: { index: false, follow: false } };

/* The second step. A member with two-step on lands here once per session,
   sent by the proxy until the code is proven. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/gangway?next=${encodeURIComponent(next)}`);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  /* Nothing to prove — two-step is off, or already proven this session. Said
     on the page rather than bounced, so a link here never loops. */
  const settled = !aal || aal.currentLevel === aal.nextLevel;
  return (
    <div className="gw">
      <aside className="gw-side">
        <span className="gw-side__wm">
          <Wordmark size="md" suffix={null} inverse />
        </span>
        <div>
          <div className="gw-side__big">One more step.</div>
          <div className="gw-seam"></div>
        </div>
        <div className="gw-side__log">
          <span>{(user.email ?? "").toUpperCase()}</span>
        </div>
      </aside>
      <main id="main" className="gw-main">
        <div className="gw-panel">
          {settled ? (
            <div>
              <h1 className="gw-h">Nothing to prove.</h1>
              <p className="gw-sub">
                {(user.factors ?? []).some((f) => f.status === "verified")
                  ? "Your code is already in for this session."
                  : "Two-step is not on for this account. Turn it on from You."}
              </p>
              <div className="gw-alt">
                <a href={next}>Carry on</a>
              </div>
            </div>
          ) : (
            <VerifyForm next={next} />
          )}
        </div>
      </main>
    </div>
  );
}
