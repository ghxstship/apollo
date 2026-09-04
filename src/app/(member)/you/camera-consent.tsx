"use client";

import React from "react";
import { Switch } from "@/components/ds";
import { setOnCamera } from "./actions";

/* The show is the point, so the default is in — but the choice is standing,
   one tap, and honoured at the next port. The wording tracks the release the
   member signed; the two must never drift.
   TODO(owner): confirm this copy against the release clause as published —
   the component cannot read the document it is meant to echo. */
export function CameraConsent({ onCamera }: { onCamera: boolean }) {
  const [pending, start] = React.useTransition();
  const [on, setOn] = React.useState(onCamera);
  const [failed, setFailed] = React.useState<string | null>(null);

  return (
    <div className="you-row">
      <div>
        <b>Appear in the show</b>
        <p>
          {on
            ? "You are in the show. Turn this off and you stay out of frame and out of every cut."
            : "You are out of the show. Withdrawing aboard takes effect at the next port — the release you signed explains the rest."}
        </p>
        {/* The switch used to spring back in silence when the write was
            refused — a consent control that looks like it took and did not. */}
        {failed ? <p style={{ color: "var(--siren)" }}>{failed}</p> : null}
      </div>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Appear in the show"
        onChange={(e) => {
          const v = e.target.checked;
          setOn(v);
          setFailed(null);
          start(async () => {
            const res = await setOnCamera(v);
            if (res.error) {
              setOn(!v);
              setFailed(res.error);
            }
          });
        }}
      />
    </div>
  );
}
