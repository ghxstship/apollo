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
      {/* Route = nav = title = h1: Shoreside links here as the application
          status page and the tab says the same, so the h1 does too. */}
      <header className="lg-head">
        <span className="ls-eyebrow ls-eyebrow--page">Applicants · Where you stand</span>
        <h1>Application status.</h1>
        <p className="lg-lede">
          No black box, no silence. Four stages, and you can read yours any hour of the
          day. Enter the address you applied with.
        </p>
      </header>

      <StatusLookup />

      <p className="lg-after">
        Something looks wrong, or the wait has run long? <Link href="/support">Hail Shoreside</Link>{" "}
        — a human answers. Not applied yet?{" "}
        <Link href="/membership#apply">Request an invitation</Link>.
      </p>
    </div>
  );
}
