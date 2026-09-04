import type { Metadata } from "next";
import Link from "next/link";
import { MAILBOX } from "@/lib/brand";

export const metadata: Metadata = {
  alternates: { canonical: "/the-show" },
  title: "The show",
  description:
    "What goes on the record, what gets published, who decides, and how you say no. The premise, in plain terms.",
};

/* The premise, answered before the form rather than inside the release.

   A club whose premise is an unscripted series had no page explaining it, so
   the objection that stops an applicant — what happens to a frame of me — was
   answered only by clauses nobody reads until they are already signing.

   Copy rule (owner, 2026-09): the show is sold the way the shows it is built on
   are sold. The page names the window, the record, the frames and the cut, and
   never the equipment that makes them — a reader is told what happens to them,
   not what it is done with. Every claim below is still a thing the product
   actually does:

     the window from the first hello to the last cab, what is said counting
       as much as what is seen, and the minors line  -> the release, voice-
       likeness and minor-appearance clause bodies, verbatim in substance
     members in by default, guests out              -> profiles.on_camera default
       true, rsvp_guests.on_camera default false
     the standing switch and its timestamp          -> setOnCamera(), on_camera +
       camera_withdrawn_at, honoured at the next stop
     nothing public until it is cleared             -> episode_media.approved
       default false, a private bucket, and short-lived signed links per frame
     whoever took it does not clear it              -> the member insert policy
       cannot set approved; the ratchet in blur_is_required() cannot be lowered
     no posting people without their yes            -> the code of conduct on /legal

   Nothing here promises a lever the product does not have. In particular there
   is no claim that a member takes a frame down themselves: the RLS permits it
   and no surface calls it, so the page names the route that exists.

   TODO(owner): the member-side switch this page describes is labelled in
   src/app/(member)/you/camera-consent.tsx and still carries the retired
   register in its label. This page describes it by what it does rather than by
   name until the label is brought in line. */

export default function TheShowPage() {
  return (
    <div className="lg-wrap">
      <span className="ls-eyebrow ls-eyebrow--page">The premise</span>
      <h1>The show.</h1>
      <p style={{ color: "var(--text-2)", marginTop: 14, maxWidth: "56ch" }}>
        The club is an unscripted series and every night is an episode. That is
        the premise, not the fine print, so it belongs in front of the form. No
        scripts. No second takes.
      </p>
      <nav className="lg-anchors" aria-label="Sections">
        <a href="#record">What goes on the record</a>
        <a href="#published">What gets published</a>
        <a href="#decides">Who decides</a>
        <a href="#out">How you opt out</a>
      </nav>

      <section className="lg-sec" id="record">
        <h2>What goes on the record.</h2>
        <p>
          An episode is on the record from the first hello to the last cab. That
          is the whole of the window — it is the episode, not your life. The
          club&rsquo;s own cast and crew run the room and the welcome.
        </p>
        <p>
          What is said counts as much as what is seen. A line you say at the
          table is part of the show on the same terms as your face at it, and it
          carries the same right to decline.
        </p>
        <p>
          Members are in the show by default, because the show is the thing you
          applied to. A member&rsquo;s guest is not: a guest stays out of it
          unless they say yes themselves at signing. A guest under eighteen
          appears only where the signing adult says so explicitly, and the
          default there is out.
        </p>
      </section>

      <section className="lg-sec" id="published">
        <h2>What gets published.</h2>
        <p>
          Frames post after the episode, credited by name.
        </p>
        <p>
          Nothing is public the moment it happens. A frame arrives uncleared and
          lands in a store no one can read — no address to guess and no listing
          to walk. What a gallery shows is a short-lived link the club mints for
          a frame that has been cleared, and the link expires. A frame nobody
          clears is fetchable by nobody.
        </p>
        <p>
          The show is the show&rsquo;s and only the show&rsquo;s. Nothing from
          an episode is sold on to third parties.
        </p>
      </section>

      <section className="lg-sec" id="decides">
        <h2>Who decides.</h2>
        <p>
          Clearing a frame is the club&rsquo;s call, and deliberately not the
          call of whoever took it — a member who sends a frame up cannot mark it
          approved. One hand takes it, another hand publishes.
        </p>
        <p>
          Anonymity is your call, and it moves one way only. Once you have asked
          to stay out of it, that answer holds: a crew edit cannot lower it, a
          later change of mind on someone else&rsquo;s part cannot lower it, and
          nothing on the night can override it.
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
          One switch in your settings decides whether you appear. Turn it off
          and production keeps you out of the cut.
        </p>
        <p>
          The choice is standing — it holds for every episode until you change
          it — and it is dated. A withdrawal is recorded with the hour it was
          made, the crew sees it on the manifest, and it is honoured from the
          next stop. Withdrawing while an episode is underway ends your episode
          at that stop; the release says so before you sign, and so does the
          switch.
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
          In by default for members · out by default for guests · withdrawal is
          dated and honoured at the next stop
        </p>
      </section>
    </div>
  );
}
