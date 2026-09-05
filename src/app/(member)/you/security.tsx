"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Input, Toast } from "@/components/ds";
import { beginTwoStep, confirmTwoStep, endTwoStep, setPassword, type PasswordState, type TwoStepState } from "@/app/gangway/actions";
import { PASSWORD_MIN } from "@/app/gangway/ways";

/* A password beside the link, and two-step beside both. Nothing here changes
   how the roll decides who boards; it changes how a member proves it is them. */
export function PasswordControl() {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState<PasswordState, FormData>(setPassword, {});
  /* Derived, not set in an effect: a saved password closes the dialog and
     shows the receipt until it is dismissed. */
  const [dismissed, setDismissed] = React.useState(false);
  const toast = state.done && !dismissed ? "Password saved. The link keeps working beside it." : null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setDismissed(true); setOpen(true); }}>
        Set or change
      </Button>
      <Dialog open={open && !(state.done && !dismissed)} onClose={() => setOpen(false)} width={440} eyebrow="Password" title="Set or change your password.">
        <form action={action} className="you-stack">
          <p style={{ color: "var(--text-2)", fontSize: "var(--text-sm)", margin: 0 }}>
            At least {PASSWORD_MIN} characters. Sign in with it at the gangway, or keep using the link — both work.
          </p>
          <Input label="New password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
          <Input label="Once more" name="again" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required error={state.error} />
          <Button type="submit" variant="gold" disabled={pending}>
            {pending ? "Saving" : "Save"}
          </Button>
        </form>
      </Dialog>
      {toast ? <Toast fixed message={toast} onDismiss={() => setDismissed(true)} /> : null}
    </>
  );
}

export function TwoStepControl({ enrolled }: { enrolled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [begun, setBegun] = React.useState<TwoStepState | null>(null);
  const [busy, startTransition] = React.useTransition();
  const [toast, setToast] = React.useState<{ msg: string; tone?: "danger" } | null>(null);
  /* The action wrapper, not an effect, closes the dialog and refreshes the
     page once the code is proven. */
  const [state, action, pending] = React.useActionState<TwoStepState, FormData>(async (prev, fd) => {
    const res = await confirmTwoStep(prev, fd);
    if (res.verified) {
      setOpen(false);
      setBegun(null);
      setToast({ msg: "Two-step is on. The gangway asks for a code once per sign-in." });
      router.refresh();
    }
    return res;
  }, {});

  const start = () =>
    startTransition(async () => {
      const res = await beginTwoStep();
      if (res.error) {
        setToast({ msg: res.error, tone: "danger" });
        return;
      }
      setBegun(res);
      setOpen(true);
    });
  const stop = () =>
    startTransition(async () => {
      const res = await endTwoStep();
      if (res.error) setToast({ msg: res.error, tone: "danger" });
      else {
        setToast({ msg: "Two-step is off." });
        router.refresh();
      }
    });

  /* The form re-posts the enrolment it is verifying, so a wrong code keeps
     the same QR on screen rather than starting over. */
  const live = state.factorId ? state : begun;

  return (
    <>
      {enrolled ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={stop}>
          Turn off
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={busy} onClick={start}>
          {busy ? "Starting" : "Turn on"}
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} width={440} eyebrow="Two-step" title="Scan, then type the code.">
        {live?.qr ? (
          <form action={action} className="you-stack">
            <input type="hidden" name="factorId" value={live.factorId ?? ""} />
            <input type="hidden" name="qr" value={live.qr ?? ""} />
            <input type="hidden" name="secret" value={live.secret ?? ""} />
            <p style={{ color: "var(--text-2)", fontSize: "var(--text-sm)", margin: 0 }}>
              Open a code app (1Password, Authy, Google Authenticator) and scan this. Then type the six digits it shows.
            </p>
            {/* The QR arrives from the auth server as an SVG data URI — an
                image, not a fetch, so the CSP has nothing to say about it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={live.qr} alt="Two-step QR code" width={180} height={180} style={{ background: "var(--paper)", padding: 8, alignSelf: "center" }} />
            <p className="mbr-mono" style={{ margin: 0, wordBreak: "break-all" }}>
              OR TYPE THE KEY: {live.secret}
            </p>
            <Input label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" placeholder="000 000" required error={state.error} />
            <Button type="submit" variant="gold" disabled={pending}>
              {pending ? "Checking" : "Turn on two-step"}
            </Button>
          </form>
        ) : null}
      </Dialog>
      {toast ? <Toast fixed message={toast.msg} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
