"use client";

import React from "react";
import { MAILBOX } from "@/lib/brand";
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
  homeHarbor,
  avatarTone,
  harbors,
  bio,
  interests,
  inDirectory,
}: {
  fullName: string;
  handle: string;
  homeHarbor: string;
  avatarTone: string;
  harbors: Array<{ value: string; label: string }>;
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
          label="Home harbor"
          name="home_harbor"
          defaultValue={homeHarbor}
          options={harbors}
          placeholder="Choose a harbor"
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
          placeholder="What you turn up for, and what you would rather be doing on the water."
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
          message="Logged. The manifest reads it your way."
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
          {/* A weather hold is a SAILING held for conditions, and nothing
              else. The membership pause used to borrow the phrase — this
              switch sat a few hundred pixels from a banner reading "Membership
              on weather hold", and nothing said which was which — so the
              metaphor is off the membership entirely and this label says what
              it is actually about. */}
          <b>Weather holds on your sailings</b>
          <p>When a charter is held for conditions. Called by 18:00 the night before.</p>
        </div>
        <Switch
          name="weather"
          defaultChecked={weather}
          label=""
          aria-label="Notices when a sailing is held for weather"
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
          <b>Episodes</b>
          <p>The Sunday letter. Nothing to do with your passes.</p>
        </div>
        <Switch name="digest" defaultChecked={digest} label="" aria-label="Episodes letter" />
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

export function ClubHoldNotice() {
  return (
    <div className="you-sec" style={{ marginTop: 0, borderColor: "var(--brass-deep, #966E22)" }} role="status">
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

export function ResumeBanner() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div
      className="you-sec"
      style={{ marginTop: 0, borderColor: "var(--brass-deep, #966E22)" }}
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
          <p>Knots and tier keep. The manifest waits for you.</p>
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

/* — Offboarding: pause or depart, for real — */
export function Offboarding({ status }: { status: string }) {
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
        {/* Says exactly what @/lib/dues does. If these two ever drift, the
            code is the thing that is right and this is the thing that lies. */}
        Knots and tier keep, and you can resume with a word — no games either
        way. Dues stop here: nothing more is taken while the hold stands, and
        what you have already paid for is not refunded. Resuming starts them
        again on the next cycle.
        {error && mode === "pause" ? (
          <p role="alert" style={{ marginTop: 10, color: "var(--siren)", fontSize: 12.5 }}>
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
        No exit surveys, no retention calls; the manifest remembers you kindly.
        Your dues end when the period you have already paid for runs out, and
        nothing further is taken. Booking, posting and the rest close as soon as
        you confirm — so if there is a sailing you still want, take it first.
        {error && mode === "depart" ? (
          <p role="alert" style={{ marginTop: 10, color: "var(--siren)", fontSize: 12.5 }}>
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
