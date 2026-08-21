"use client";

import React from "react";
import { Switch } from "@/components/ds";
import { setOnCamera } from "./actions";

/* The cameras are the show, so the default is on — but the choice is standing,
   one tap, and honored at the next port. The wording matches the filming
   clause the member signed; the two must never drift. */
export function CameraConsent({ onCamera }: { onCamera: boolean }) {
  const [pending, start] = React.useTransition();
  const [on, setOn] = React.useState(onCamera);

  return (
    <div className="you-row">
      <div>
        <b>Appear on camera</b>
        <p>
          {on
            ? "You are in the show. Turn this off and production keeps you out of frame and out of the cut."
            : "You are off camera. Withdrawing aboard docks you at the next port — the release explains the rest."}
        </p>
      </div>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Appear on camera"
        onChange={(e) => {
          const v = e.target.checked;
          setOn(v);
          start(async () => {
            const res = await setOnCamera(v);
            if (res.error) setOn(!v);
          });
        }}
      />
    </div>
  );
}
