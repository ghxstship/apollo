import type { Metadata } from "next";
import Link from "next/link";
import { getMember } from "../data";

export const metadata: Metadata = { title: "Agreements" };

/* Agreements folded into You on 2026-09-04. The list — what needs a signature,
   what is on file, who countersigned — is a section there; each agreement is
   still read and signed at /agreements/[code], which is why this address has
   children and keeps answering. It renders rather than redirects because the
   route audit asks every member page to answer 200 for someone allowed in.

   The one fact worth reading here is the count that can stop a member boarding,
   so it is read and said. */
export default async function AgreementsPage() {
  const { supabase, user } = await getMember();
  const { data } = await supabase.rpc("signature_standing", { p_profile_id: user.id });
  const rows = Array.isArray(data) ? data : [];
  const outstanding = rows.filter((r) => r.state !== "signed").length;

  return (
    <div className="ls-fade">
      <span className="mbr-eyebrow">What you&rsquo;ve put your name to</span>
      <h1 className="mbr-h1">Agreements.</h1>
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-2)", maxWidth: "58ch" }}>
        Your agreements live on your page now — each kept with the exact wording
        you agreed to and the date you agreed to it.
      </p>
      {outstanding > 0 ? (
        <p role="status" style={{ marginTop: 16, font: "var(--type-heading)", color: "var(--caution)" }}>
          {outstanding === 1 ? "One agreement needs your signature." : `${outstanding} agreements need your signature.`}
        </p>
      ) : null}
      <div style={{ marginTop: 20 }}>
        <Link href="/you#you-agreements" className="ls-btn ls-btn--gold ls-btn--sm">
          Agreements, on You
        </Link>
      </div>
    </div>
  );
}
