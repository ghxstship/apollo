import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Standing" };

/* Standing folded into You on 2026-09-04 — the credential, the lifecycle and
   the pause allowance are one section there, beside the rest of the ship's
   papers. This address stays so nothing that pointed here 404s: a bookmark, a
   letter, a notice written before the fold. It answers 200 and says where the
   thing went, rather than redirecting, because the route audit asks every
   member page to render for someone allowed to see it.

   The five products the club sells are on the public membership page; they
   were the one part of the old Standing page that was not about this member. */
export default function StandingPage() {
  return (
    <div className="ls-fade">
      <span className="mbr-eyebrow">Membership · the card and the record</span>
      <h1 className="mbr-h1">Standing.</h1>
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-2)", maxWidth: "52ch" }}>
        Your standing lives on your page now — the rotating code, the lifecycle
        and your pause days, in one place with the rest of your papers.
      </p>
      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/you#you-standing" className="ls-btn ls-btn--gold ls-btn--sm">
          Standing, on You
        </Link>
        <Link href="/card" className="ls-btn ls-btn--outline ls-btn--sm">
          Member Card
        </Link>
        <Link href="/membership" className="ls-btn ls-btn--outline ls-btn--sm">
          What the club sells
        </Link>
      </div>
    </div>
  );
}
