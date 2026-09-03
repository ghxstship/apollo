import type { Metadata } from "next";
import Link from "next/link";
import { MAILBOX } from "@/lib/brand";

export const metadata: Metadata = {
  alternates: { canonical: "/the-show" },
  title: "The show",
  description:
    "What gets filmed, what gets published, who decides, and how you say no. The cameras, in plain terms.",
};

/* The cameras, answered before the form rather than inside the release.

   A club whose premise is a filmed series had no page explaining the cameras,
   so the objection that stops an applicant — what happens to footage of me —
   was answered only by clauses nobody reads until they are already signing.
   Every claim below is a thing the product actually does:

     "cameras run from the first hello to the last cab", "out of frame and out of the cut",
     the microphones, and the minors line  -> the filming-release,
       voice-likeness and minor-appearance clause bodies, verbatim in substance
     members on by default, guests off      -> profiles.on_camera default true,
       rsvp_guests.on_camera default false
     the standing switch and its timestamp  -> setOnCamera(), on_camera +
       camera_withdrawn_at, honoured at the next port
     nothing public until it is cleared     -> episode_media.approved default
       false, a private bucket, and short-lived signed links minted per frame
     the photographer does not clear it     -> the member insert policy cannot
       set approved; the ratchet in blur_is_required() cannot be lowered on deck
     no posting people without their yes    -> the code of conduct on /legal

   Nothing here promises a lever the product does not have. In particular there
   is no claim that a member takes a frame down themselves: the RLS permits it
   and no surface calls it, so the page names the route that exists. */

export default function TheShowPage() {
  return (
    <div className="lg-wrap">
      <span
        className="ls-eyebrow"
        style={{ color: "var(--brass-deep)", display: "block", marginBottom: 16 }}
      >
        The cameras
      </span>
      <h1>What the cameras do.</h1>
      <p style={{ color: "var(--text-2)", marginTop: 14, maxWidth: "56ch" }}>
        The club is a filmed series. That is the premise, not the fine print, so
        it belongs in front of the form. No scripts. No second takes.
      </p>
      <nav className="lg-anchors" aria-label="Sections">
        <a href="#filmed">What gets filmed</a>
        <a href="#published">What gets published</a>
        <a href="#decides">Who decides</a>
        <a href="#out">How you opt out</a>
      </nav>

      <section className="lg-sec" id="filmed">
        <h2>What gets filmed.</h2>
        <p>
          The cameras run from the first hello to the last cab. That is the
          whole of the window — it is the episode, not your life. The
          club&rsquo;s own cast and crew run the room, the cameras and the
          welcome.
        </p>
        <p>
          Microphones count. What a mic catches is footage on the same terms as
          what a lens catches, and it carries the same right to decline.
        </p>
        <p>
          Members are on camera by default, because a filmed show is the thing
          you applied to. A member&rsquo;s guest is not: a guest is off camera
          unless they say yes themselves at signing. A guest under eighteen
          appears only where the signing adult says so explicitly, and the
          default there is off.
        </p>
      </section>

      <section className="lg-sec" id="published">
        <h2>What gets published.</h2>
        <p>
          Frames post after the episode, credited by name.
        </p>
        <p>
          Nothing is public the moment it is shot. A frame arrives uncleared and
          lands in a store no one can read — no address to guess and no listing
          to walk. What a gallery shows is a short-lived link the club mints for
          a frame that has been cleared, and the link expires. A frame nobody
          clears is fetchable by nobody.
        </p>
        <p>
          The footage is the show&rsquo;s and only the show&rsquo;s. Nothing
          recorded is sold on to third parties.
        </p>
      </section>

      <section className="lg-sec" id="decides">
        <h2>Who decides.</h2>
        <p>
          Clearing a frame is the club&rsquo;s call, and deliberately not the
          photographer&rsquo;s — a member who sends a frame up cannot mark it
          approved. One hand shoots, another hand publishes.
        </p>
        <p>
          Anonymity is your call, and it moves one way only. Once you have asked
          not to be photographed, that answer holds: a crew edit cannot lower
          it, a later change of mind on someone else&rsquo;s part cannot lower
          it, and nothing on the deck can override it on the day.
        </p>
        <p>
          Members decide about each other too. The{" "}
          <Link href="/legal#conduct">code of conduct</Link> is one line on this:
          no posting people without their yes.
        </p>
      </section>

      <section className="lg-sec" id="out">
        <h2>How you opt out.</h2>
        <p>
          One switch in your settings, <b>Appear on camera</b>. Turn it off and
          production keeps you out of frame and out of the cut.
        </p>
        <p>
          The choice is standing — it holds for every episode until you change
          it — and it is dated. A withdrawal is recorded with the hour it was
          made, the crew sees it on the manifest, and it is honoured from the
          next port. Withdrawing while you are aboard docks you at that port;
          the release says so before you sign, and so does the switch.
        </p>
        <p>
          You can tell the crew instead, before boarding. Same answer, no app
          required.
        </p>
        <p>
          A frame already up comes down on request. Write to{" "}
          <a href={`mailto:${MAILBOX.shore}`}>{MAILBOX.shore}</a> — the file goes
          with the record, not just the listing.
        </p>
        <p className="lg-mono" style={{ marginTop: 24 }}>
          On by default for members · off by default for guests · withdrawal is
          dated and honoured at the next port
        </p>
      </section>
    </div>
  );
}
