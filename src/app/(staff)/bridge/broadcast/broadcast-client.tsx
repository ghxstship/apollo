"use client";

import React from "react";
import { Button, Dialog, Input, Select, Table, Textarea, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { sendBroadcast, type Audience } from "./actions";

export type SentRow = {
  id: string;
  title: string;
  audience: string;
  channels: string;
  recipients: number;
  when: string;
  [key: string]: unknown;
};

type Opt = { value: string; label: string };

const KINDS: Opt[] = [
  { value: "all", label: "Every active member" },
  { value: "city", label: "A city" },
  { value: "episode", label: "An episode's manifest" },
  { value: "tier", label: "A tier" },
  { value: "lapsed", label: "Members held for dues" },
];
const TIERS: Opt[] = [
  { value: "regional", label: "Regional" },
  { value: "national", label: "National" },
  { value: "global", label: "Global" },
];

export function BroadcastClient({ cities, episodes, sent }: { cities: Opt[]; episodes: Opt[]; sent: SentRow[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [kind, setKind] = React.useState("all");
  const [id, setId] = React.useState("");
  const [tier, setTier] = React.useState("regional");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [notice, setNotice] = React.useState(true);
  const [email, setEmail] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  const audience = (): Audience | null => {
    if (kind === "all" || kind === "lapsed") return { kind };
    if (kind === "tier") return { kind, tier: tier as "regional" | "national" | "global" };
    if ((kind === "city" || kind === "episode") && id) return { kind, id };
    return null;
  };
  const audienceLabel =
    kind === "city"
      ? cities.find((c) => c.value === id)?.label
      : kind === "episode"
        ? episodes.find((e) => e.value === id)?.label
        : kind === "tier"
          ? `${TIERS.find((t) => t.value === tier)?.label} tier`
          : KINDS.find((k) => k.value === kind)?.label;
  const ready = !!audience() && title.trim().length > 0 && body.trim().length > 0 && (notice || email);

  const send = () => {
    const a = audience();
    if (!a) return;
    setConfirm(false);
    startTransition(async () => {
      const channels = [...(notice ? (["notice"] as const) : []), ...(email ? (["email"] as const) : [])];
      const res = await sendBroadcast(a, title, body, channels);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        show({ msg: `Said to ${res.recipients ?? 0}.`, meta: (audienceLabel ?? "").toUpperCase(), tone: "positive" });
        setTitle("");
        setBody("");
      }
    });
  };

  return (
    <>
      <div className="hm-panel">
        <div className="hm-form">
          <div className="hm-plan__ids">
            <Select label="Who" options={KINDS} value={kind} onChange={(e) => { setKind(e.target.value); setId(""); }} />
            {kind === "city" ? (
              <Select label="City" placeholder="Pick a city" options={cities} value={id} onChange={(e) => setId(e.target.value)} />
            ) : null}
            {kind === "episode" ? (
              <Select label="Episode" placeholder="Pick an episode" options={episodes} value={id} onChange={(e) => setId(e.target.value)} />
            ) : null}
            {kind === "tier" ? (
              <Select label="Tier" options={TIERS} value={tier} onChange={(e) => setTier(e.target.value)} />
            ) : null}
          </div>
          <Input label="Title" placeholder="The venue for Saturday has moved." maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            label="The word"
            rows={6}
            maxLength={2000}
            placeholder="Say it the way you would at the door — where, when, what to bring."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="hm-plan__ids">
            <label className="hm-check">
              <input type="checkbox" checked={notice} onChange={(e) => setNotice(e.target.checked)} />
              <span>In the app, as a notice</span>
            </label>
            <label className="hm-check">
              <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
              <span>By email, as a letter from the Bridge</span>
            </label>
            <Button variant="gold" size="sm" disabled={pending || !ready} onClick={() => setConfirm(true)}>
              Say it
            </Button>
          </div>
        </div>
      </div>

      <section className="hm-sec">
        <h2>What has been said.</h2>
        <div className="hm-panel">
          <Table
            rowKey={(r: SentRow) => r.id}
            columns={[
              { key: "when", label: "Sent", mono: true, width: 130 },
              { key: "title", label: "Title" },
              { key: "audience", label: "To" },
              { key: "channels", label: "How", mono: true, width: 110 },
              { key: "recipients", label: "Reached", mono: true, width: 80, align: "end" },
            ]}
            rows={sent}
          />
          {sent.length === 0 ? (
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
              Nothing said yet. The first one lands here with its count.
            </p>
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
            <Button variant="gold" disabled={pending} onClick={send}>Say it</Button>
          </>
        }
      >
        <p style={{ fontSize: "var(--text-sm)" }}>
          {notice ? "A notice lands in the app for everyone in the audience" : ""}
          {notice && email ? ", and " : ""}
          {email ? "a letter goes out to everyone with an address on file" : ""}. It cannot be
          unsaid — a correction is another broadcast.
        </p>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
