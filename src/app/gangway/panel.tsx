"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Badge, Button, Input } from "@/components/ds";
import { sendMagicLink, type GangwayState } from "./actions";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? "Sending" : "Send the magic link"}
    </Button>
  );
}

export function GangwayPanel({ next, expired }: { next: string; expired: boolean }) {
  const [state, formAction] = React.useActionState<GangwayState, FormData>(
    sendMagicLink,
    {}
  );

  return (
    <div>
      <h1 className="gw-h">The gangway.</h1>
      <p className="gw-sub">No passwords aboard. We send a link; you click it.</p>
      {expired && !state.sent ? (
        <div className="gw-stale" role="alert">
          That link has gone stale. Send another.
        </div>
      ) : null}
      {!state.sent ? (
        <form action={formAction} className="gw-stack">
          <input type="hidden" name="next" value={next} />
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@shore.com"
            required
            error={state.error}
          />
          <SendButton />
        </form>
      ) : (
        <div className="gw-sent" aria-live="polite">
          <Badge tone="laurel">Link away</Badge>
          <p>The link is in your inbox.</p>
          <div className="gw-mono" style={{ marginTop: 12 }}>
            SENT TO {String(state.email ?? "").toUpperCase()} · HOLDS FOR 15 MINUTES
          </div>
          <div className="gw-mono" style={{ marginTop: 8 }}>
            WRONG ADDRESS?{" "}
            <button type="button" onClick={() => window.location.reload()}>
              SEND AGAIN
            </button>
          </div>
        </div>
      )}
      <div className="gw-alt">
        No pass under your email, or holding an invitation?{" "}
        <a href="/membership#apply">Apply for membership</a>
      </div>
    </div>
  );
}
