"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Avatar, Button, Input } from "@/components/ds";
import { setDeckStatus, type DeckStatusResult } from "./actions";

export type DeckMember = {
  id: string;
  name: string;
  tone: "ink" | "sea" | "gold" | "sand";
  status: string | null;
  checkedIn: string;
  self: boolean;
};

/* Who is on deck right now, and your own line under it. The list is the
   gangway's — checked in, consented to the manifest, on a live episode — read
   through aboard_now(), which refuses anyone not holding a pass. The form
   writes one line, at most eighty characters, that dies with the night. */
export function OnDeck({
  episodeId,
  members,
  ownStatus,
}: {
  episodeId: string;
  members: DeckMember[];
  ownStatus: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState<DeckStatusResult, FormData>(
    setDeckStatus,
    {}
  );

  /* The list is server-rendered, so a saved line shows up in it only after a
     re-read. */
  React.useEffect(() => {
    if (state.status !== undefined && !state.error) router.refresh();
  }, [state, router]);

  const current = state.status !== undefined ? state.status : ownStatus;

  return (
    <div>
      {members.length === 0 ? (
        <p className="deck-note">
          Nobody stamped aboard yet — or nobody who chose to be seen. The list fills as the
          gangway does.
        </p>
      ) : (
        <div className="deck-list">
          {members.map((m) => (
            <div key={m.id} className="deck-row">
              <Avatar name={m.name} tone={m.tone} size="sm" />
              <div className="deck-row__who">
                <b>
                  {m.name}
                  {m.self ? <span className="mbr-mono deck-row__you"> · YOU</span> : null}
                </b>
                {m.status ? <span>{m.status}</span> : null}
              </div>
              <span className="mbr-mono deck-row__t">{m.checkedIn}</span>
            </div>
          ))}
        </div>
      )}

      <form action={formAction} className="deck-form">
        <input type="hidden" name="episode" value={episodeId} />
        <Input
          name="status"
          label="Your line on deck"
          defaultValue={current ?? ""}
          maxLength={80}
          placeholder="At the bow. Come say hello."
          hint="One line, eighty characters. It clears when the night ends."
        />
        <Button type="submit" name="intent" value="set" variant="gold" size="sm" disabled={pending}>
          Set
        </Button>
        {current ? (
          <Button type="submit" name="intent" value="clear" variant="ghost" size="sm" disabled={pending}>
            Clear
          </Button>
        ) : null}
      </form>
      {state.error ? (
        <p className="deck-err" role="alert">
          {state.error}
        </p>
      ) : null}
      <p className="deck-note">
        Who appears here is the manifest consent on the You page. You are on it once the gangway
        stamps you aboard.
      </p>
    </div>
  );
}
