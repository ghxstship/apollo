import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The shore office",
  description: "Answers first, tickets second, a human always.",
};

const FAQS: Array<[string, Array<[string, string]>]> = [
  [
    "Getting aboard",
    [
      [
        "I applied. Now what?",
        "A person reads it, a salon invite follows within the week, two members sign, and you're aboard. No black box.",
      ],
      [
        "Can I visit before joining?",
        "Yes — that's the point. Redeem a member's invite code for one salon as their guest.",
      ],
      [
        "I've never sailed.",
        "Perfect. Instruction is included at every tier; day sails are built for first reefs. Swim 200 meters and mind the boom.",
      ],
    ],
  ],
  [
    "Dues and berths",
    [
      [
        "How do refunds work?",
        "Release a berth 48 hours out or more for full credit. No-shows forfeit the deposit to the galley fund. Weather holds roll everything forward untouched.",
      ],
      [
        "Can I pause my membership?",
        "Weather-hold it from the member app — dues pause, fathoms and tier keep. Resume with a word.",
      ],
      [
        "What are fathoms worth?",
        "Ten per nautical mile, forty per salon, two hundred fifty per referral who joins. Spend them on rewards money can't buy here.",
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
        "Holds are called by 18:00 the night before — a word, not an apology. Your berth carries over.",
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
        The shore office
      </span>
      <h1>Hail us.</h1>
      <p style={{ color: "var(--text-2)", marginTop: 14, maxWidth: "54ch" }}>
        Answers first, tickets second, a human always. Most of what the water asks
        is already answered below.
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
              <a href="mailto:shore@lyre.social">shore@lyre.social</a> — a person
              answers, usually within the hour. Plain words beat long ones.
            </p>
            <p style={{ marginTop: 10 }}>
              Press and partnerships:{" "}
              <a href="mailto:signal@lyre.social">signal@lyre.social</a>
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
