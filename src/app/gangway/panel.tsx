"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Badge, Button, Input, Notice, Tabs, TextButton } from "@/components/ds";
import { sendMagicLink, sendResetLink, signInWithPassword, signInWithProvider, type GangwayState } from "./actions";
import { PasswordInput } from "./password-input";
import { PROVIDER_LABEL, type Provider } from "./ways";

type Way = "link" | "password" | "reset";
type Tab = "link" | "password";

const TABS: { id: Tab; label: string; panelId: string; tabId: string }[] = [
  { id: "link", label: "Magic link", panelId: "gw-panel-link", tabId: "gw-tab-link" },
  { id: "password", label: "Password", panelId: "gw-panel-password", tabId: "gw-tab-password" },
];

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth pending={pending} pendingLabel={busy}>
      {idle}
    </Button>
  );
}

/* A provider button is a navigation away, so its label stays put — the
   pressed state is the only pending it needs. */
function ProviderSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" fullWidth pending={pending}>
      {children}
    </Button>
  );
}

type PanelProps = {
  next: string;
  expired: boolean;
  noPass: boolean;
  providerFailed: boolean;
  providers: Provider[];
};

/* Three ways aboard on one panel. The link stays the default — no password to
   leak, and the roll decides who may board either way. A password is for the
   member whose inbox is far away, the kiosk, and the door; a reset link is
   the way back for a password forgotten. Provider buttons appear only for
   providers the owner has switched on.

   The way and the address live out here; the three action states live in
   GangwayForms below, keyed on `epoch`. "Send again" bumps the epoch, which
   remounts the forms and so clears every action state — useActionState has no
   reset of its own — while the tab and the typed address stay where they were.
   It used to reload the page, which dropped a reset receipt back onto the
   link tab. */
export function GangwayPanel(props: PanelProps) {
  const [way, setWay] = React.useState<Way>("link");
  const [email, setEmail] = React.useState("");
  const [epoch, setEpoch] = React.useState(0);
  return (
    <GangwayForms
      key={epoch}
      {...props}
      way={way}
      setWay={setWay}
      email={email}
      setEmail={setEmail}
      onAgain={() => setEpoch((e) => e + 1)}
    />
  );
}

