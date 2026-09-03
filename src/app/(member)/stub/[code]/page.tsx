import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { Badge, StateBlock } from "@/components/ds";
import { TIER_LABEL, logDate, logTime } from "@/lib/format";
import { SURFACES } from "@/lib/brand";
import { qrDataUrl } from "@/lib/commerce-qr";
import { literalCode } from "@/lib/boarding-code";
import { getMember } from "../../data";
import { PrintButton } from "../../card/print-button";

/* The page is the credential, so it is named for the credential: a Boarding
   pass is what admits a member to one episode, and the stub is the form it
   takes on a phone at the gangway. */
export const metadata: Metadata = { title: "Boarding pass" };

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 16,
  padding: "9px 0",
  borderTop: "1px solid var(--line-inverse-faint)",
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={rowStyle}>
      <span
        className="mbr-mono"
        style={{ color: "var(--text-inverse-3)", letterSpacing: ".14em" }}
      >
        {label}
      </span>
      <span
        className="mbr-mono"
        style={{ color: "var(--text-inverse-1)", fontSize: "var(--text-xs)", textAlign: "right" }}
      >
        {value}
      </span>
    </div>
  );
}

export default async function StubPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const { supabase, user, profile } = await getMember();

  /* The fourth path. src/lib/boarding-code.ts names the scan paths that must
     map retired prefixes onto the current one, and this route — the one a
     member reaches from a printed or bookmarked stub URL — was the one that
     didn't. A SYR- link answered "No stub under that code" for a pass that
     exists. */
  const code = literalCode(rawCode);

  /* A code is either a member's own pass or one of their guests'. */
  const [memberPassRes, guestRes] = await Promise.all([
    supabase.from("passes").select("*").eq("boarding_code", code).maybeSingle(),
    supabase.from("pass_guests").select("*").eq("boarding_code", code).maybeSingle(),
  ]);
  const guest = memberPassRes.data ? null : guestRes.data;
  const { data: rsvp } = guest
    ? await supabase.from("passes").select("*").eq("id", guest.rsvp_id).maybeSingle()
    : memberPassRes;

  /* Members read the whole manifest; a stub belongs to its host alone. */
  const isStaff = profile?.is_staff ?? false;
  if (!rsvp || (rsvp.profile_id !== user.id && !isStaff)) {
    /* A hand-off clears the code and the new holder is cut a fresh one, so a
       stub the member printed before offering the pass now answers nothing.
       Best effort: pass_transfers keeps no record of the old code, only of the
       transfer — so a member with ANY accepted hand-off out of their name is
       told the likely truth, and everyone else keeps the generic line. */
    let changedHands = false;
    if (!rsvp) {
      const { data: handedOff } = await supabase
        .from("pass_transfers")
        .select("id")
        .eq("from_profile", user.id)
        .eq("status", "accepted")
        .limit(1);
      changedHands = (handedOff ?? []).length > 0;
    }
    return (
      <div className="mbr-sec">
        <StateBlock
          status="empty"
          icon="Ticket"
          title={
            changedHands
              ? "That boarding pass changed hands — the new holder carries its code."
              : "No stub under that code."
          }
          detail="Claim a pass on the Passes page and the stub is cut for you."
        />
      </div>
    );
  }

  /* Staff read any stub; the host's own details head it either way. */
  const { data: host } =
    rsvp.profile_id === user.id
      ? { data: profile }
      : await supabase
          .from("member_directory")
          .select("full_name, member_no, tier")
          .eq("id", rsvp.profile_id)
          .maybeSingle();

  const [voyageRes, capRes, addonRowsRes] = await Promise.all([
    supabase.from("episodes").select("*").eq("id", rsvp.episode_id).maybeSingle(),
    supabase.from("episode_capacity").select("*").eq("episode_id", rsvp.episode_id).maybeSingle(),
    supabase.from("pass_addons").select("*").eq("rsvp_id", rsvp.id),
  ]);
  const episode = voyageRes.data;

  /* A stub is a boarding pass you can present. It was rendered live — QR, muster time,
     "Present at the gangway" — for a pass that had been released and for
     episodes that were completed or called off, so it stayed scannable long
     after it stopped meaning anything. */
  /* Server-rendered per request, so "now" is request time. */
  const nowMs = new Date().getTime();
  /* A guest stub rides on the host's pass. Exempting guests from this check
     meant the host could release and their guest's stub stayed live and
     scannable — the gangway walked a guest aboard whose host held nothing. The
     rsvp here is the host's either way, so one rule covers both. */
  const passHeld = rsvp.status === "aboard";
  const voyageOver =
    episode &&
    (episode.status === "cancelled" ||
      episode.status === "completed" ||
      new Date(episode.starts_at).getTime() < nowMs);
  if (episode && (!passHeld || voyageOver)) {
    return (
      <div className="mbr-sec">
        <StateBlock
          status="empty"
          icon="Ticket"
          title={
            episode.status === "cancelled"
              ? "That episode was called off."
              : voyageOver
                ? "That episode is in the log."
                : "That boarding pass is no longer held."
          }
          detail={
            episode.status === "cancelled"
              ? "Anything reserved against it was credited in full. The Passes page holds the next open water."
              : voyageOver
                ? `The stub is spent. What happened is in ${SURFACES.magazine}.`
                : "Claim it again on the Passes page and a fresh stub is cut for you."
          }
        />
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="mbr-sec">
        <StateBlock
          status="empty"
          icon="Ticket"
          title="No stub under that code."
          detail="Claim a pass on the Passes page and the stub is cut for you."
        />
      </div>
    );
  }

  const addonIds = (addonRowsRes.data ?? []).map((a) => a.addon_id);
  const { data: addonRows } = addonIds.length
    ? await supabase.from("addons").select("*").in("id", addonIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const addonNames = new Map((addonRows ?? []).map((a) => [a.id, a.name]));
  const purchased = (addonRowsRes.data ?? []).map((a) => ({
    name: addonNames.get(a.addon_id) ?? "Add-on",
    qty: a.qty,
  }));

  const aboard = capRes.data?.aboard ?? 0;
  const berthsTotal = capRes.data?.passes_total ?? episode.passes_total;
  const qr = await qrDataUrl(code);
  const name = host?.full_name ?? "A member";
  const memberNo = host?.member_no ?? "UN-0000";
  const tier = TIER_LABEL[host?.tier ?? "regional"] ?? "Regional";

  return (
    <div className="crd ls-fade">
      <div className="crd-card" style={{ textAlign: "left" }}>
        <div className="crd-seam"></div>
        <div className="crd-in">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              className="mbr-mono"
              style={{ color: "var(--text-inverse-2)", letterSpacing: ".18em" }}
            >
              {guest ? "GUEST STUB" : "BOARDING STUB"}
            </span>
            <Badge tone="gold" inverse>
              {tier}
            </Badge>
          </div>

          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-xl)",
              color: "var(--bone)",
              marginTop: 14,
            }}
          >
            {episode.title}
          </div>

          <div style={{ marginTop: 16 }}>
            <Row label="DEPARTS" value={`${logDate(episode.starts_at, episode.time_zone)} · ${logTime(episode.starts_at, episode.time_zone)}`} />
            <Row label="MUSTER" value={episode.muster ?? "GANGWAY B-12"} />
            <Row label="MANIFEST" value={`${aboard}/${berthsTotal} ABOARD`} />
            {guest ? (
              <>
                <Row label="GUEST" value={guest.name.toUpperCase()} />
                <Row label="GUEST OF" value={`${name.toUpperCase()} · ${memberNo}`} />
              </>
            ) : (
              <Row label="MEMBER" value={`${name.toUpperCase()} · ${memberNo}`} />
            )}
            <Row label="CODE" value={code} />
            {purchased.length > 0 ? (
              <Row
                label="ADD-ONS"
                value={purchased
                  .map((a) => `${a.name.toUpperCase()}${a.qty > 1 ? ` ×${a.qty}` : ""}`)
                  .join(" · ")}
              />
            ) : null}
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URI QR, no next/image benefit */}
            <img src={qr} alt="Boarding code" width={168} height={168} />
          </div>

          <div
            style={{
              ...rowStyle,
              marginTop: 18,
              borderTop: "1px dashed var(--line-inverse)",
            }}
          >
            <span
              className="mbr-mono"
              style={{ color: "var(--text-inverse-3)", letterSpacing: ".14em" }}
            >
              CONDITIONS
            </span>
            <span
              className="mbr-mono"
              style={{ color: "var(--text-inverse-1)", fontSize: "var(--text-xs)" }}
            >
              CHECK 18:00 NIGHT BEFORE
            </span>
          </div>
        </div>
      </div>
      <p className="crd-note">Present at the gangway.</p>
      <div className="crd-acts">
        <PrintButton label="Print the stub" />
      </div>
      {/* Print — the stub alone, edge to edge, colours exact — is one rule in
          member.css that this page and the Member Card both inherit. */}
    </div>
  );
}
