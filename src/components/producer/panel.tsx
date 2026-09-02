"use client";

/* The Producer — the [un] face of Aurora, the ATLVS ecosystem engine. The name
   is per-stage; the confirm-first contract is Aurora's. */

import React from "react";
import Link from "next/link";
import { Button, Icon, IconButton } from "@/components/ds";
import { useModal } from "@/components/ds/use-modal";
import { knots, MAILBOX, SURFACES } from "@/lib/brand";
import { logDateTime, price } from "@/lib/format";
import {
  producerBalance,
  producerNextBerth,
  producerOpenShoreside,
  producerReleaseBerth,
  producerReleaseBerthBySlug,
  producerSailings,
  producerWeather,
} from "./actions";

type CardAction =
  | { type: "release"; voyageId: string }
  | { type: "releaseSlug"; slug: string }
  | { type: "hail"; question: string }
  | { type: "link"; href: string };

type Msg =
  | { kind: "sys"; text: string }
  | { kind: "bot"; text: string; mailto?: boolean }
  | { kind: "user"; text: string }
  | { kind: "card"; title: string; meta: string; confirm: string; action: CardAction };

const SHORE = MAILBOX.shore;

const QUICK = [
  ["berth", "Next pass"],
  ["sailings", "Find a sailing"],
  ["release", "Release my pass"],
  ["balance", "My balance"],
  ["weather", "Weather"],
] as const;

type Intent = (typeof QUICK)[number][0] | null;

type ChatMessage = { role: "user" | "assistant"; content: string };

type ProducerApiResponse = {
  fallback?: boolean;
  reply?: string;
  action?:
    | { kind: "reserve" | "release"; voyage_slug: string; title: string; summary: string }
    | { kind: "hail_shoreside"; question: string; title: string; summary: string };
};

/* The hand-off card. One shape whether the brain proposed it or dead reckoning
   ran out of intents: confirming opens the member's Shoreside thread with the
   question already posted, so a person reads a question rather than a hail. */
function hailCard(question: string, summary?: string): Msg {
  return {
    kind: "card",
    title: "Hail Shoreside",
    meta: summary ?? "Opens your Shoreside thread with this question posted. A person answers, usually within the hour.",
    confirm: "Hail Shoreside",
    action: { type: "hail", question },
  };
}

function intentOf(text: string): Intent {
  const s = text.toLowerCase();
  if (/release|cancel|drop|give (up|back)/.test(s)) return "release";
  if (/next|my berth|my pass|aboard|when/.test(s)) return "berth";
  if (/find|sail|voyage|book|reserve|manifest/.test(s)) return "sailings";
  if (/balance|knot|fathom|ledger|account|owe/.test(s)) return "balance";
  if (/weather|hold|wind|storm/.test(s)) return "weather";
  return null;
}

function accountLine(cents: number): string {
  const abs = price(Math.abs(cents)) === "COMPLIMENTARY" ? "$0" : price(Math.abs(cents));
  if (cents === 0) return "Your member account is square.";
  return cents < 0
    ? `Your member account carries ${abs} in charges.`
    : `Your member account holds ${abs} in credit.`;
}

