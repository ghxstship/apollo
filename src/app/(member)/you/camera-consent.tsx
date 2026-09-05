"use client";

import React from "react";
import { Notice, Switch } from "@/components/ds";
import { setOnCamera } from "./actions";

/* The show is the point, so the default is in — but the choice is standing,
   one tap, and honoured at the next port. The wording tracks the release the
   member signed; the two must never drift.
   TODO(owner): confirm this copy against the release clause as published —
   the component cannot read the document it is meant to echo. */
export function CameraConsent({ onCamera }: { onCamera: boolean }) {
  const [pending, start] = React.useTransition();
  /* The switch moves as the finger lifts and the sentence under it changes
     with it; the write is the truth a round trip later (setOnCamera
     revalidates /you), and a refusal puts both back with the reason. The same
     shape the ballot uses, in place of a hand-rolled setOn/setOn(!v) pair. */
  const [on, setOn] = React.useOptimistic(onCamera);
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
        {failed ? (
          <Notice tone="danger" compact className="mbr-sub--xs">
            {failed}
          </Notice>
        ) : null}
      </div>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Appear in the show"
        onChange={(e) => {
          const v = e.target.checked;
          setFailed(null);
          start(async () => {
            setOn(v);
            const res = await setOnCamera(v);
            if (res.error) setFailed(res.error);
          });
        }}
      />
    </div>
  );
}
