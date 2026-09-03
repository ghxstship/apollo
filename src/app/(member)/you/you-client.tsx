"use client";

import React from "react";
import Link from "next/link";
import { MAILBOX, PLACE, SURFACES } from "@/lib/brand";
import { Button, Checkbox, Dialog, Input, Select, Switch, Textarea, Toast } from "@/components/ds";
import { BIO_MAX, INTERESTS } from "./interests";
import {
  departClub,
  pauseMembership,
  resumeMembership,
  saveNotificationPrefs,
  updateProfile,
  type ProfileFormState,
} from "./actions";

/* — Profile form — */
export function ProfileForm({
  fullName,
  handle,
  homeCity,
  avatarTone,
  cities,
  bio,
  interests,
  inDirectory,
}: {
  fullName: string;
  handle: string;
  homeCity: string;
  avatarTone: string;
  cities: Array<{ value: string; label: string }>;
  bio: string;
  interests: string[];
  inDirectory: boolean;
}) {
  const [state, formAction, pending] = React.useActionState<ProfileFormState, FormData>(
    updateProfile,
    {}
  );
  /* Track which save the member has dismissed — a fresh save shows a fresh toast. */
  const [dismissedState, setDismissedState] = React.useState<ProfileFormState | null>(null);
  const showToast = !!state.saved && dismissedState !== state;
  React.useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setDismissedState(state), 4000);
    return () => clearTimeout(t);
  }, [showToast, state]);

  return (
    <form action={formAction}>
      <div className="you-grid">
        <Input label="Full name" name="full_name" defaultValue={fullName} error={state.error} />
        <Input label="Handle" name="handle" defaultValue={handle} placeholder="how the crew hails you" />
        <Select
          label={`Home ${PLACE.market.toLowerCase()}`}
          name="home_city"
          defaultValue={homeCity}
          options={cities}
          placeholder={`Choose a ${PLACE.market.toLowerCase()}`}
        />
        <Select
          label="Avatar tone"
          name="avatar_tone"
          defaultValue={avatarTone}
          options={[
            { value: "ink", label: "Ink" },
            { value: "sea", label: "Sea" },
            { value: "gold", label: "Brass" },
            { value: "sand", label: "Sand" },
          ]}
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <Textarea
          label="A few words"
          name="bio"
          rows={3}
          maxLength={BIO_MAX}
          defaultValue={bio}
          placeholder="What you turn up for, and what you would rather be doing."
          hint={`Up to ${BIO_MAX} characters. Shown on your directory page.`}
        />
      </div>
      <fieldset className="you-fs">
        <legend className="you-h">Turns up for</legend>
        <div className="you-checks">
          {INTERESTS.map((i) => (
            <Checkbox
              key={i}
              name="interests"
              value={i}
              label={i}
              defaultChecked={interests.includes(i)}
            />
          ))}
        </div>
      </fieldset>
      <div className="you-row" style={{ paddingInline: 0 }}>
        <div>
          <b>List me in the directory</b>
          <p>Off, and only you and the crew ashore can see your page.</p>
        </div>
        <Switch
          name="in_directory"
          defaultChecked={inDirectory}
          label=""
          aria-label="List me in the directory"
        />
      </div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Log the changes
        </Button>
      </div>
      {showToast ? (
        <Toast
          fixed
          message="Logged. It reads your way now."
          tone="positive"
          onDismiss={() => setDismissedState(state)}
        />
      ) : null}
    </form>
  );
}

