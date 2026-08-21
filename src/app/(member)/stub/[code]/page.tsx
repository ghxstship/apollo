import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { Badge, StateBlock } from "@/components/ds";
import { TIER_LABEL, logDate, logTime } from "@/lib/format";
import { qrDataUrl } from "@/lib/commerce-qr";
import { getMember } from "../../data";
import { PrintButton } from "../../card/print-button";

export const metadata: Metadata = { title: "Boarding stub" };

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
        style={{ color: "var(--text-inverse-1)", fontSize: 11, textAlign: "right" }}
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
  const { code } = await params;
  const { supabase, user, profile } = await getMember();

  /* A code is either a member's own pass or one of their guests'. */
  const [memberPassRes, guestRes] = await Promise.all([
    supabase.from("rsvps").select("*").eq("boarding_code", code).maybeSingle(),
    supabase.from("rsvp_guests").select("*").eq("boarding_code", code).maybeSingle(),
  ]);
  const guest = memberPassRes.data ? null : guestRes.data;
  const { data: rsvp } = guest
    ? await supabase.from("rsvps").select("*").eq("id", guest.rsvp_id).maybeSingle()
    : memberPassRes;

  /* Members read the whole manifest; a stub belongs to its host alone. */
  const isStaff = profile?.is_staff ?? false;
  if (!rsvp || (rsvp.profile_id !== user.id && !isStaff)) {
    return (
      <div className="mbr-sec">
        <StateBlock
          status="empty"
          icon="Ticket"
          title="No stub under that code."
          detail="Confirm a pass on the manifest and the stub is cut for you."
        />
      </div>
    );
  }

  /* Staff read any stub; the host's own details head it either way. */
  const { data: host } =
    rsvp.profile_id === user.id
      ? { data: profile }
      : await supabase
          .from("profiles")
          .select("full_name, member_no, tier")
          .eq("id", rsvp.profile_id)
          .maybeSingle();

  const [voyageRes, capRes, addonRowsRes] = await Promise.all([
    supabase.from("voyages").select("*").eq("id", rsvp.voyage_id).maybeSingle(),
    supabase.from("voyage_capacity").select("*").eq("voyage_id", rsvp.voyage_id).maybeSingle(),
    supabase.from("rsvp_addons").select("*").eq("rsvp_id", rsvp.id),
  ]);
  const voyage = voyageRes.data;
  if (!voyage) {
    return (
      <div className="mbr-sec">
        <StateBlock
          status="empty"
          icon="Ticket"
          title="No stub under that code."
          detail="Confirm a pass on the manifest and the stub is cut for you."
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
  const berthsTotal = capRes.data?.berths_total ?? voyage.berths_total;
  const qr = await qrDataUrl(code);
  const name = host?.full_name ?? "A member";
  const memberNo = host?.member_no ?? "LYR-0000";
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
              fontSize: 24,
              color: "var(--bone, #F2F2F4)",
              marginTop: 14,
            }}
          >
            {voyage.title}
          </div>

          <div style={{ marginTop: 16 }}>
            <Row label="DEPARTS" value={`${logDate(voyage.starts_at)} · ${logTime(voyage.starts_at)}`} />
            <Row label="MUSTER" value={voyage.muster ?? "GANGWAY B-12"} />
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
              style={{ color: "var(--text-inverse-1)", fontSize: 11 }}
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
      {/* Print: the stub alone, edge to edge, colors exact. */}
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body { background: #fff !important; }
          .mbr-top, .mbr-tabbar, .pr-fab, .pr-panel, .crd-note, .crd-acts { display: none !important; }
          .mbr-shell, .mbr-main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
          .crd { padding: 0 !important; }
          .ls-fade { animation: none !important; opacity: 1 !important; }
          .crd-card {
            width: 100% !important;
            max-width: 480px !important;
            margin-inline: auto !important;
            border-color: #060607 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .crd-seam { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