export function ProducerPanel({ onClose }: { onClose: () => void }) {
  const panelRef = useModal(true, onClose, { modal: false });

  const [msgs, setMsgs] = React.useState<Msg[]>([
    { kind: "sys", text: "READS YOUR MANIFEST · NEVER POSTS OR PAYS WITHOUT ASKING" },
    {
      kind: "bot",
      text: "the Producer here. I can read your manifest, find sailings, release passes, and read your ledgers. Anything that changes the record stops for your confirmation.",
    },
  ]);
  const [typing, setTyping] = React.useState(false);
  const [input, setInput] = React.useState("");
  const bodyRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, typing]);

  const push = (...m: Msg[]) => setMsgs((s) => [...s, ...m]);

  const run = async (fn: () => Promise<Msg[]>) => {
    setTyping(true);
    try {
      const out = await fn();
      push(...out);
    } catch {
      push({ kind: "bot", text: "That didn't land — no signal, or the office is dark. Try again." });
    } finally {
      setTyping(false);
    }
  };

  /* LLM brain plumbing — transcript of free-text exchanges only. */
  const apiMessages = React.useRef<ChatMessage[]>([]);
  const fallbackMode = React.useRef(false);
  const fallbackNoticed = React.useRef(false);

  const enterFallback = () => {
    fallbackMode.current = true;
    if (!fallbackNoticed.current && process.env.NODE_ENV === "development") {
      fallbackNoticed.current = true;
      push({
        kind: "sys",
        text: "the Producer is running dead reckoning — set ANTHROPIC_API_KEY for full charts.",
      });
    }
  };

  const cardFor = (action: NonNullable<ProducerApiResponse["action"]>, asked: string): Msg => {
    if (action.kind === "hail_shoreside") return hailCard(action.question || asked, action.summary);
    return {
      kind: "card",
      title: action.title,
      meta: action.summary,
      confirm: action.kind === "release" ? "Release it" : "Reserve",
      action:
        action.kind === "release"
          ? { type: "releaseSlug", slug: action.voyage_slug }
          : { type: "link", href: "/manifest" },
    };
  };

  const askProducer = async (text: string) => {
    push({ kind: "user", text });
    const transcript = [...apiMessages.current, { role: "user" as const, content: text }];
    setTyping(true);
    try {
      const res = await fetch("/api/producer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: transcript }),
      });
      if (!res.ok) throw new Error("producer api");
      const data = (await res.json()) as ProducerApiResponse;
      if (data.fallback || typeof data.reply !== "string") {
        setTyping(false);
        enterFallback();
        answer(intentOf(text), text);
        return;
      }
      apiMessages.current = [...transcript, { role: "assistant", content: data.reply }];
      const out: Msg[] = [{ kind: "bot", text: data.reply }];
      if (data.action) out.push(cardFor(data.action, text));
      /* The brain said the line without proposing the card — an older prompt,
         or a turn that ran out. The hand-off still stands. */
      else if (/hail shoreside/i.test(data.reply)) out.push(hailCard(text));
      push(...out);
      setTyping(false);
    } catch {
      setTyping(false);
      enterFallback();
      answer(intentOf(text), text);
    }
  };

  const handle = (intent: Intent, label: string) => {
    push({ kind: "user", text: label });
    answer(intent, label);
  };

  const answer = (intent: Intent, asked = "") => {
    if (intent === "berth") {
      void run(async () => {
        const res = await producerNextBerth();
        if (res.error) return [{ kind: "bot", text: res.error }];
        return res.berth
          ? [
              {
                kind: "bot",
                text: `You're aboard ${res.berth.title} — ${logDateTime(res.berth.startsAt, res.berth.zone)}. Your member card holds your details.`,
              },
            ]
          : [{ kind: "bot", text: "No pass held. The manifest has open water when you're ready." }];
      });
    } else if (intent === "sailings") {
      void run(async () => {
        const res = await producerSailings();
        if (res.error) return [{ kind: "bot", text: res.error }];
        if (!res.sailings || res.sailings.length === 0) {
          return [{ kind: "bot", text: "Nothing on the manifest ahead. The next season is being drawn." }];
        }
        const cards: Msg[] = res.sailings.map((s) => ({
          kind: "card",
          title: s.title,
          meta: `${logDateTime(s.startsAt, s.zone).toUpperCase()} · ${Math.max(0, s.berthsLeft)} PASSES LEFT`,
          confirm: "Reserve",
          action: { type: "link", href: "/manifest" },
        }));
        return [
          { kind: "bot", text: "The next sailings with open passes. Reserving happens on the manifest — I'll walk you there." },
          ...cards,
        ];
      });
    } else if (intent === "release") {
      void run(async () => {
        const res = await producerNextBerth();
        if (res.error) return [{ kind: "bot", text: res.error }];
        if (!res.berth) return [{ kind: "bot", text: "No pass held — nothing to release." }];
        return [
          {
            kind: "bot",
            text: `You're aboard ${res.berth.title}. Releasing hands the pass to the waitlist — releases go out in order. Your call.`,
          },
          {
            kind: "card",
            title: `Release pass — ${res.berth.title}`,
            meta: `${logDateTime(res.berth.startsAt, res.berth.zone).toUpperCase()} · RELEASES 1 PASS TO THE WAITLIST`,
            confirm: "Release it",
            action: { type: "release", voyageId: res.berth.voyageId },
          },
        ];
      });
    } else if (intent === "balance") {
      void run(async () => {
        const res = await producerBalance();
        if (res.error) return [{ kind: "bot", text: res.error }];
        return [
          {
            kind: "bot",
            text: `${knots(res.knots ?? 0)} banked. ${accountLine(res.accountCents ?? 0)} No action needed — just the ledger talking.`,
          },
        ];
      });
    } else if (intent === "weather") {
      void run(async () => {
        const res = await producerWeather();
        if (res.error) return [{ kind: "bot", text: res.error }];
        if (!res.holds || res.holds.length === 0) {
          return [{ kind: "bot", text: "Clear charts — no weather holds on your sailings." }];
        }
        const list = res.holds.map((h) => `${h.title} (${logDateTime(h.startsAt, h.zone)})`).join("; ");
        return [
          {
            kind: "bot",
            text: `Held for weather: ${list}. We call each one by 18:00 the night before — the Word carries the verdict.`,
          },
        ];
      });
    } else {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        push(
          { kind: "bot", text: "Past my charts — hail Shoreside.", mailto: true },
          hailCard(asked),
          { kind: "sys", text: "CAN'T HELP · OFFERED THE HAND-OFF" }
        );
      }, 600);
    }
  };

  const confirmCard = (card: Extract<Msg, { kind: "card" }>) => {
    if (card.action.type === "link") return;
    const action = card.action;
    push({ kind: "user", text: card.confirm });
    void run(async () => {
      if (action.type === "hail") {
        const res = await producerOpenShoreside(action.question);
        if (res.error || !res.threadId) return [{ kind: "bot", text: res.error ?? "That didn't land. Try again." }];
        return [
          { kind: "sys", text: "CONFIRMED · HANDED TO SHORESIDE" },
          {
            kind: "bot",
            text: "Shoreside has it, in your name. A person answers in your threads — usually within the hour.",
          },
          {
            kind: "card",
            title: "Your Shoreside thread",
            meta: "THE QUESTION IS POSTED · THE ANSWER LANDS HERE",
            confirm: "Open the thread",
            action: { type: "link", href: `/threads/${res.threadId}` },
          },
        ];
      }
      const res =
        action.type === "release"
          ? await producerReleaseBerth(action.voyageId)
          : await producerReleaseBerthBySlug(action.slug);
      if (res.error) return [{ kind: "bot", text: res.error }];
      return [
        { kind: "sys", text: "CONFIRMED · EXECUTED · LOGGED" },
        { kind: "bot", text: "Released. The waitlist moves up one — the next name gets the word." },
      ];
    });
  };

  const standDown = () => push({ kind: "sys", text: "Nothing executed." });

  const send = () => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    if (fallbackMode.current) {
      handle(intentOf(t), t);
    } else {
      void askProducer(t);
    }
  };

  return (
    <div
      className="pr-panel"
      role="dialog"
      aria-label={SURFACES.agent}
      ref={panelRef}
      tabIndex={-1}
    >
      <div className="pr-head">
        <Icon name="Compass" size={18} style={{ color: "var(--neon-cyan)" }} />
        <div style={{ flex: 1 }}>
          <b>{SURFACES.agent}</b>
          <span style={{ display: "block" }}>MEMBER · ACTIONS ASK FIRST</span>
        </div>
        <IconButton label={`Close ${SURFACES.agent}`} variant="ghost" size="sm" onClick={onClose}>
          <Icon name="X" size={15} />
        </IconButton>
      </div>
      <div className="pr-seam"></div>
      <div className="pr-body" ref={bodyRef} aria-live="polite">
        {msgs.map((m, i) =>
          m.kind === "card" ? (
            <div className="pr-card" key={i}>
              <div className="pr-card__seam"></div>
              <div className="pr-card__in">
                <div className="pr-card__t">{m.title}</div>
                <div className="pr-card__m">{m.meta}</div>
                <div className="pr-card__acts">
                  {m.action.type === "link" ? (
                    <Link href={m.action.href} className="ls-btn ls-btn--brass ls-btn--sm">
                      {m.confirm}
                    </Link>
                  ) : (
                    <Button variant="gold" size="sm" onClick={() => confirmCard(m)}>
                      {m.confirm}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={standDown}>
                    Stand down
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={i}
              className={
                "pr-msg pr-msg--" + (m.kind === "user" ? "user" : m.kind === "sys" ? "sys" : "bot")
              }
            >
              {m.text}
              {m.kind === "bot" && m.mailto ? (
                <>
                  {" "}
                  <a href={`mailto:${SHORE}`}>{SHORE}</a>
                </>
              ) : null}
            </div>
          )
        )}
        {typing ? (
          <div className="pr-typing" aria-label={`${SURFACES.agent} is working`}>
            <i></i>
            <i></i>
            <i></i>
          </div>
        ) : null}
      </div>
      <div className="pr-quick">
        {QUICK.map(([id, label]) => (
          <button key={id} type="button" onClick={() => handle(id, label)}>
            {label}
          </button>
        ))}
      </div>
      <div className="pr-foot">
        <input
          placeholder="Ask the Producer…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          aria-label="Message the Producer"
        />
        <Button size="sm" onClick={send} disabled={!input.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
