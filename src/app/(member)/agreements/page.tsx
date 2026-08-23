import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ds";
import { logDate, logDateYear } from "@/lib/format";
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
  const { supabase, user } = await getMember();
  const { data } = await supabase.rpc("signature_standing", { p_profile_id: user.id });
  const rows = Array.isArray(data) ? data : [];

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
                  </span>
                  <Badge tone={copy.tone}>{copy.label}</Badge>
                  {r.state === "signed" ? (
                    <span className="agr-when">
                      {r.signed_at ? logDate(r.signed_at) : ""}
                      {r.expires_at ? ` · UNTIL ${logDateYear(r.expires_at)}` : ""}
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
