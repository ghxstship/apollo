"use client";

import React from "react";
import { Button, Notice, Radio, Textarea } from "@/components/ds";
import { askAboutMyData } from "./actions";
import { REQUEST_KINDS, type RequestKind } from "./kinds";

/* — Asking the club something about your own data. —

     The six rights, as six plain sentences rather than six Latin nouns. A
     member should not have to know that "restriction" is Art. 18 to use it,
     and the word the database stores is not the word the person reads. */
const WHAT_IT_MEANS: Record<RequestKind, { title: string; line: string }> = {
  access: {
    title: "Tell me what you hold about me",
    line: "A written answer covering anything the export above does not — how it is used, who else sees it, and how long it is kept.",
  },
  portability: {
    title: "Give me my data in a form I can take elsewhere",
    line: "The export above is that file, immediately. Ask here if you need it in another shape or sent somewhere.",
  },
  rectification: {
    title: "Something you hold about me is wrong",
    line: "Say what it is and what it should be. Your name, city and interests you can edit yourself; the rest comes here.",
  },
  erasure: {
    title: "Delete something you hold about me",
    line: "Some of it the club must keep — signed declarations and the figures on the ledger. The answer will say which, and why.",
  },
  restriction: {
    title: "Stop using something while we sort it out",
    line: "The club keeps it but stops acting on it, which is the right thing to ask for while a correction is being argued about.",
  },
  objection: {
    title: "Stop working things out about me",
    line: "The club scores who is likely to want what, and builds the lists it writes to from those scores. This asks it to leave you out of that.",
  },
};

export function AskAboutMyData({ openKinds }: { openKinds: string[] }) {
  const [kind, setKind] = React.useState<RequestKind>("access");
  const [detail, setDetail] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const alreadyOpen = openKinds.includes(kind);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await askAboutMyData(kind, detail);
      if (res.error) {
        setError(res.error);
        return;
      }
      setDetail("");
      setDone(true);
    });
  };

  return (
    <form className="dsr-form" onSubmit={submit}>
      <fieldset className="dsr-kinds">
        <legend className="dsr-legend">What are you asking for?</legend>
        {REQUEST_KINDS.map((k) => (
          <Radio
            key={k}
            boxed
            name="kind"
            value={k}
            checked={kind === k}
            label={WHAT_IT_MEANS[k].title}
            description={WHAT_IT_MEANS[k].line}
            onChange={() => {
              setKind(k);
              setDone(false);
              setError(null);
            }}
          />
        ))}
      </fieldset>

      <Textarea
        label="Anything you want to add"
        hint="Optional. The more specific, the faster the answer."
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        rows={3}
        maxLength={2000}
      />

      {alreadyOpen ? (
        <Notice tone="info" compact>
          That request is already open. The club owes you an answer on it before another.
        </Notice>
      ) : null}

      <div className="dsr-acts">
        <Button type="submit" size="sm" pending={pending} pendingLabel="Sending…" disabled={alreadyOpen}>
          Ask the club
        </Button>
        {error ? (
          <Notice tone="danger" compact>
            {error}
          </Notice>
        ) : done ? (
          <span role="status" className="mbr-status mbr-status--inline">
            Asked. The clock is running and you can see it above.
          </span>
        ) : null}
      </div>
    </form>
  );
}
