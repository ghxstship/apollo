"use client";

import React from "react";
import { Button, Dialog, Select, Tag, Textarea, Toast } from "@/components/ds";
import {
  PostCard as DeckPost,
  Hail,
  CommentThread,
  FlagButton,
} from "@/components/ds/feed";
import { addComment, createPost, deletePost, flagPost, toggleHail, type OpenDeckResult } from "./actions";

export type FeedComment = {
  id: string;
  who: string;
  body: string;
};

export type FeedPost = {
  id: string;
  who: string;
  tone: "ink" | "sea" | "gold" | "sand";
  meta: string;
  body: string;
  voyageId: string | null;
  voyageTitle: string | null;
  hails: number;
  myHail: boolean;
  mine: boolean;
  comments: FeedComment[];
};

export type VoyageOption = { id: string; title: string };

/* — Composer — the kit's card: borderless textarea, sailing attach, gold
   "Post to the deck". The confession-booth motif lives here, in the voice. */
export function Composer({
  voyages,
}: {
  authorName: string;
  tone: string;
  voyages: VoyageOption[];
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [attaching, setAttaching] = React.useState(false);
  const [state, formAction, pending] = React.useActionState<OpenDeckResult, FormData>(
    async (prev, fd) => {
      const res = await createPost(prev, fd);
      if (!res.error) {
        formRef.current?.reset();
        setAttaching(false);
      }
      return res;
    },
    {}
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--line-faint)",
        borderRadius: "var(--radius-md)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <textarea
        name="body"
        rows={3}
        maxLength={2000}
        placeholder="The booth is open. Say it like the cameras are on."
        aria-label="Post to the deck"
        style={{
          resize: "vertical",
          background: "transparent",
          border: "none",
          outline: "none",
          font: "400 14px/1.55 var(--font-sans)",
          color: "var(--text-1)",
          minHeight: 56,
        }}
      />
      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--danger)", margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {attaching && voyages.length > 0 ? (
          <Select
            name="voyage_id"
            aria-label="Attach a sailing"
            placeholder="Pick the sailing"
            options={voyages.map((v) => ({ value: v.id, label: v.title }))}
            style={{ minWidth: 200 }}
          />
        ) : voyages.length > 0 ? (
          <button
            type="button"
            onClick={() => setAttaching(true)}
            style={{
              all: "unset",
              cursor: "pointer",
              font: "700 9px/1 var(--font-mono)",
              letterSpacing: ".12em",
              color: "var(--text-3)",
              minHeight: 24,
              whiteSpace: "nowrap",
            }}
          >
            + ATTACH A SAILING
          </button>
        ) : (
          <span />
        )}
        <span style={{ marginLeft: "auto" }}>
          <Button type="submit" variant="gold" size="sm" disabled={pending}>
            Post to the deck
          </Button>
        </span>
      </div>
    </form>
  );
}

/* — Crew-thread filter + feed — */
export function FeedList({ posts }: { posts: FeedPost[] }) {
  const [filter, setFilter] = React.useState<string | null>(null);

  const threads = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of posts) {
      if (p.voyageId && p.voyageTitle && !seen.has(p.voyageId)) {
        seen.set(p.voyageId, p.voyageTitle);
      }
    }
    return Array.from(seen, ([id, title]) => ({ id, title }));
  }, [posts]);

  const shown = filter ? posts.filter((p) => p.voyageId === filter) : posts;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {threads.length > 0 ? (
        <div className="wd-filter" role="group" aria-label="Crew threads">
          <Tag active={filter === null} onClick={() => setFilter(null)}>
            All
          </Tag>
          {threads.map((t) => (
            <Tag
              key={t.id}
              active={filter === t.id}
              onClick={() => setFilter(filter === t.id ? null : t.id)}
            >
              {t.title}
            </Tag>
          ))}
        </div>
      ) : null}
      {shown.map((post) => (
        <FeedEntry key={post.id} post={post} />
      ))}
    </div>
  );
}

