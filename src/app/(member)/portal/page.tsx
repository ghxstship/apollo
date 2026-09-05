import type { Metadata } from "next";
import { SettledNotice } from "./settle-card";
import { LinkButton } from "@/components/ds";

export const metadata: Metadata = { title: "Portal" };

/* The Portal folded into You on 2026-09-04: the knots ledger, the rewards and
   the invite are sections there, and the account statement was already on
   Account. This address stays because a great deal points at it — every
   knots notice the database has ever written derives its href here, and the
   card checkout returns to /portal?settled=1 — so it answers 200 and says
   where each thing went. The settled toast still fires here, because that is
   where the processor sends the member back. */
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ settled?: string }>;
}) {
  const { settled } = await searchParams;
  return (
    <div className="ls-fade">
      <span className="mbr-eyebrow">Knots · Leagues · Rewards</span>
      <h1 className="mbr-h1">Portal.</h1>
      <p className="ls-lede mbr-sub--sm">
        The knots ledger, the league you ride at and the rewards they buy are on
        your page now. What stands on your account is on Account.
      </p>
      <div className="ls-acts mbr-sub--lg">
        <LinkButton href="/you#you-knots" variant="gold" size="sm">
          Knots and rewards, on You
        </LinkButton>
        <LinkButton href="/you#you-invite" variant="outline" size="sm">
          Bring a good one
        </LinkButton>
        <LinkButton href="/account" variant="outline" size="sm">
          Account statement
        </LinkButton>
      </div>
      {settled === "1" ? <SettledNotice /> : null}
    </div>
  );
}
