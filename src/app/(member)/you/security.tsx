"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Input, Toast } from "@/components/ds";
import { beginTwoStep, changeEmail, confirmTwoStep, endTwoStep, newRecoveryCodes, setPassword, type EmailState, type PasswordState, type TwoStepState } from "@/app/gangway/actions";
import { Notice } from "@/components/ds";
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
          <p className="mbr-dlg__lede mbr-status--inline">
            At least {PASSWORD_MIN} characters. Sign in with it at the gangway, or keep using the link — both work.
          </p>
          {/* The one they have now. Without it, a session left open on a
              borrowed laptop is a password change — and the club's own
              security letter would be the first the member heard of it.
              Absent on the reset page, which is reached by a link sent to
              the address on file: asking there for a password somebody has
              by definition forgotten would make the reset useless. */}
          <Input label="Your password now" name="current" type="password" autoComplete="current-password" required />
          <Input label="New password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
          <Input label="Once more" name="again" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required error={state.error} />
          <Button type="submit" variant="gold" pending={pending} pendingLabel="Saving">
            Save
          </Button>
        </form>
      </Dialog>
      {toast ? <Toast fixed message={toast} duration={4000} onClose={() => setDismissed(true)} /> : null}
    </>
  );
}

/* The address on file. Until 2026-09-07 a member could not change it at all —
   the guard refuses the column, the Bridge only reads it, and nothing asked the
   provider. A product that promises somebody they can correct what is held
   about them has to mean the most important thing it holds.

   The dialog says what will happen before it happens: a link goes to the new
   address and nothing moves until it is followed, and the old address is told
   either way. Both facts matter to somebody deciding whether to press it. */
export function EmailControl({ current }: { current: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState<EmailState, FormData>(changeEmail, {});
  const [dismissed, setDismissed] = React.useState(false);
  const done = state.done && !dismissed;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setDismissed(true); setOpen(true); }}>
        Change
      </Button>
      <Dialog
        open={open && !done}
        onClose={() => setOpen(false)}
        width={440}
        eyebrow="Address on file"
        title="Change the address you sign in with."
      >
        <form action={action} className="you-stack">
          <p className="mbr-dlg__lede mbr-status--inline">
            A link goes to the new address and nothing changes until you follow
            it. Your old address is told either way — that is how somebody finds
            out if a change was not theirs.
          </p>
          <Input label="New address" name="email" type="email" autoComplete="email" required />
          <Input
            label="Your password"
            name="current"
            type="password"
            autoComplete="current-password"
            required
            error={state.error}
          />
          <Button type="submit" variant="gold" pending={pending} pendingLabel="Sending">
            Send the link
          </Button>
        </form>
      </Dialog>
      {done ? (
        <Toast
          fixed
          message={`Check ${state.sentTo ?? "the new address"} for the link. Nothing moves until you follow it.`}
          duration={6000}
          onClose={() => { setDismissed(true); setOpen(false); }}
        />
      ) : null}
      {current ? <span className="you-note">Currently {current}</span> : null}
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
  /* The sheet, shown once. The club keeps only hashes and cannot show these
     again — which is what makes them worth having, and why the dialog will not
     close until the member says they have written them down. */
  const [sheet, setSheet] = React.useState<string[] | null>(null);
  const [sheetFailed, setSheetFailed] = React.useState(false);

  const [state, action, pending] = React.useActionState<TwoStepState, FormData>(async (prev, fd) => {
    const res = await confirmTwoStep(prev, fd);
    if (res.verified) {
      setBegun(null);
      if (res.codes?.length) {
        setSheet(res.codes);
      } else {
        setOpen(false);
        setSheetFailed(!!res.codesFailed);
        setToast({
          msg: res.codesFailed
            ? "Two-step is on, but the recovery codes could not be made. Make a set now — without one, losing your phone locks you out."
            : "Two-step is on. The gangway asks for a code once per sign-in.",
          tone: res.codesFailed ? "danger" : undefined,
        });
        router.refresh();
      }
    }
    return res;
  }, {});

  const freshSheet = () =>
    startTransition(async () => {
      const res = await newRecoveryCodes();
      if (res.error) setToast({ msg: res.error, tone: "danger" });
      else if (res.codes?.length) {
        setSheet(res.codes);
        setSheetFailed(false);
        setOpen(true);
      }
    });

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
        <>
          <Button variant="outline" size="sm" pending={busy} pendingLabel="Making…" onClick={freshSheet}>
            New recovery codes
          </Button>
          <Button variant="outline" size="sm" pending={busy} pendingLabel="Turning off…" onClick={stop}>
            Turn off
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" pending={busy} pendingLabel="Starting" onClick={start}>
          Turn on
        </Button>
      )}
      <Dialog
        open={open}
        /* A sheet on screen cannot be dismissed by clicking away: these are
           shown once and the club cannot show them again, so an accidental
           click outside the dialog would cost somebody their way back in. */
        onClose={() => (sheet ? undefined : setOpen(false))}
        width={440}
        eyebrow={sheet ? "Recovery codes" : "Two-step"}
        title={sheet ? "Write these down before you close this." : "Scan, then type the code."}
      >
        {sheet ? (
          <div className="you-stack">
            <p className="mbr-dlg__lede mbr-status--inline">
              Ten codes, each good once. If you lose your phone, one of these is
              how you get back in. The club keeps no copy and cannot show them
              again — print this, or put it somewhere that is not the phone.
            </p>
            <ul className="you-codes">
              {sheet.map((c) => (
                <li key={c} className="mbr-mono">{c}</li>
              ))}
            </ul>
            <Button
              variant="gold"
              onClick={() => {
                setSheet(null);
                setOpen(false);
                setToast({ msg: "Two-step is on, and your recovery codes are yours to keep." });
                router.refresh();
              }}
            >
              I have written them down
            </Button>
          </div>
        ) : live?.qr ? (
          <form action={action} className="you-stack">
            <input type="hidden" name="factorId" value={live.factorId ?? ""} />
            <input type="hidden" name="qr" value={live.qr ?? ""} />
            <input type="hidden" name="secret" value={live.secret ?? ""} />
            <p className="mbr-dlg__lede mbr-status--inline">
              Open a code app (1Password, Authy, Google Authenticator) and scan this. Then type the six digits it shows.
            </p>
            {/* The QR arrives from the auth server as an SVG data URI — an
                image, not a fetch, so the CSP has nothing to say about it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={live.qr} alt="Two-step QR code" width={180} height={180} className="you-qr" />
            <p className="mbr-mono you-key">
              OR TYPE THE KEY: {live.secret}
            </p>
            <Input label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" placeholder="000 000" required error={state.error} />
            <Button type="submit" variant="gold" pending={pending} pendingLabel="Checking">
              Turn on two-step
            </Button>
          </form>
        ) : null}
      </Dialog>
      {sheetFailed ? (
        <Notice tone="danger" compact>
          Two-step is on but you have no recovery codes. Make a set now — without
          one, losing your phone locks you out of your own account.
        </Notice>
      ) : null}
      {toast ? <Toast fixed message={toast.msg} tone={toast.tone} duration={4000} onClose={() => setToast(null)} /> : null}
    </>
  );
}
