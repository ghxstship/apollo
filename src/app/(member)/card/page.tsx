import type { Metadata } from "next";
import { Badge, Button, Tooltip, Wordmark } from "@/components/ds";
import { TIER_LABEL, roman } from "@/lib/format";
import { qrDataUrl } from "@/lib/commerce-qr";
import { getMember } from "../data";

export const metadata: Metadata = { title: "Member card" };

export default async function CardPage() {
  const { supabase, user, profile } = await getMember();

  const { data: account } = await supabase
    .from("account_balance")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();
  const balanceCents = account?.balance_cents ?? 0;

  const name = profile?.full_name ?? "A member";
  const memberNo = profile?.member_no ?? "LYR-0000";
  const tier = TIER_LABEL[profile?.tier ?? "regional"] ?? "Regional";
  const joinedYear = profile?.joined_at
    ? new Date(profile.joined_at).getFullYear()
    : new Date().getFullYear();
  const qr = await qrDataUrl(memberNo);

  return (
    <div className="crd ls-fade">
      <div className="crd-card">
        <div className="crd-seam"></div>
        <div className="crd-in">
          <Wordmark size="md" inverse />
          <div className="crd-name">{name}</div>
          <div className="crd-meta">
            {memberNo} · {tier}
          </div>
          <div className="crd-est">EST. {roman(joinedYear)} · MARINA DEL REY</div>
          <div className="crd-code" aria-label={`Boarding code ${memberNo}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URI QR, no next/image benefit */}
            <img
              src={qr}
              alt="Boarding code"
              width={164}
              height={164}
              style={{ display: "block", marginInline: "auto" }}
            />
            <div
              className="mbr-mono"
              style={{ color: "var(--text-inverse-2)", letterSpacing: ".18em", marginTop: 10 }}
            >
              {memberNo}
            </div>
          </div>
          {balanceCents < 0 ? (
            <div
              className="mbr-mono"
              style={{ marginTop: 14, color: "var(--text-inverse-2)", letterSpacing: ".14em" }}
            >
              ACCOUNT — ${(Math.abs(balanceCents) / 100).toFixed(2)} DUE
            </div>
          ) : null}
          <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
            <Badge tone="outline" inverse>
              Scan at the gangway
            </Badge>
          </div>
        </div>
      </div>
      <p className="crd-note">
        Turn the brightness up at the gangway. The skipper knows the rest.
      </p>
      <div className="crd-acts">
        <Tooltip label="Soon.">
          <Button variant="outline" disabled>
            Add to wallet
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
