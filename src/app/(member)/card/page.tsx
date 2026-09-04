import type { Metadata } from "next";
import { headers } from "next/headers";
import { CopyLink } from "@/components/copy-link";
import { Badge, Wordmark } from "@/components/ds";
import { SITE_DOMAIN, SURFACES } from "@/lib/brand";
import { TIER_LABEL, roman, yearIn } from "@/lib/format";
import { qrDataUrl } from "@/lib/commerce-qr";
import { memberMark } from "@/lib/membership";
import { PassageLog, readPassageLog } from "@/components/member/passage-log";
import { getMember } from "../data";
import { PrintButton } from "./print-button";
import { RotateFeed } from "./rotate-feed";

export const metadata: Metadata = { title: SURFACES.passbook };

export default async function MemberCardPage() {
  const { supabase, user, profile, zone } = await getMember();

  const { log, marks } = await readPassageLog(supabase, user.id);

  const { data: account } = await supabase
    .from("account_balance")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();
  const balanceCents = account?.balance_cents ?? 0;

  const name = profile?.full_name ?? "A member";
  /* The number as the card sets it — "Nº 0047" — and the raw column only
     inside the QR, which is a scanner payload and not something a reader
     sees. Printed cards in wallets still carry the retired prefix, so the
     gate has to keep matching it; what changes is what is legible. */
  const memberNo = profile?.member_no ?? "";
  const shownNo = memberMark(memberNo) || "Unissued";
  const tier = TIER_LABEL[profile?.tier ?? "regional"] ?? "Regional";
  /* On the member's own clock — getFullYear() reads the render host's. */
  const joinedYear = yearIn(profile?.joined_at ?? new Date().toISOString(), zone);
  const qr = await qrDataUrl(memberNo || "unissued");

  /* Season feed — public by secret, so the address is the whole key. */
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? SITE_DOMAIN;
  const proto = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const feedPath = profile?.calendar_token ? `/api/calendar/${profile.calendar_token}` : null;
  const feedUrl = feedPath ? `${proto}://${host}${feedPath}` : null;
  const webcalUrl = feedPath ? `webcal://${host}${feedPath}` : null;

  return (
    <div className="crd ls-fade">
      {/* The page had no heading at all — the nav and the title said Member
          Card and the document itself said nothing, so it was the one surface
          where the four names could not be checked against each other. It is
          hidden from print, like the note and the buttons: what prints is the
          card. */}
      <h1 className="mbr-h1 crd-title">{SURFACES.passbook}.</h1>
      <div className="crd-card">
        <div className="crd-seam"></div>
        <div className="crd-in">
          <Wordmark size="md" suffix={null} inverse />
          <div className="crd-name">{name}</div>
          <div className="crd-meta">
            {shownNo} · {tier}
          </div>
          {/* The card carries the club's founding, not a harbour the member
              may never have set. */}
          <div className="crd-est">EST. {roman(joinedYear)}</div>
          <div className="crd-code" aria-label={`Boarding code ${shownNo}`}>
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
              {shownNo}
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
        Your member card is your boarding pass. Turn the brightness up at the gangway — the skipper knows the rest.
      </p>
      <div className="crd-acts">
        <PrintButton label="Print or save" />
      </div>

      {feedUrl && webcalUrl ? (
        <section
          className="crd-feed"
          style={{
            marginTop: 34,
            width: "min(480px, 100%)",
            background: "var(--surface-card)",
            border: "1px solid var(--line-faint)",
            padding: "18px 20px",
          }}
        >
          <span className="mbr-eyebrow" style={{ display: "block", color: "var(--text-3)" }}>
            Subscribe to your season
          </span>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", marginTop: 8, maxWidth: "44ch" }}>
            Every episode you are confirmed on, in your own calendar, kept current as the
            season moves. Subscribe once — new boarding passes arrive on their own.
          </p>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: "1px solid var(--line-faint)",
              padding: "8px 8px 8px 12px",
            }}
          >
            <span
              className="mbr-mono"
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textTransform: "none",
              }}
            >
              {webcalUrl}
            </span>
            <CopyLink value={webcalUrl} label="Copy" toast="Season feed address copied." />
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 16, alignItems: "center" }}>
            <a href={webcalUrl} className="mbr-mono" style={{ textTransform: "none" }}>
              Add to calendar
            </a>
            <a href={feedUrl} className="mbr-mono" style={{ textTransform: "none" }}>
              Download the file
            </a>
          </div>
          <p className="mbr-mono" style={{ marginTop: 12 }}>
            THIS ADDRESS IS YOURS ALONE — ANYONE HOLDING IT READS YOUR SEASON
          </p>
          {/* The way back from an address that got out. The action and the
              dialog existed; nothing on this page mounted them, so the warning
              above was all a member had. */}
          <div style={{ marginTop: 10 }}>
            <RotateFeed />
          </div>
        </section>
      ) : null}
      <div style={{ width: "min(680px, 100%)" }}>
        <PassageLog zone={zone} log={log} marks={marks} own />
      </div>

      {/* Print — the card alone, edge to edge, colours exact — is one rule in
          member.css that this page and the stub both inherit. */}
    </div>
  );
}
