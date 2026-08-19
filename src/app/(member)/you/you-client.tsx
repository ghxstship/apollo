"use client";

import React from "react";
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
            { value: "brass", label: "Brass" },
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
          tone="laurel"
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
}: {
  weather: boolean;
  berths: boolean;
  fathoms: boolean;
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
          <b>Weather holds</b>
          <p>Called by 18:00 the night before.</p>
        </div>
        <Switch name="weather" defaultChecked={weather} label="" aria-label="Weather hold notices" />
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
          tone="laurel"
          onDismiss={() => setDismissedState(state)}
        />
      ) : null}
    </form>
  );
}

/* — Paused banner: resume with a word — */
export function ResumeBanner() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div
      className="you-sec"
      style={{ marginTop: 0, borderColor: "var(--brass-deep, #8a6d3b)" }}
      role="status"
    >
      <div className="you-row">
        <div>
          <b>Membership on weather hold</b>
          <p>Dues paused; knots and tier keep. The manifest waits for you.</p>
          {error ? <p style={{ color: "var(--siren)" }}>{error}</p> : null}
        </div>
        <Button
          variant="brass"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await resumeMembership();
              if (res.error) setError(res.error);
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
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      if (mode === "pause") {
        const res = await pauseMembership();
        if (res.error) setError(res.error);
        else {
          setToast("Weather hold on. Resume with a word — no games either way.");
          setMode(null);
        }
      } else {
        const res = await departClub();
        /* On success departClub signs out and redirects home. */
        if (res?.error) setError(res.error);
      }
    });
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
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
        title="Weather hold?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
              Stay aboard
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={confirm}>
              Hold my pass
            </Button>
          </>
        }
      >
        Dues pause; knots and tier keep. Resume with a word — no games either way.
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
        Unused months credit back. No exit surveys, no retention calls. The
        manifest remembers you kindly.
        {error && mode === "depart" ? (
          <p role="alert" style={{ marginTop: 10, color: "var(--siren)", fontSize: 12.5 }}>
            {error}
          </p>
        ) : null}
      </Dialog>
      {toast ? <Toast fixed message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
