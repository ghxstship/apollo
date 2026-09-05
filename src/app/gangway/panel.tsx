"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Badge, Button, Input } from "@/components/ds";
import { sendMagicLink, sendResetLink, signInWithPassword, signInWithProvider, type GangwayState } from "./actions";
import { PROVIDER_LABEL, type Provider } from "./ways";

type Way = "link" | "password" | "reset";

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

/* Three ways aboard on one panel. The link stays the default — no password to
   leak, and the roll decides who may board either way. A password is for the
   member whose inbox is far away, the kiosk, and the door; a reset link is
   the way back for a password forgotten. Provider buttons appear only for
   providers the owner has switched on. */
export function GangwayPanel({
  next,
  expired,
  noPass,
  providerFailed,
  providers,
}: {
  next: string;
  expired: boolean;
  noPass: boolean;
  providerFailed: boolean;
  providers: Provider[];
}) {
  const [way, setWay] = React.useState<Way>("link");
  const [linkState, linkAction] = React.useActionState<GangwayState, FormData>(sendMagicLink, {});
  const [pwState, pwAction] = React.useActionState<GangwayState, FormData>(signInWithPassword, {});
  const [resetState, resetAction] = React.useActionState<GangwayState, FormData>(sendResetLink, {});
  const [email, setEmail] = React.useState("");

  const sent = way === "link" ? linkState.sent : way === "reset" ? resetState.sent : false;
  const sentTo = way === "link" ? linkState.email : resetState.email;

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

      <div className="gw-ways" role="tablist" aria-label="Ways aboard">
        {(["link", "password"] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            className={"gw-way" + (way === w || (w === "password" && way === "reset") ? " gw-way--on" : "")}
            aria-selected={way === w || (w === "password" && way === "reset")}
            onClick={() => setWay(w)}
          >
            {w === "link" ? "Magic link" : "Password"}
          </button>
        ))}
      </div>

      {expired && !sent ? (
        <div className="gw-stale" role="alert">
          That link has gone stale. Send another.
        </div>
      ) : null}
      {noPass ? (
        <div className="gw-stale" role="alert">
          No pass under that address. Apply for membership, or sign in with the address on file.
        </div>
      ) : null}
      {providerFailed ? (
        <div className="gw-stale" role="alert">
          That sign-in did not go through. Use the link or your password.
        </div>
      ) : null}

      {sent ? (
        <div className="gw-sent" aria-live="polite">
          <Badge tone="positive">Link away</Badge>
          <p>{way === "reset" ? "If that address is on the roll, a reset link is in its inbox." : "The link is in your inbox."}</p>
          <div className="gw-mono" style={{ marginTop: 12 }}>
            SENT TO {String(sentTo ?? "").toUpperCase()} · HOLDS FOR 15 MINUTES
          </div>
          <div className="gw-mono" style={{ marginTop: 8 }}>
            WRONG ADDRESS?{" "}
            <button type="button" onClick={() => window.location.reload()}>
              SEND AGAIN
            </button>
          </div>
        </div>
      ) : way === "link" ? (
        <form action={linkAction} className="gw-stack">
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
      ) : way === "password" ? (
        <form action={pwAction} className="gw-stack">
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
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            error={pwState.error}
          />
          <Submit idle="Sign in" busy="Signing in" />
          <div className="gw-mono">
            FORGOT IT?{" "}
            <button type="button" onClick={() => setWay("reset")}>
              SEND A RESET LINK
            </button>
          </div>
        </form>
      ) : (
        <form action={resetAction} className="gw-stack">
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
            <button type="button" onClick={() => setWay("password")}>
              BACK TO THE PASSWORD
            </button>
          </div>
        </form>
      )}

      {providers.length > 0 && !sent ? (
        <div className="gw-providers">
          <div className="gw-or">or</div>
          {providers.map((p) => (
            <form key={p} action={signInWithProvider}>
              <input type="hidden" name="provider" value={p} />
              <input type="hidden" name="next" value={next} />
              <Button type="submit" variant="outline" fullWidth>
                Continue with {PROVIDER_LABEL[p]}
              </Button>
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
