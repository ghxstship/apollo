import type { Metadata } from "next";
import { getMember } from "../data";
import { LinkButton } from "@/components/ds";

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
      <p className="ls-lede mbr-sub--sm">
        Your agreements live on your page now — each kept with the exact wording
        you agreed to and the date you agreed to it.
      </p>
      {outstanding > 0 ? (
        <p role="status" className="you-attn">
          {outstanding === 1 ? "One agreement needs your signature." : `${outstanding} agreements need your signature.`}
        </p>
      ) : null}
      <div className="mbr-sub--lg">
        <LinkButton href="/you#you-agreements" variant="gold" size="sm">
          Agreements, on You
        </LinkButton>
      </div>
    </div>
  );
}
