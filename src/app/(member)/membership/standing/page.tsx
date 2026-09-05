import type { Metadata } from "next";
import { LinkButton } from "@/components/ds";

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
      <p className="ls-lede mbr-sub--sm">
        Your standing lives on your page now — the rotating code, the lifecycle
        and your pause days, in one place with the rest of your papers.
      </p>
      <div className="ls-acts mbr-sub--lg">
        <LinkButton href="/you#you-standing" variant="gold" size="sm">
          Standing, on You
        </LinkButton>
        <LinkButton href="/card" variant="outline" size="sm">
          Member Card
        </LinkButton>
        <LinkButton href="/membership" variant="outline" size="sm">
          What the club sells
        </LinkButton>
      </div>
    </div>
  );
}
