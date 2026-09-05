"use client";

import React from "react";
import { Badge, Button, Checkbox, Dialog, Input, Table, Textarea, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { sendBroadcast, sendTestToSelf, type Channel } from "./actions";
import { AudienceBuilder } from "./audience-builder";
import { EVERY_ACTIVE, audienceReady, describeAudience, type Audience, type Lookups } from "./audience";

export type SentRow = {
  id: string;
  title: string;
  audience: string;
  channels: string;
  recipients: number;
  when: string;
  status: "queued" | "sent";
  sendAt: string | null;
  [key: string]: unknown;
};

const CHANNEL_LABEL: Record<Channel, string> = {
  notice: "In the app, as a notice",
  email: "By email, as a letter from the Bridge",
  push: "Push",
  sms: "Text",
};

export function BroadcastClient({ lookups, sent }: { lookups: Lookups; sent: SentRow[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  type Filter = Extract<Audience, { kind: "filter" }>;
  const [who, setWho] = React.useState<Filter>(EVERY_ACTIVE as Filter);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [channels, setChannels] = React.useState<Record<Channel, boolean>>({ notice: true, email: false, push: false, sms: false });
  const [sendAt, setSendAt] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);

  const picked = (Object.keys(channels) as Channel[]).filter((c) => channels[c]);
  const setChannel = (c: Channel, on: boolean) => setChannels((s) => ({ ...s, [c]: on }));

  const audience = (): Audience | null => (audienceReady(who) ? who : null);
  const audienceLabel = describeAudience(who, lookups);
  const ready = !!audience() && title.trim().length > 0 && body.trim().length > 0 && picked.length > 0;

  const send = () => {
    const a = audience();
    if (!a) return;
    setConfirm(false);
    startTransition(async () => {
      const res = await sendBroadcast(a, title, body, picked, sendAt);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        show({
          msg: res.queued ? "Queued. The clock says it on the hour." : `Said to ${res.recipients ?? 0}.`,
          meta: (audienceLabel ?? "").toUpperCase(),
          tone: "positive",
        });
        setTitle("");
        setBody("");
        setSendAt("");
      }
    });
  };

  const test = () => {
    startTransition(async () => {
      const res = await sendTestToSelf(title, body, picked);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else show({ msg: "Sent to you alone.", meta: (res.sent ?? []).join(" + ").toUpperCase() });
    });
  };

  return (
    <>
      <div className="hm-panel">
        <div className="hm-form">
          <AudienceBuilder value={who} onChange={setWho} lookups={lookups} />
          <Input label="Title" placeholder="The venue for Saturday has moved." maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            label="The word"
            rows={6}
            maxLength={2000}
            placeholder="Say it the way you would at the door — where, when, what to bring."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="ls-choices" role="group" aria-label="Channels">
            {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
              <Checkbox key={c} label={CHANNEL_LABEL[c]} checked={channels[c]} onChange={(e) => setChannel(c, e.target.checked)} />
            ))}
          </div>
          <p className="hm-note">
            A notice already reaches push; pick push alone for a word that should not sit in the
            Inbox. A text goes only to a verified number, and is cut at 140 characters.
          </p>
          <div className="hm-form__row">
            <Input
              label="Send at"
              type="datetime-local"
              hint="On the club's clock. Blank says it at once; set, it waits for the hour."
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
            />
            <span className="hm-acts hm-acts--end">
              <Button variant="outline" size="sm" disabled={pending || !title.trim() || !body.trim() || picked.length === 0} onClick={test}>
                Send me a test
              </Button>
              <Button variant="gold" size="sm" disabled={pending || !ready} onClick={() => setConfirm(true)}>
                {sendAt ? "Queue it" : "Say it"}
              </Button>
            </span>
          </div>
        </div>
      </div>

      <section className="hm-sec">
        <h2>What has been said.</h2>
        <div className="hm-panel">
          <Table
            rowKey={(r: SentRow) => r.id}
            columns={[
              { key: "when", label: "Written", mono: true, width: 130 },
              { key: "title", label: "Title" },
              { key: "audience", label: "To" },
              { key: "channels", label: "How", mono: true, width: 130 },
              {
                key: "status",
                label: "State",
                width: 170,
                render: (r: SentRow) =>
                  r.status === "queued" ? (
                    <Badge tone="caution">Queued · {r.sendAt ?? "—"}</Badge>
                  ) : (
                    <Badge tone="positive">Sent{r.sendAt && r.sendAt !== r.when ? ` · ${r.sendAt}` : ""}</Badge>
                  ),
              },
              { key: "recipients", label: "Reached", mono: true, width: 80, align: "end" },
            ]}
            rows={sent}
          />
          {sent.length === 0 ? (
            <p className="hm-empty">Nothing said yet. The first one lands here with its count.</p>
          ) : null}
        </div>
      </section>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        width={440}
        eyebrow={audienceLabel ?? ""}
        title={`Say “${title.trim()}” to ${audienceLabel ?? "them"}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Not yet</Button>
            <Button variant="gold" disabled={pending} onClick={send}>{sendAt ? "Queue it" : "Say it"}</Button>
          </>
        }
      >
        <p className="hm-body">
          {sendAt ? "It waits for the hour and goes out on the clock's next pass, within five minutes. " : ""}
          It reaches everyone in the audience by {picked.map((c) => (c === "sms" ? "text" : c)).join(", ")}. It
          cannot be unsaid — a correction is another broadcast.
        </p>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