/* — Notification preferences: three switches, persisted on the profile — */
export function NotificationPrefsForm({
  weather,
  berths,
  fathoms,
  digest,
}: {
  weather: boolean;
  berths: boolean;
  fathoms: boolean;
  digest: boolean;
}) {
  const [state, formAction, pending] = React.useActionState<ProfileFormState, FormData>(
    saveNotificationPrefs,
    {}
  );
  const [dismissedState, setDismissedState] = React.useState<ProfileFormState | null>(null);
  const showToast = !!state.saved && dismissedState !== state;
  React.useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setDismissedState(state), 4000);
    return () => clearTimeout(t);
  }, [showToast, state]);

  return (
    <form action={formAction}>
      <div className="you-row">
        <div>
          {/* A weather hold is an EPISODE held for conditions, and nothing
              else. The membership pause used to borrow the phrase — this
              switch sat a few hundred pixels from a banner reading "Membership
              on weather hold", and nothing said which was which — so the
              metaphor is off the membership entirely and this label says what
              it is actually about. */}
          <b>Weather holds on your episodes</b>
          <p>When an episode is held for conditions. Called by 18:00 the night before.</p>
        </div>
        <Switch
          name="weather"
          defaultChecked={weather}
          label=""
          aria-label="Notices when an episode is held for weather"
        />
      </div>
      <div className="you-row">
        <div>
          <b>Pass releases</b>
          <p>Waitlist offers, in order.</p>
        </div>
        <Switch name="berths" defaultChecked={berths} label="" aria-label="Pass release notices" />
      </div>
      <div className="you-row">
        <div>
          <b>Knots</b>
          <p>Every entry, as it lands in the ledger.</p>
        </div>
        <Switch name="fathoms" defaultChecked={fathoms} label="" aria-label="Knots notices" />
      </div>
      <div className="you-row">
        <div>
          <b>{SURFACES.magazine}</b>
          <p>The Sunday letter. Nothing to do with your passes.</p>
        </div>
        <Switch
          name="digest"
          defaultChecked={digest}
          label=""
          aria-label={`${SURFACES.magazine} letter`}
        />
      </div>
      <div className="you-row">
        <div>
          <p>{state.error ? <span style={{ color: "var(--siren)" }}>{state.error}</span> : null}</p>
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Log the word
        </Button>
      </div>
      {showToast ? (
        <Toast
          fixed
          message="Logged. The word reaches you your way."
          tone="positive"
          onDismiss={() => setDismissedState(state)}
        />
      ) : null}
    </form>
  );
}

/* — Paused banner: resume with a word — */
/* A departed member was shown nothing here at all, while the banner in the
   member layout told them "booking, posting and contests wait until you resume
   — that happens on your page". They arrived at this page and there was no
   resume. The one correct sentence in the whole flow lived in a database
   exception the interface never surfaced.

   And a hold the CLUB placed cannot be lifted by the member either, so the
   Resume button was there for them to press and be refused. */
export function ClosedPlaceNotice() {
  return (
    <div className="you-sec" style={{ marginTop: 0, borderColor: "var(--line-strong)" }} role="status">
      <div className="you-row">
        <div>
          <b>Your place is closed</b>
          <p>
            You departed the club. Your log and your ledger stay as they were.
            Coming back is a conversation, not a switch — hail Shoreside and
            they will open it again.
          </p>
        </div>
        <a className="ls-btn ls-btn--outline ls-btn--sm" href={`mailto:${MAILBOX.shore}?subject=Coming%20back%20aboard`}>
          Hail Shoreside
        </a>
      </div>
    </div>
  );
}

/* The three hold banners below all rule their border in --brass-deep, which
   compat.css aliases to --text-accent and which therefore resolves in every
   theme. All three carried a `, #966E22` fallback — antique gold from the
   retired brand — which could only ever paint if the alias had been deleted,
   i.e. it was a promise to render the OLD palette on the day the new one lost
   its name. Dropped: a fallback that is wrong is worse than none. */
export function ClubHoldNotice() {
  return (
    <div className="you-sec" style={{ marginTop: 0, borderColor: "var(--brass-deep)" }} role="status">
      <div className="you-row">
        <div>
          <b>Your membership is paused</b>
          <p>
            The club paused this one, so it lifts from their side rather than
            yours. Your log, your ledger and what you owe stay open.
          </p>
        </div>
        <a className="ls-btn ls-btn--outline ls-btn--sm" href={`mailto:${MAILBOX.shore}?subject=Lifting%20the%20hold`}>
          Hail Shoreside
        </a>
      </div>
    </div>
  );
}

/* A dues hold is the club's, but it is the one hold the member can lift
   without a conversation: the club places it when dues lapse and the trigger
   lifts it when a payment clears. Telling them to hail Shoreside for a hold a
   card payment ends on its own would send them to the wrong door. */