const FLAG_REASONS = [
  { value: "resale", label: "Resale" },
  { value: "heated", label: "Heated" },
  { value: "conduct", label: "Conduct" },
  { value: "other", label: "Other" },
];

/* — One post: the kit card, with hail, thread, flag, and (for your own) strike. — */
function FeedEntry({ post }: { post: FeedPost }) {
  const [pending, startTransition] = React.useTransition();
  const [showComments, setShowComments] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [reporting, setReporting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const [flagError, setFlagError] = React.useState<string | null>(null);
  const [flagged, setFlagged] = React.useState(false);
  const [toasting, setToasting] = React.useState(false);

  const hail = () => startTransition(async () => void (await toggleHail(post.id, post.myHail)));
  const remove = () =>
    startTransition(async () => {
      await deletePost(post.id);
      setConfirming(false);
    });
  const comment = () =>
    startTransition(async () => {
      const res = await addComment(post.id, draft);
      if (!res.error) setDraft("");
    });
  const report = () =>
    startTransition(async () => {
      setFlagError(null);
      const res = await flagPost(post.id, reason, note);
      if (res.error) {
        setFlagError(res.error);
        return;
      }
      setReporting(false);
      setReason("");
      setNote("");
      setFlagged(true);
      setToasting(true);
    });

  return (
    <DeckPost
      author={post.who}
      tone={post.tone}
      timestamp={post.meta}
      sailing={post.voyageTitle ?? undefined}
      body={post.body}
      footer={
        <>
          <Hail count={post.hails} hailed={post.myHail} onToggle={pending ? undefined : hail} />
          <button
            type="button"
            onClick={() => setShowComments((s) => !s)}
            aria-expanded={showComments}
            style={{
              all: "unset",
              cursor: "pointer",
              font: "700 10px/1 var(--font-mono)",
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--text-2)",
              minHeight: 24,
              whiteSpace: "nowrap",
            }}
          >
            {post.comments.length > 0 ? `WORDS · ${post.comments.length}` : "REPLY"}
          </button>
          <span style={{ marginLeft: "auto" }}>
            {post.mine ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  font: "700 9px/1 var(--font-mono)",
                  letterSpacing: ".14em",
                  color: "var(--text-3)",
                  minHeight: 24,
                }}
              >
                STRIKE
              </button>
            ) : (
              <FlagButton flagged={flagged} onFlag={() => setReporting(true)} />
            )}
          </span>
        </>
      }
    >
      {showComments ? (
        <div>
          <CommentThread
            comments={post.comments.map((c) => ({ author: c.who, tone: "sand", body: c.body }))}
          />
          <div className="wd-cmt__form">
            <Textarea
              rows={1}
              maxLength={1000}
              placeholder="Add a word…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button variant="outline" size="sm" disabled={pending || !draft.trim()} onClick={comment}>
              Reply
            </Button>
          </div>
        </div>
      ) : null}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        width={360}
        eyebrow="Open Deck"
        title="Strike this post?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={remove}>
              Strike it
            </Button>
          </>
        }
      >
        Gone from the log for good. The crew keeps no copies.
      </Dialog>
      <Dialog
        open={reporting}
        onClose={() => setReporting(false)}
        width={420}
        eyebrow="Open Deck"
        title="Flag for the Bridge"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setReporting(false)}>
              Stand down
            </Button>
            <Button variant="outline" size="sm" disabled={pending || !reason} onClick={report}>
              Send the flag
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Select
            label="Reason"
            placeholder="Pick a reason"
            options={FLAG_REASONS}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={flagError}
          />
          <Textarea
            label="A note — optional"
            rows={2}
            maxLength={500}
            placeholder="What the Bridge should know."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Dialog>
      {toasting ? (
        <Toast fixed message="Flagged for the Bridge. Never silently." onDismiss={() => setToasting(false)} />
      ) : null}
    </DeckPost>
  );
}
