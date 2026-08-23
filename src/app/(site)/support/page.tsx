import type { Metadata } from "next";
import Link from "next/link";
import { MAILBOX } from "@/lib/brand";

export const metadata: Metadata = {
  alternates: { canonical: "/support" },
  title: "Shoreside",
  description: "Shoreside — the shore desk. Answers first, a human always.",
};

const FAQS: Array<[string, Array<[string, string]>]> = [
  [
    "Getting aboard",
    [
      [
        "I applied. Now what?",
        "A person reads it, a Port Day invite follows within the week, two members sign, and you're aboard. No black box — read where you stand at any hour on the application status page.",
      ],
      [
        "Can I visit before joining?",
        "Yes — that's the point. Redeem a member's invite code for one Port Day as their guest.",
      ],
      [
        "I've never sailed.",
        "Perfect. Instruction is included at every tier; day sails are built for first reefs. Swim 200 meters and mind the boom.",
      ],
    ],
  ],
  [
    "Dues and passes",
    [
      [
        "How do refunds work?",
        "Release a pass 48 hours out or more for full credit. No-shows forfeit the deposit to the galley fund. Weather holds roll everything forward untouched.",
      ],
      [
        "Can I pause my membership?",
        "Weather-hold it from the member app — dues pause, knots and league keep. Resume with a word.",
      ],
      [
        "What are knots worth?",
        "Ten per nautical mile, forty per Port Day, two hundred fifty per referral who joins. More knots, farther water — spend them on rewards money can't buy here.",
      ],
    ],
  ],
  [
    "On the day",
    [
      [
        "Where do I muster?",
        "Gangway B-12, Marina del Rey, thirty minutes before cast off. The gate code rides with your boarding stub.",
      ],
      [
        "What if weather turns?",
        "Holds are called by 18:00 the night before — a word, not an apology. Your pass carries over.",
      ],
      [
        "Can I bring a guest?",
        "Two per event on Global passes. Everyone signs the manifest at the gangway.",
      ],
    ],
  ],
];

export default function SupportPage() {
  return (
    <div className="lg-wrap">
      <span className="ls-eyebrow" style={{ color: "var(--brass-deep)", display: "block", marginBottom: 16 }}>
        Shoreside — the shore desk
      </span>
      <h1>Hail us.</h1>
      <p style={{ color: "var(--text-2)", marginTop: 14, maxWidth: "54ch" }}>
        Shoreside answers first, files second, a human always. Most of what the
        water asks is already answered below.
      </p>

      <div className="sp-faq">
        {FAQS.map(([group, items]) => (
          <div key={group}>
            <div className="sp-group">{group}</div>
            {items.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        ))}
      </div>

      <div className="sp-contact">
        <div>
          <div>
            <b>Write</b>
            <p>
              <a href={`mailto:${MAILBOX.shore}`}>{MAILBOX.shore}</a> — Shoreside
              answers, usually within the hour. Plain words beat long ones.
            </p>
            <p style={{ marginTop: 10 }}>
              Press and partnerships:{" "}
              <a href={`mailto:${MAILBOX.signal}`}>{MAILBOX.signal}</a>
            </p>
          </div>
          <div>
            <b>Applicants</b>
            <p>
              <Link href="/apply-status">Where your application stands</Link> — four
              stages, read it any hour. Shoreside answers the rest.
            </p>
          </div>
          <div>
            <b>Hours</b>
            <p className="sp-hours">
              Mon – Fri · 09:00 – 18:00 PT
              <br />
              Sat · 08:00 – 14:00 PT
              <br />
              Sailing days · dawn to last line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
