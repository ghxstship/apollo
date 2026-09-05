"use client";

import React from "react";
import { Notice, Switch } from "@/components/ds";
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
  /* The switch moves as the finger lifts and the sentence under it changes
     with it; the write is the truth a round trip later (setManifestVisibility
     revalidates /you), and a refusal puts both back with the reason. The same
     shape the ballot uses, in place of a hand-rolled setOn/setOn(!v) pair. */
  const [on, setOn] = React.useOptimistic(onManifest);
  const [failed, setFailed] = React.useState(false);

  return (
    <div className="you-row">
      <div>
        {/* "the manifest" alone left a member asking which one. A manifest is
            the boarding list for ONE episode, so the label says so — and the
            line under it already puts an episode in view. */}
        <b>Show my name on the episode manifest</b>
        <p>
          {on
            ? "Members looking at an episode you are aboard can see you are sailing."
            : "You sail unlisted. The crew still hold your boarding pass; the other members see only that a seat is taken."}
        </p>
        {failed ? (
          <Notice tone="danger" compact className="mbr-sub--xs">
            That didn&rsquo;t save. Try again, or hail Shoreside.
          </Notice>
        ) : null}
      </div>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Show my name on the episode manifest"
        onChange={(e) => {
          const v = e.target.checked;
          setFailed(false);
          start(async () => {
            setOn(v);
            const res = await setManifestVisibility(v);
            /* The switch goes back where it was on its own — the optimistic
               value lapses when the transition ends and the record has not
               moved. A privacy control that looks like it saved and did not
               is worse than one that refuses, so the refusal is said too. */
            if (res.error) setFailed(true);
          });
        }}
      />
    </div>
  );
}
