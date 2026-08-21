import type { Metadata } from "next";
import { MAILBOX } from "@/lib/brand";

export const metadata: Metadata = {
  title: "The fine print",
  description: "Code of conduct, terms of passage, and privacy — short, honest, binding.",
};

export default function LegalPage() {
  return (
    <div className="lg-wrap">
      <span className="ls-eyebrow" style={{ color: "var(--brass-deep)", display: "block", marginBottom: 16 }}>
        The fine print
      </span>
      <h1>Short, honest, binding.</h1>
      <p style={{ color: "var(--text-2)", marginTop: 14, maxWidth: "56ch" }}>
        Written to be read. If anything here surprises you, that&rsquo;s a bug —
        write to <a href={`mailto:${MAILBOX.shore}`}>{MAILBOX.shore}</a>.
      </p>
      <nav className="lg-anchors" aria-label="Sections">
        <a href="#conduct">Code of conduct</a>
        <a href="#terms">Terms of passage</a>
        <a href="#privacy">Privacy</a>
      </nav>

      <section className="lg-sec" id="conduct">
        <h2>Code of conduct.</h2>
        <h3>Aboard.</h3>
        <p>
          Follow the skipper, mind the boom, wear the vest when told. Instruction is
          included; recklessness is not. Impairment ends your sailing day, kindly
          and immediately.
        </p>
        <h3>Ashore and on the Booth.</h3>
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
        <p>
          Dues bill annually; installments carry no interest. Cancel anytime —
          unused months credit forward. Passes release up to 48 hours out for full
          credit; no-shows forfeit the deposit to the galley fund.
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
          Guests ride on Global passes, two per event, and sign the manifest at the
          gangway. Memberships aren&rsquo;t transferable; knots may be gifted to a
          named member or the crew fund on departure.
        </p>
      </section>

      <section className="lg-sec" id="privacy">
        <h2>Privacy.</h2>
        <h3>What we keep.</h3>
        <p>
          Your manifest — Sea Days, Port Days, knots — your seaworthiness declaration,
          and the contact details you gave us. Payment details live with the
          processor, not us.
        </p>
        <h3>What we never do.</h3>
        <ul>
          <li>Sell your data, or your attention. No ad pixels aboard.</li>
          <li>Show you on a manifest preview without consent — visibility is per-voyage, off by default for guests.</li>
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
    </div>
  );
}
