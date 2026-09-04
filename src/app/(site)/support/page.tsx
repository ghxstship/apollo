import type { Metadata } from "next";
import Link from "next/link";
import { MAILBOX } from "@/lib/brand";
import { guestLine } from "@/components/site/plan-copy";
import { readPublicPlans } from "@/components/site/plans-data";

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
        "A person reads it, an invitation ashore follows within the week, two members sign, and you're aboard. No black box — read where you stand at any hour on the application status page.",
      ],
      [
        "Can I visit before joining?",
        "Yes — that's the point. Redeem a member's invite code for one shore night as their guest.",
      ],
      /* The question stays — a prospective member really does ask it — but the
         answer used to treat sailing as the price of entry, under a heading
         about joining. Thirty-four of the fifty-two episodes never leave land,
         so the honest first half of the answer is that most of the season does
         not ask. The second half is the old answer, which was always good. */
      [
        "I've never sailed.",
        "Then most of the season is already yours — thirty-four of the fifty-two episodes never leave land. For the ones that do, instruction is included at every tier and the day sails are built for first reefs. Swim 200 meters and mind the boom.",
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
        "Pause it from the member app. Dues stop, knots and league keep, and nothing is refunded for the stretch you have already paid for. Resume with a word.",
      ],
      [
        "What are knots worth?",
        "Ten per nautical mile, forty per shore night, two hundred fifty per referral who joins. More knots, farther water — spend them on rewards money can't buy here.",
      ],
    ],
  ],
  [
    "On the day",
    [
      /* Was a single California dock, stated as though every episode mustered
         there. Each episode carries its own muster string and no two in Season
         I are the same — a marina for the ones afloat, a venue for the ones
         ashore, which is most of them. The answer names where to look instead
         of naming a place it cannot know. */
      [
        "Where do I muster?",
        "Every episode musters in its own place — a marina afloat, a venue ashore. The place and the hour are on the episode's page, and the gate code rides with your boarding stub.",
      ],
      [
        "What if weather turns?",
        "Holds are called by 18:00 the night before — a word, not an apology. Your pass carries over.",
      ],
    ],
  ],
];

export default async function SupportPage() {
  /* The guest rule reads the plans' guest_allowance rather than a figure typed
     here — "Two per episode on Global passes" named a plan that no longer
     exists and a number that is a column. */
  const guests = guestLine(await readPublicPlans());
  const faqs: typeof FAQS = FAQS.map(([group, items]) =>
    group === "On the day"
      ? [group, [...items, ["Can I bring a guest?", `${guests} Everyone signs the manifest at the gangway.`]]]
      : [group, items]
  );
  return (
    <div className="lg-wrap">
      {/* Route = nav = title = h1: the footer, the 404 and every "hail
          Shoreside" link name this page Shoreside, so the h1 does too. */}
      <span className="ls-eyebrow ls-eyebrow--page">The shore desk · Hail us</span>
      <h1>Shoreside.</h1>
      <p style={{ color: "var(--text-2)", marginTop: 14, maxWidth: "54ch" }}>
        Shoreside answers first, files second, a human always. Most of what the
        water asks is already answered below.
      </p>

      <div className="sp-faq">
        {faqs.map(([group, items]) => (
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
            {/* The club's clock is CLUB_ZONE, America/New_York — the desk is
                in Miami. On PT these hours read three hours early for every
                member of the home city. */}
            <p className="sp-hours">
              Mon – Fri · 09:00 – 18:00 ET
              <br />
              Sat · 08:00 – 14:00 ET
              <br />
              Episode days · dawn to last line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
