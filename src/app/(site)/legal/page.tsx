import type { Metadata } from "next";
import { MAILBOX } from "@/lib/brand";
import { guestLine } from "@/components/site/plan-copy";
import { readPublicPlans } from "@/components/site/plans-data";

export const metadata: Metadata = {
  alternates: { canonical: "/legal" },
  title: "The fine print",
  description: "Code of conduct, terms of passage, privacy and accessibility — short, honest, binding.",
};

export default async function LegalPage() {
  /* The guest rule is a column on the plans, not a sentence in this file —
     it said Global passes, two per episode, for two days after Global stopped
     being a plan. Read live; the fallback sentence is true at any figure. */
  const plans = await readPublicPlans();
  const guests = guestLine(plans);

  return (
    <div className="lg-wrap">
      {/* Route = nav = title = h1: the footer column and the tab call this
          page The fine print, so the h1 does too. */}
      <span className="ls-eyebrow ls-eyebrow--page">Short, honest, binding</span>
      <h1>The fine print.</h1>
      <p style={{ color: "var(--text-2)", marginTop: 14, maxWidth: "56ch" }}>
        Written to be read. If anything here surprises you, that&rsquo;s a bug —
        write to <a href={`mailto:${MAILBOX.shore}`}>{MAILBOX.shore}</a>.
      </p>
      <nav className="lg-anchors" aria-label="Sections">
        <a href="#conduct">Code of conduct</a>
        <a href="#terms">Terms of passage</a>
        <a href="#privacy">Privacy</a>
        <a href="#accessibility">Accessibility</a>
      </nav>

      <section className="lg-sec" id="conduct">
        <h2>Code of conduct.</h2>
        <h3>Aboard.</h3>
        <p>
          Follow the skipper, mind the boom, wear the vest when told. Instruction is
          included; recklessness is not. Impairment ends your sailing day, kindly
          and immediately.
        </p>
        <h3>Ashore and on the Open Deck.</h3>
        <ul>
          <li>What happens aboard stays aboard — no posting people without their yes.</li>
          <li>Passes are never resold for cash. Release them; the waitlist is the market.</li>
          <li>One warning for conduct; none for harassment. Departed members keep their credits either way.</li>
          <li>Leave every port better than you found it.</li>
        </ul>
        <p className="lg-mono" style={{ marginTop: 24 }}>
          Enforced by people · logged in the ship&rsquo;s record · appealable to Shoreside
        </p>
      </section>

      <section className="lg-sec" id="terms">
        <h2>Terms of passage.</h2>
        <h3>Dues and passes.</h3>
        {/* Was "Dues bill annually". Account offers both cadences, and the
            annual figure on every plan is ten months' dues — the same fact
            the billing page states as two months on the house. */}
        <p>
          Dues bill monthly or annually, your choice from your Account; a year is
          priced at ten months. Cancel anytime — unused months credit forward.
          Passes release up to 48 hours out for full credit; no-shows forfeit the
          deposit to the galley fund.
        </p>
        <h3>Weather and safety.</h3>
        <p>
          Holds are called by 18:00 the night before and roll your pass forward
          untouched. The skipper&rsquo;s word is final on the water. You sail having
          signed the seaworthiness declaration once — swim 200 meters, follow
          instruction.
        </p>
        <h3>Guests and transfers.</h3>
        <p>
          {guests} Every guest signs the manifest at the gangway. Memberships
          aren&rsquo;t transferable; knots may be gifted to a named member or the
          crew fund on departure.
        </p>
      </section>

      <section className="lg-sec" id="privacy">
        <h2>Privacy.</h2>
        <h3>What we keep.</h3>
        <p>
          Your manifest — episodes, shore nights, knots — your seaworthiness declaration,
          and the contact details you gave us. Payment details live with the
          processor, not us.
        </p>
        <h3>What we never do.</h3>
        <ul>
          <li>Sell your data, or your attention. No ad pixels aboard.</li>
          <li>Show you on a manifest preview without consent — visibility is per-episode, off by default for guests.</li>
          <li>Keep what you delete. Departure erases your profile within 30 days; the ledger keeps only what accounting law requires.</li>
        </ul>
        <h3>Your levers.</h3>
        <p>
          Export everything — one email to Shoreside, machine-readable,
          within a week. Correct anything. Delete the account from the member app —
          no calls required.
        </p>
        <p className="lg-mono" style={{ marginTop: 24 }}>
          GDPR and CCPA honored for everyone, not just where required · questions: {MAILBOX.shore}
        </p>
      </section>

      <section className="lg-sec" id="accessibility">
        <h2>Accessibility.</h2>
        {/* Plain statements of what the code does — base.css carries the skip
            link, the focus ring and the reduced-motion rule; the design-system
            audit measures text contrast in the build. No standard is claimed
            that a script does not check. */}
        <h3>On the site.</h3>
        <ul>
          <li>Everything works from the keyboard. Tab reaches every control, Escape closes what opens, and the first Tab on any page offers a skip straight to the content.</li>
          <li>Whatever has focus shows it — a visible ring, on every theme.</li>
          <li>Screen readers get named landmarks, labelled fields, and status messages read aloud as they land rather than found later.</li>
          <li>If your system asks for reduced motion, the site gives it: transitions and the live indicator hold still.</li>
          <li>Text colours are measured against a contrast floor in the build, on the ink theme and the paper one. If something reads faint to you, tell us — that is a bug, not a taste.</li>
          <li>Use your browser&rsquo;s zoom freely; the pages reflow rather than clip.</li>
        </ul>
        <h3>At a venue.</h3>
        <p>
          Every episode page carries the venue&rsquo;s own access note when the venue has
          given one — step-free entry, lifts, a quiet room. If it does not say what
          you need to know, or you need something arranged, write to Shoreside
          before you book and we ask the venue for you. Nothing about an access
          need goes on the manifest, ever.
        </p>
        <p className="lg-mono" style={{ marginTop: 24 }}>
          Access needs, questions and things we got wrong: {MAILBOX.shore}
        </p>
      </section>
    </div>
  );
}
