"use client";

/* The Producer — the [un] face of Aurora, the ATLVS ecosystem engine. The name
   is per-stage; the confirm-first contract is Aurora's. */

import React from "react";
import { Button, Icon, IconButton, Input, LinkButton } from "@/components/ds";
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
  | { type: "release"; episodeId: string }
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
  ["sailings", "Find an episode"],
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
    | { kind: "reserve" | "release"; episode_slug: string; title: string; summary: string }
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
  if (/find|episode|sail|episode|book|reserve|manifest/.test(s)) return "sailings";
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

export function ProducerPanel({
  onClose,
  closing = false,
  onClosed,
}: {
  onClose: () => void;
  /* Set by the launcher once close is asked for: the panel plays pr-out and
     reports back through onClosed, and the launcher unmounts it then. */
  closing?: boolean;
  onClosed?: () => void;
}) {
  /* Non-modal in useModal's terms — the page behind stays scrollable, no
     aria-modal — but Tab is still kept inside: the panel is the thing a member
     just opened, Escape and the X are always one key away, and walking out
     the back into the page is never what the next Tab means here.

     That trap used to be twenty-four lines copied out of use-modal.ts into
     this file, which is precisely the drift the hook's own docblock says it
     exists to prevent. It is an option on the hook now. */
  const panelRef = useModal(true, onClose, { modal: false, trapTab: true });

  /* Every reply this panel appends arrives after an await or a timer, and the
     member can close the panel — which unmounts it — at any point in between.
     One ref answers "is there still anything to tell?" for all three paths,
     and the dead-reckoning timer is held so it can be cleared rather than
     left to fire into nothing. */
  const alive = React.useRef(true);
  const missTimer = React.useRef<number | null>(null);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (missTimer.current !== null) {
        window.clearTimeout(missTimer.current);
        missTimer.current = null;
      }
    };
  }, []);

  const [msgs, setMsgs] = React.useState<Msg[]>([
    { kind: "sys", text: "READS YOUR MANIFEST · NEVER POSTS OR PAYS WITHOUT ASKING" },
    {
      kind: "bot",
      text: "the Producer here. I can read your manifest, find episodes, release passes, and read your ledgers. Anything that changes the record stops for your confirmation.",
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
      if (!alive.current) return;
      push(...out);
    } catch {
      if (!alive.current) return;
      push({ kind: "bot", text: "That didn't land — no signal, or the office is dark. Try again." });
    } finally {
      if (alive.current) setTyping(false);
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
          ? { type: "releaseSlug", slug: action.episode_slug }
          : { type: "link", href: "/passes" },
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
      if (!alive.current) return;
      if (!res.ok) throw new Error("producer api");
      const data = (await res.json()) as ProducerApiResponse;
      if (!alive.current) return;
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
      if (!alive.current) return;
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
          action: { type: "link", href: "/passes" },
        }));
        return [
          { kind: "bot", text: "The next episodes with open passes. Reserving happens on the manifest — I'll walk you there." },
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
            action: { type: "release", episodeId: res.berth.episodeId },
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
          return [{ kind: "bot", text: "Clear charts — no weather holds on your episodes." }];
        }
        const list = res.holds.map((h) => `${h.title} (${logDateTime(h.startsAt, h.zone)})`).join("; ");
        return [
          {
            kind: "bot",
            text: `Held for weather: ${list}. We call each one by 18:00 the night before — your Inbox carries the verdict.`,
          },
        ];
      });
    } else {
      /* The beat before the Producer admits it is out of charts. It is only a
         beat, so it used to be an unheld setTimeout — which fired into an
         unmounted panel whenever a member asked something off the map and
         then closed the corner inside six-tenths of a second. */
      setTyping(true);
      if (missTimer.current !== null) window.clearTimeout(missTimer.current);
      missTimer.current = window.setTimeout(() => {
        missTimer.current = null;
        if (!alive.current) return;
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
          ? await producerReleaseBerth(action.episodeId)
          : await producerReleaseBerthBySlug(action.slug);
      if (res.error) return [{ kind: "bot", text: res.error }];
      return [
        { kind: "sys", text: "CONFIRMED · EXECUTED · LOGGED" },
        { kind: "bot", text: "Released. The waitlist moves up one — the next name gets the word." },
      ];
    });
  };

  const standDown = () => push({ kind: "sys", text: "Nothing executed." });

  /* One send at a time. Five taps on Send — or on the quick asks, which are
     disabled below for the same reason — fired five concurrent server actions
     and appended five replies over each other. `typing` is the in-flight flag
     the panel already keeps, so it is also the gate: the Enter path comes
     through here too, which is where it used to walk past the empty-input
     check and nothing else. */
  const send = () => {
    if (typing) return;
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
      className={"pr-panel" + (closing ? " pr-panel--out" : "")}
      role="dialog"
      aria-label={SURFACES.agent}
      ref={panelRef}
      tabIndex={-1}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onClosed?.();
      }}
    >
      <div className="pr-head">
        <Icon name="Compass" size={18} className="pr-head__glyph" />
        <div className="pr-head__t">
          <b>{SURFACES.agent}</b>
          <span>MEMBER · ACTIONS ASK FIRST</span>
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
                    <LinkButton href={m.action.href} variant="gold" size="sm">
                      {m.confirm}
                    </LinkButton>
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
          <Button key={id} variant="outline" size="sm" disabled={typing} onClick={() => handle(id, label)}>
            {label}
          </Button>
        ))}
      </div>
      <div className="pr-foot">
        <Input
          label="Message the Producer"
          labelHidden
          width="full"
          placeholder="Ask the Producer…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        {/* `pending` carries aria-busy and the disable; the label swap is laid
            in the same grid cell as Send, so the button does not change width
            when the Producer starts working. */}
        <Button size="md" onClick={send} disabled={!input.trim()} pending={typing} pendingLabel="Sending…">
          Send
        </Button>
      </div>
    </div>
  );
}
