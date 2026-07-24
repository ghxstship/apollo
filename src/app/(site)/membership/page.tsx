import type { Metadata } from "next";
import { Badge, Card } from "@/components/ds";
import { SectionHeader } from "@/components/site/section-header";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = {
  title: "Membership",
  description:
    "Three ways aboard — Regional, National, Global. Membership is by invitation or application.",
};

const TIERS: Array<{
  id: string;
  name: string;
  blurb: string;
  dues: string;
  feats: string[];
  featured?: boolean;
}> = [
  {
    id: "regional",
    name: "Regional",
    blurb: "Your home harbor",
    dues: "$1,800 / year",
    feats: [
      "Every event at your harbor — sea, port, overnight",
      "The Dispatch, Sundays",
      "The Wardroom and crew threads",
      "Fathoms on every mile",
    ],
  },
  {
    id: "national",
    name: "National",
    blurb: "All US harbors",
    dues: "$3,600 / year",
    feats: [
      "Everything in Regional",
      "All domestic harbors — travel, then board",
      "Reciprocal salon seats coast to coast",
      "Waitlist priority in launching harbors",
    ],
  },
  {
    id: "global",
    name: "Global",
    blurb: "All-access international",
    dues: "$7,200 / year",
    feats: [
      "Everything in National",
      "Every harbor worldwide, international voyages included",
      "Berth priority all season",
      "Two guest passes per event",
    ],
    featured: true,
  },
];

const FATHOMS: Array<[string, string]> = [
  ["10 FM / NM", "Every nautical mile under sail banks ten fathoms to your ledger."],
  ["40 FM / salon", "A night ashore counts. Long tables, records, the golden hour."],
  ["250 FM / referral", "When someone you sent comes aboard, the ledger remembers."],
];

export default function MembershipPage() {
  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">The manifest</span>
        <h1>Three ways aboard.</h1>
        <p className="ws-phead__sub">
          Membership is by invitation or application. Dues keep berths few and
          tables long — access follows geography, not status.
        </p>
      </div>

      <div className="ls-grid-3" style={{ marginTop: 48 }}>
        {TIERS.map((t) => (
          <Card
            key={t.id}
            tone={t.featured ? "sea" : "shore"}
            eyebrow={t.blurb}
            title={t.name}
          >
            <div className="ws-mprice">{t.dues}</div>
            {t.featured ? (
              <div style={{ margin: "10px 0 2px" }}>
                <Badge tone="brass">Most aboard</Badge>
              </div>
            ) : null}
            <ul className="ws-mfeat">
              {t.feats.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <div className="ws-fathoms">
        <div>
          <span className="ws-fathoms__n">Fathoms</span>
          <p>
            The club&rsquo;s ledger runs in fathoms, not likes — earned on the water,
            spent on rewards money can&rsquo;t buy here. They never expire while
            you&rsquo;re aboard, and they gift forward if you ever depart.
          </p>
        </div>
        {FATHOMS.map(([n, body]) => (
          <div key={n}>
            <span className="ws-fathoms__n">{n}</span>
            <p>{body}</p>
          </div>
        ))}
      </div>

      <div className="ws-apply" id="apply">
        <SectionHeader eyebrow="Crew wanted, member first" title="Request invitation." />
        <p style={{ color: "var(--text-2)", maxWidth: "52ch", marginTop: -24 }}>
          A person reads every application. Two member signatures shorten the wait;
          one salon as a guest usually settles it.
        </p>
        <ApplyForm />
      </div>
    </div>
  );
}
