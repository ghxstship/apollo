import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ds";
import { logDate, logDateYear } from "@/lib/format";
import type { Tables } from "@/lib/supabase/types";
import { getMember } from "../data";

export const metadata: Metadata = { title: "Agreements" };

/* What a member has signed, what has lapsed, and what is still outstanding.
   The state is computed by signature_standing() rather than stored, so a new
   published version moves everyone to "out of date" the moment it lands. */

const STATE_COPY: Record<string, { label: string; tone: "positive" | "caution" | "outline"; line: string }> = {
  signed: { label: "Signed", tone: "positive", line: "On file." },
  lapsed: { label: "Out of date", tone: "caution", line: "The wording has moved on, or a year has passed." },
  missing: { label: "Not signed", tone: "caution", line: "Needed before you board." },
};

export default async function AgreementsPage() {
  const { supabase, user, zone } = await getMember();
  const [{ data }, { data: standingRows }] = await Promise.all([
    supabase.rpc("signature_standing", { p_profile_id: user.id }),
    /* agreement_standing is a definer view that scopes itself to the caller —
       it exists because counter_signatures is staff-only (the row carries the
       officer's IP), so the member's own client cannot join it directly. It
       exposes only the officer's name and the date. The eq is belt-and-braces
       for a staff viewer, whom the view does not scope. */
    supabase.from("agreement_standing").select("*").eq("profile_id", user.id),
  ]);
  const rows = Array.isArray(data) ? data : [];

  /* One standing per document: a member re-signs when wording moves on, so the
     view can hold several rows per code — the latest signature is the one the
     page is talking about. */
  const standingOf = new Map<string, Tables<"agreement_standing">>();
  for (const s of standingRows ?? []) {
    if (!s.document_code) continue;
    const held = standingOf.get(s.document_code);
    if (!held || (s.signed_at ?? "") > (held.signed_at ?? "")) standingOf.set(s.document_code, s);
  }

  const outstanding = rows.filter((r) => r.state !== "signed");

  return (
    <div className="ls-fade">
      <span className="mbr-eyebrow">Agreements</span>
      <h1 className="mbr-h1">What you&rsquo;ve put your name to.</h1>
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-2)", maxWidth: "58ch" }}>
        Each one is kept with the exact wording you agreed to and the date you
        agreed to it. When the wording changes, you&rsquo;ll be asked again — the
        old copy stays as it was.
      </p>

      {outstanding.length > 0 ? (
        <p
          role="status"
          style={{ marginTop: 16, fontSize: 13.5, color: "var(--clay)" }}
        >
          {outstanding.length === 1
            ? "One agreement needs your signature."
            : `${outstanding.length} agreements need your signature.`}
        </p>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow">On file</span>
        {rows.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            Nothing to sign yet.
          </p>
        ) : (
          <ul className="agr-list">
            {rows.map((r) => {
              const copy = STATE_COPY[r.state] ?? STATE_COPY.missing;
              /* A contract binds only once the club counter-signs; a waiver
                 stands on the member's signature alone. The view answers for
                 both, so the line renders only where a countersignature is the
                 question — a signed contract — and stays silent elsewhere. */
              const standing = standingOf.get(r.document_code);
              const counterLine =
                r.state === "signed" && standing && standing.kind === "contract"
                  ? standing.in_force
                    ? `In force — countersigned by ${standing.counter_signed_by ?? "the club"}`
                    : "Awaiting the club's counter-signature"
                  : null;
              return (
                <li key={r.document_code} className="agr-row">
                  <span>
                    <b>{r.title}</b>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12.5,
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
                          fontSize: 12.5,
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
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
