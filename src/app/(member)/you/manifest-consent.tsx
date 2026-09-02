"use client";

import React from "react";
import { Switch } from "@/components/ds";
import { setManifestVisibility } from "./actions";

/* Every member was on every manifest, visible to the whole club, having never
   been asked. The consent this relies on existed as a column with a default of
   true that nothing in the product ever wrote — and the passes update policy
   carried is_active(), so a member the club had placed on hold could not change
   it even through the API. The person most likely to want off a list was the
   one blocked from leaving it.

   Its own control rather than a field in the profile form, for the same
   reason: this must work whatever the member's standing, and the profile form
   does not. */
export function ManifestConsent({ onManifest }: { onManifest: boolean }) {
  const [pending, start] = React.useTransition();
  const [on, setOn] = React.useState(onManifest);
  const [failed, setFailed] = React.useState(false);

  return (
    <div className="you-row">
      <div>
        <b>Show my name on the manifest</b>
        <p>
          {on
            ? "Members looking at an episode you are aboard can see you are sailing."
            : "You sail unlisted. The crew still hold your boarding pass; the other members see only that a seat is taken."}
        </p>
        {failed ? (
          <p style={{ color: "var(--siren)" }}>That didn&rsquo;t save. Try again, or hail Shoreside.</p>
        ) : null}
      </div>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Show my name on the manifest"
        onChange={(e) => {
          const v = e.target.checked;
          setOn(v);
          setFailed(false);
          start(async () => {
            const res = await setManifestVisibility(v);
            if (res.error) {
              /* Put the switch back where it was. A privacy control that looks
                 like it saved and did not is worse than one that refuses. */
              setOn(!v);
              setFailed(true);
            }
          });
        }}
      />
    </div>
  );
}