export function DuesHoldNotice() {
  return (
    <div className="you-sec" style={{ marginTop: 0, borderColor: "var(--brass-deep)" }} role="status">
      <div className="you-row">
        <div>
          <b>Held — dues lapsed.</b>
          <p>
            Settle in the portal and it lifts on its own. Your log, your ledger
            and the passes you hold stay as they are.
          </p>
        </div>
        <Link href="/portal" className="ls-btn ls-btn--outline ls-btn--sm">
          Settle in the portal
        </Link>
      </div>
    </div>
  );
}

export function ResumeBanner() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div
      className="you-sec"
      style={{ marginTop: 0, borderColor: "var(--brass-deep)" }}
      role="status"
    >
      <div className="you-row">
        <div>
          <b>Your membership is paused</b>
          {/* This said "nothing is being taken" — an unconditional statement of
              present fact, on a banner that knows nothing about the dues. When
              Stripe is not wired or the call failed, the card is still drawing
              and this sentence was the only thing left on the page saying
              otherwise: the corrective note lives in a toast that clears after
              four seconds, and this banner then repeats the false half on every
              visit, permanently.

              What is certain from `status` alone is the standing. What happens
              to the money is on /account, which reads the subscription. Say
              only the part this component can actually know. */}
          {/* A pause touches no pass, which is what this line is for — and
              "the manifest" was the wrong noun for it: what waits is the set of
              passes the member holds, across episodes, not one boarding list. */}
          <p>Knots and tier keep. Your passes wait for you.</p>
          <p style={{ opacity: 0.75 }}>
            Your dues are on your <a href="/account">account page</a>.
          </p>
          {error ? <p style={{ color: "var(--siren)" }}>{error}</p> : null}
        </div>
        <Button
          variant="gold"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await resumeMembership();
              if (res.error) setError(res.error);
              /* The dues half can fail while the standing succeeds. Saying so
                 is the whole point — a member must never be left assuming
                 their card changed when it did not. */
              else if (res.note) setError(res.note);
            });
          }}
        >
          Resume
        </Button>
      </div>
    </div>
  );
}

/* A pass on the manifest for an episode still ahead — what departing settles. */
export type HeldPass = { id: string; title: string; when: string };

