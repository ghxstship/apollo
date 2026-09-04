import Link from "next/link";
import { Badge } from "@/components/ds";
import { logDate, logDateYear } from "@/lib/format";
import type { Tables } from "@/lib/supabase/types";

/* What a member has signed, what has lapsed, and what is still outstanding.
   The state is computed by signature_standing() rather than stored, so a new
   published version moves everyone to "out of date" the moment it lands.

   Shared between the Agreements section on You and the thin /agreements page,
   so the two cannot describe the same signature in two different tenses. */

export type StandingRow = {
  document_code: string;
  title: string;
  state: string;
  signed_at?: string | null;
  expires_at?: string | null;
};

export type CounterStanding = Tables<"agreement_standing">;

const STATE_COPY: Record<string, { label: string; tone: "positive" | "caution" | "outline"; line: string }> = {
  signed: { label: "Signed", tone: "positive", line: "On file." },
  lapsed: { label: "Out of date", tone: "caution", line: "The wording has moved on, or a year has passed." },
  missing: { label: "Not signed", tone: "caution", line: "Needed before you board." },
};

/* One standing per document: a member re-signs when wording moves on, so the
   view can hold several rows per code — the latest signature is the one the
   page is talking about. */
export function latestStanding(rows: CounterStanding[] | null | undefined): Map<string, CounterStanding> {
  const standingOf = new Map<string, CounterStanding>();
  for (const s of rows ?? []) {
    if (!s.document_code) continue;
    const held = standingOf.get(s.document_code);
    if (!held || (s.signed_at ?? "") > (held.signed_at ?? "")) standingOf.set(s.document_code, s);
  }
  return standingOf;
}

export function AgreementRow({
  row: r,
  standing,
  zone,
}: {
  row: StandingRow;
  standing: CounterStanding | undefined;
  zone: string | null;
}) {
  const copy = STATE_COPY[r.state] ?? STATE_COPY.missing;
  /* A contract binds only once the club counter-signs; a waiver stands on the
     member's signature alone. The view answers for both, so the line renders
     only where a countersignature is the question — a signed contract — and
     stays silent elsewhere. */
  const counterLine =
    r.state === "signed" && standing && standing.kind === "contract"
      ? standing.in_force
        ? `In force — countersigned by ${standing.counter_signed_by ?? "the club"}`
        : "Awaiting the club's counter-signature"
      : null;
  return (
    <li className="agr-row">
      <span>
        <b>{r.title}</b>
        <span
          style={{
            display: "block",
            fontSize: "var(--text-xs)",
            color: "var(--text-3)",
            marginTop: 2,
          }}
        >
          {copy.line}
        </span>
        {counterLine ? (
          <span
            style={{
              display: "block",
              fontSize: "var(--text-xs)",
              color: standing?.in_force ? "var(--laurel)" : "var(--text-3)",
              marginTop: 2,
            }}
          >
            {counterLine}
          </span>
        ) : null}
      </span>
      <Badge tone={copy.tone}>{copy.label}</Badge>
      {r.state === "signed" ? (
        <span className="agr-when">
          {r.signed_at ? logDate(r.signed_at, zone) : ""}
          {r.expires_at ? ` · UNTIL ${logDateYear(r.expires_at, zone)}` : ""}
        </span>
      ) : (
        <Link href={`/agreements/${r.document_code}`} className="ls-btn ls-btn--sm">
          Read and sign
        </Link>
      )}
    </li>
  );
}

/* Two lists, not one interleaved one. The set that needs something from you
   leads; the set that is done follows. */
export function AgreementLists({
  rows,
  standingOf,
  zone,
}: {
  rows: StandingRow[];
  standingOf: Map<string, CounterStanding>;
  zone: string | null;
}) {
  const outstanding = rows.filter((r) => r.state !== "signed");
  const onFile = rows.filter((r) => r.state === "signed");
  return (
    <>
      {outstanding.length > 0 ? (
        <div>
          <span className="mbr-eyebrow" style={{ display: "block", marginBottom: 4 }}>
            Needs your signature
          </span>
          <ul className="agr-list">
            {outstanding.map((r) => (
              <AgreementRow key={r.document_code} row={r} standing={standingOf.get(r.document_code)} zone={zone} />
            ))}
          </ul>
        </div>
      ) : null}
      {onFile.length > 0 ? (
        <div style={{ marginTop: outstanding.length > 0 ? 18 : 0 }}>
          <span className="mbr-eyebrow" style={{ display: "block", marginBottom: 4, color: "var(--text-3)" }}>
            On file
          </span>
          <ul className="agr-list">
            {onFile.map((r) => (
              <AgreementRow key={r.document_code} row={r} standing={standingOf.get(r.document_code)} zone={zone} />
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
