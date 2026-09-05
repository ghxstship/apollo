import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/ds";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";
import "../gangway.css";

export const metadata: Metadata = { title: "Choose a password", robots: { index: false, follow: false } };

/* Where a recovery link lands: signed in by the link, the member chooses a
   password. The same form serves a member who wants one for the first time. */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/gangway?next=${encodeURIComponent(`/gangway/reset?next=${encodeURIComponent(next)}`)}`);
  return (
    <div className="gw">
      <aside className="gw-side">
        <span className="gw-side__wm">
          <Wordmark size="md" suffix={null} inverse />
        </span>
        <div>
          <div className="gw-side__big">A new password.</div>
          <div className="gw-seam"></div>
        </div>
        <div className="gw-side__log">
          <span>{(user.email ?? "").toUpperCase()}</span>
        </div>
      </aside>
      <main id="main" className="gw-main">
        <div className="gw-panel">
          <ResetForm next={next} />
        </div>
      </main>
    </div>
  );
}