/* — Offboarding: pause or depart, for real — */
export function Offboarding({
  status,
  heldPasses,
  pause,
}: {
  status: string;
  heldPasses: HeldPass[];
  /* Days used and the club's allowance, both from the database. The counter
     has existed since August and nothing called it, so a member pausing could
     not tell three days from ninety. */
  pause: { used: number; cap: number };
}) {
  const [mode, setMode] = React.useState<null | "pause" | "depart">(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  /* `sticky` marks a toast the member has to act on — the dues did not move
     with the standing. Those must not evaporate: the four-second dismissal
     took the only true sentence off the screen and left the page asserting the
     opposite. Good news still clears itself. */
  const [sticky, setSticky] = React.useState(false);
  React.useEffect(() => {
    if (!toast || sticky) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast, sticky]);

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      if (mode === "pause") {
        const res = await pauseMembership();
        if (res.error) setError(res.error);
        else {
          setMode(null);
          setSticky(Boolean(res.note));
          setToast(
            res.note
              ? `Membership paused. ${res.note}`
              : "Membership paused. Resume with a word — no games either way."
          );
        }
      } else {
        const res = await departClub();
        /* On success departClub signs out and redirects home. It returns
           instead — still signed in — when the standing closed but the dues
           did not stop, because that is the one case where the member has
           something left to do and needs to be told what. */
        if (res?.error) setError(res.error);
        else if (res?.note) {
          /* Do NOT clear `mode` here. The note is rendered inside
             {error && mode === "depart"}, and setMode(null) batches with
             setError, so clearing it made the sentence unreachable by
             construction — the one case where the member's card is still
             drawing was the one case they were told nothing at all. Leaving
             the dialog open is also the right shape: they read what happened
             and close it themselves. */
          setError(res.note);
        }
      }
    });
  };

  return (
    <>
      {/* Wrapping. Nowrap put "Depart the club" 9.7px past a 375px viewport,
          which is enough to make the page scroll sideways and the phone zoom
          out — the same defect the Open Deck bylines had. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        {status !== "paused" ? (
          <Button variant="ghost" size="sm" onClick={() => setMode("pause")}>
            Pause membership
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setMode("depart")}>
          Depart the club
        </Button>
      </div>
      <Dialog
        open={mode === "pause"}
        onClose={() => setMode(null)}
        width={360}
        eyebrow="The gangway out"
        title="Pause your membership?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
              Stay aboard
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={confirm}>
              Pause my membership
            </Button>
          </>
        }
      >
        {/* The allowance, before the question rather than after it. A member
            deciding whether to pause wants to know what it costs them, and the
            club has counted this since August without ever saying it. */}
        {pause.cap > 0 ? (
          <p className="you-allowance">
            {pause.used === 0
              ? `You have all ${pause.cap} of your pause days this year.`
              : pause.used >= pause.cap
                ? `You have used all ${pause.cap} pause days this year. Pausing again is a word with Shoreside.`
                : `${pause.cap - pause.used} of your ${pause.cap} pause days are left this year.`}
          </p>
        ) : null}
        {/* Says exactly what @/lib/dues does. If these two ever drift, the
            code is the thing that is right and this is the thing that lies. */}
        Knots and tier keep, and you can resume with a word — no games either
        way. Dues stop here: nothing more is taken while the hold stands, and
        what you have already paid for is not refunded. Resuming starts them
        again on the next cycle.
        {/* A pause keeps the passes — set_own_standing('paused') touches none
            of them. Departing is the flow that releases, so the two dialogs
            must not read alike on this point. */}
        <p style={{ marginTop: 10 }}>
          Passes you hold stay held — release them from Passes if the tide has
          turned.
        </p>
        {error && mode === "pause" ? (
          <p role="alert" style={{ marginTop: 10, color: "var(--siren)", fontSize: "var(--text-xs)" }}>
            {error}
          </p>
        ) : null}
      </Dialog>
      <Dialog
        open={mode === "depart"}
        onClose={() => setMode(null)}
        width={360}
        eyebrow="The gangway out"
        title="Depart the club?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
              Stay aboard
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={confirm}>
              Depart
            </Button>
          </>
        }
      >
        {/* This used to promise "unused months credit back", which nothing
            anywhere delivered. What it says now is what @/lib/dues does.

            It also used to end "and that period stays yours", which read as a
            promise of access and was not one: set_own_standing('departed')
            makes is_active() false the moment it commits, and RLS then refuses
            booking, posting, invites, the waitlist, contests and pass
            transfers. The dues sentence was true and the access sentence was
            not, sitting in the same breath — so a member agreed to one thing
            and got another. Both halves are now stated separately, because
            they genuinely differ, and someone deciding whether to leave today
            or at the end of the month needs to know which is which. */}
        No exit surveys, no retention calls; the club remembers you kindly.
        Your dues end when the period you have already paid for runs out, and
        nothing further is taken. Booking, posting and the rest close as soon as
        you confirm — so if there is an episode you still want, take it first.
        {/* set_own_standing('departed') releases every aboard pass on an episode
            still ahead, credited in full, by trigger. The member is shown the
            list before they confirm, because a departure that quietly empties
            the passes is a surprise, and the credit is the part they would
            otherwise write in to ask about. */}
        {heldPasses.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <span className="mbr-mono" style={{ display: "block", marginBottom: 6 }}>
              PASSES YOU HOLD
            </span>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {heldPasses.map((p) => (
                <li
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "6px 0",
                    borderTop: "1px solid var(--line-faint)",
                  }}
                >
                  <span>{p.title}</span>
                  <span className="mbr-mono">{p.when}</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 8 }}>
              These are released and credited in full the moment you go.
            </p>
          </div>
        ) : (
          <p style={{ marginTop: 10 }}>No passes to square.</p>
        )}
        {error && mode === "depart" ? (
          <p role="alert" style={{ marginTop: 10, color: "var(--siren)", fontSize: "var(--text-xs)" }}>
            {error}
          </p>
        ) : null}
      </Dialog>
      {toast ? (
        <Toast
          fixed
          message={toast}
          tone={sticky ? "caution" : undefined}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </>
  );
}
