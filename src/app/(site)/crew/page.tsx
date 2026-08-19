import type { Metadata } from "next";
import { SectionHeader } from "@/components/site/section-header";
import { MAILBOX } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Crew wanted",
  description: "Work the water. Small crew, high standard, good light.",
};

const ROLES: Array<{
  title: string;
  dept: string;
  type: string;
  port: string;
  blurb: string;
}> = [
  {
    title: "Deckhand",
    dept: "Deck",
    type: "Part time",
    port: "Miami",
    blurb:
      "Rig, teach, tell the truth about the weather. ASA cert or equivalent scar tissue.",
  },
  {
    title: "Port Day lead",
    dept: "Ashore",
    type: "Full time",
    port: "Los Angeles",
    blurb:
      "Own the land half of the club — long tables, records, the golden hour. Hospitality background, allergic to boring rooms.",
  },
  {
    title: "Harbormaster ops",
    dept: "Shoreside",
    type: "Full time",
    port: "Miami",
    blurb:
      "Run the manifest, the gangway, and the weather calls. The first voice a member hears and the last one off the dock.",
  },
  {
    title: "Aurora AI engineering",
    dept: "Engineering",
    type: "Full time",
    port: "Remote",
    blurb:
      "Build the ledger, the manifest, and Aurora AI — the agent that minds them. TypeScript on the surface, judgment underneath.",
  },
];

export default function CrewPage() {
  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">Crew wanted</span>
        <h1>Work the water.</h1>
        <p className="ws-phead__sub">
          Small crew, high standard, good light. We hire people who&rsquo;d do the
          job on their day off — and then we make sure they don&rsquo;t have to.
        </p>
      </div>
      <div style={{ padding: "64px 0 96px" }}>
        <SectionHeader eyebrow="Open roles" title="Four seats on the crew side." />
        {ROLES.map((r) => (
          <div className="ws-ledger-row" key={r.title}>
            <div>
              <div className="ws-ledger-row__t">{r.title}</div>
              <div className="ws-ledger-row__m">
                <span>{r.dept}</span>
                <span>·</span>
                <span>{r.type}</span>
                <span>·</span>
                <span>{r.port}</span>
              </div>
              <p className="ws-ledger-row__body">{r.blurb}</p>
            </div>
            <a
              className="ls-btn ls-btn--outline ls-btn--sm"
              href={`mailto:${MAILBOX.crew}?subject=${encodeURIComponent(`Crew wanted — ${r.title}, ${r.port}`)}`}
            >
              Apply
            </a>
          </div>
        ))}
        <p style={{ marginTop: 24, fontSize: 13, color: "var(--text-3)" }}>
          Nothing that fits? Write to{" "}
          <a href={`mailto:${MAILBOX.crew}`}>{MAILBOX.crew}</a> anyway — good hands
          find a place aboard.
        </p>
      </div>
    </div>
  );
}