function GangwayForms({
  next,
  expired,
  noPass,
  providerFailed,
  providers,
  way,
  setWay,
  email,
  setEmail,
  onAgain,
}: PanelProps & {
  way: Way;
  setWay: (w: Way) => void;
  email: string;
  setEmail: (v: string) => void;
  onAgain: () => void;
}) {
  const [linkState, linkAction] = React.useActionState<GangwayState, FormData>(sendMagicLink, {});
  const [pwState, pwAction] = React.useActionState<GangwayState, FormData>(signInWithPassword, {});
  const [resetState, resetAction] = React.useActionState<GangwayState, FormData>(sendResetLink, {});

  const sent = way === "link" ? linkState.sent : way === "reset" ? resetState.sent : false;
  const sentTo = way === "link" ? linkState.email : resetState.email;
  const tab: Tab = way === "link" ? "link" : "password";

  /* The submit button unmounts with the form when the receipt arrives, which
     drops keyboard focus on the body. The receipt takes it instead. */
  const sentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (sent) sentRef.current?.focus({ preventScroll: true });
  }, [sent]);

  /* All three forms stay mounted in one grid cell, so the panel is as tall as
     the tallest of them whichever is showing and a tab switch never moves the
     "or" rule or the membership line underneath. The two that are not showing
     are invisible and inert — out of the tab order, out of the accessibility
     tree, and their fields keep what was typed. */
  const formClass = (w: Way) => "gw-stack gw-form" + (way === w ? " gw-form--on" : " gw-form--off");
  /* Each panel points back at the tab that owns it. */
  const formProps = (w: Way, ownerTab: Tab) => ({
    className: formClass(w),
    role: "tabpanel",
    id: `gw-panel-${w}`,
    "aria-labelledby": TABS.find((t) => t.id === ownerTab)?.tabId,
    "aria-hidden": way !== w ? true : undefined,
    inert: way !== w ? true : undefined,
  });

  return (
    <div>
      <h1 className="gw-h">The gangway.</h1>
      <p className="gw-sub">
        {way === "password"
          ? "Email and password. The link is still here if you would rather."
          : way === "reset"
            ? "A reset link goes to the address on file. Click it and choose a new password."
            : "We send a link; you click it. No password needed — unless you want one."}
      </p>

      <Tabs className="gw-ways" label="Ways aboard" items={TABS} value={tab} onChange={(id) => setWay(id as Tab)} />

      {expired && !sent ? (
        <Notice tone="danger" compact className="gw-stale ls-rise">
          That link has gone stale. Send another.
        </Notice>
      ) : null}
      {noPass ? (
        <Notice tone="danger" compact className="gw-stale ls-rise">
          No pass under that address. Apply for membership, or sign in with the address on file.
        </Notice>
      ) : null}
      {providerFailed ? (
        <Notice tone="danger" compact className="gw-stale ls-rise">
          That sign-in did not go through. Use the link or your password.
        </Notice>
      ) : null}

      {sent ? (
        <div className="gw-sent ls-rise" ref={sentRef} tabIndex={-1}>
          <Notice tone="positive">
            <Badge tone="positive">Link away</Badge>
            <p>{way === "reset" ? "If that address is on the roll, a reset link is in its inbox." : "The link is in your inbox."}</p>
            <div className="gw-mono gw-sent__meta">
              SENT TO {String(sentTo ?? "").toUpperCase()} · HOLDS FOR 15 MINUTES
            </div>
            <div className="gw-mono gw-sent__meta">
              WRONG ADDRESS?{" "}
              <TextButton size="sm" onClick={onAgain}>
                SEND AGAIN
              </TextButton>
            </div>
          </Notice>
        </div>
      ) : (
        <div className="gw-forms">
          <form action={linkAction} {...formProps("link", "link")}>
            <input type="hidden" name="next" value={next} />
            <Input
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@shore.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={linkState.error}
            />
            <Submit idle="Send the magic link" busy="Sending" />
          </form>

          <form action={pwAction} {...formProps("password", "password")}>
            <input type="hidden" name="next" value={next} />
            <Input
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@shore.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordInput
              label="Password"
              name="password"
              autoComplete="current-password"
              required
              error={pwState.error}
            />
            <Submit idle="Sign in" busy="Signing in" />
            <div className="gw-mono">
              FORGOT IT?{" "}
              <TextButton size="sm" onClick={() => setWay("reset")}>
                SEND A RESET LINK
              </TextButton>
            </div>
          </form>

          <form action={resetAction} {...formProps("reset", "password")}>
            <input type="hidden" name="next" value={next} />
            <Input
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@shore.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={resetState.error}
            />
            <Submit idle="Send the reset link" busy="Sending" />
            <div className="gw-mono">
              REMEMBERED IT?{" "}
              <TextButton size="sm" onClick={() => setWay("password")}>
                BACK TO THE PASSWORD
              </TextButton>
            </div>
          </form>
        </div>
      )}

      {providers.length > 0 && !sent ? (
        <div className="gw-providers">
          <div className="gw-or">or</div>
          {providers.map((p) => (
            <form key={p} action={signInWithProvider}>
              <input type="hidden" name="provider" value={p} />
              <input type="hidden" name="next" value={next} />
              <ProviderSubmit>Continue with {PROVIDER_LABEL[p]}</ProviderSubmit>
            </form>
          ))}
        </div>
      ) : null}

      <div className="gw-alt">
        No pass under your email, or holding an invitation?{" "}
        <a href="/membership#apply">Apply for membership</a>
      </div>
    </div>
  );
}
