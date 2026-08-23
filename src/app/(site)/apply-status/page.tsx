import type { Metadata } from "next";
import Link from "next/link";
import { StatusLookup } from "./status-client";

export const metadata: Metadata = {
  alternates: { canonical: "/apply-status" },
  title: "Application status",
  description:
    "Where your application stands — applied, invited ashore, signatures, aboard. No black box.",
};

export default function ApplyStatusPage() {
  return (
    <div className="lg-wrap">
      <span
        className="ls-eyebrow"
        style={{ color: "var(--brass-deep)", display: "block", marginBottom: 16 }}
      >
        Applicants
      </span>
      <h1>Where you stand.</h1>
      <p style={{ color: "var(--text-2)", marginTop: 14, maxWidth: "54ch" }}>
        No black box, no silence. Four stages, and you can read yours any hour of the
        day. Enter the address you applied with.
      </p>

      <StatusLookup />

      <p style={{ marginTop: 40, fontSize: 13.5, color: "var(--text-2)" }}>
        Something looks wrong, or the wait has run long? <Link href="/support">Hail Shoreside</Link>{" "}
        — a human answers. Not applied yet?{" "}
        <Link href="/membership#apply">Request an invitation</Link>.
      </p>
    </div>
  );
}
