"use client";

import React from "react";
import { Button, Dialog, Input, Select, Toast } from "@/components/ds";
import { updateProfile, type ProfileFormState } from "./actions";

/* — Profile form — */
export function ProfileForm({
  fullName,
  handle,
  homeHarbor,
  avatarTone,
  harbors,
}: {
  fullName: string;
  handle: string;
  homeHarbor: string;
  avatarTone: string;
  harbors: Array<{ value: string; label: string }>;
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

/* — Offboarding: pause or depart, demo only — */
export function Offboarding() {
  const [mode, setMode] = React.useState<null | "pause" | "depart">(null);
  const [toast, setToast] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const confirm = () => {
    setToast(
      mode === "pause"
        ? "Weather hold requested. The shore office will confirm within two tides."
        : "Departure logged. The shore office will confirm within two tides."
    );
    setMode(null);
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="ghost" size="sm" onClick={() => setMode("pause")}>
          Pause membership
        </Button>
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
            <Button variant="outline" size="sm" onClick={confirm}>
              Hold my berth
            </Button>
          </>
        }
      >
        Dues pause; fathoms and tier keep. Resume with a word — no games either way.
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
            <Button variant="outline" size="sm" onClick={confirm}>
              Depart
            </Button>
          </>
        }
      >
        Unused months credit back. No exit surveys, no retention calls. The
        manifest remembers you kindly.
      </Dialog>
      {toast ? <Toast fixed message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
