import type { Metadata } from "next";
import Link from "next/link";
import { SettledNotice } from "./settle-card";

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
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        Portal.
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-2)", marginTop: 8, maxWidth: "52ch" }}>
        The knots ledger, the league you ride at and the rewards they buy are on
        your page now. What stands on your account is on Account.
      </p>
      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/you#you-knots" className="ls-btn ls-btn--gold ls-btn--sm">
          Knots and rewards, on You
        </Link>
        <Link href="/you#you-invite" className="ls-btn ls-btn--outline ls-btn--sm">
          Bring a good one
        </Link>
        <Link href="/account" className="ls-btn ls-btn--outline ls-btn--sm">
          Account statement
        </Link>
      </div>
      {settled === "1" ? <SettledNotice /> : null}
    </div>
  );
}
