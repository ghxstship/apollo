"use client";

import React from "react";
import { Button, Dialog, FilterPills, ListToolbar, Notice, Select, StateBlock, Textarea, TextButton, Toast } from "@/components/ds";
import {
  PostCard as DeckPost,
  Hail,
  CommentThread,
  FlagButton,
} from "@/components/ds/feed";
import { addComment, createPost, deletePost, flagPost, toggleHail, type OpenDeckResult } from "./actions";
import { useFilterParams } from "@/lib/use-filter-params";

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
  episodeId: string | null;
  voyageTitle: string | null;
  /* The author holds a pass on the episode they attached. Decided by the club
     (posts_aboard), never by the browser: attaching an episode stays open to
     anybody, and this is what keeps the attachment honest without forbidding
     it. */
  aboard: boolean;
  /* One approved frame from the attached episode, as a signed URL — or null,
     in which case the card has no media slot at all. */
  frame: string | null;
  hails: number;
  myHail: boolean;
  mine: boolean;
  comments: FeedComment[];
};

export type EpisodeOption = { id: string; title: string };

/* — Composer — the kit's card: borderless textarea, episode attach, gold
   "Post to the deck". */
export function Composer({
  episodes,
  onHold = false,
}: {
  authorName: string;
  tone: string;
  episodes: EpisodeOption[];
  /* A held membership cannot post; the deck says so rather than taking the
     words and refusing them at the door. */
  onHold?: boolean;
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

  if (onHold) {
    return (
      <div className="wd-closed">
        The deck is closed while your membership is paused. Resume it on the
        You page and the composer opens back up.
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="wd-compose" aria-busy={pending || undefined}>
      <Textarea
        name="body"
        rows={3}
        maxLength={2000}
        placeholder="The deck is open. Say it like you mean it."
        label="Post to the deck"
        labelHidden
        className="wd-compose__field"
      />
      {state.error ? (
        <Notice tone="danger" compact className="mbr-sub--xs">
          {state.error}
        </Notice>
      ) : null}
      <div className="ls-acts">
        {attaching && episodes.length > 0 ? (
          <Select
            name="episode_id"
            aria-label="Attach an episode"
            placeholder="Pick the episode"
            options={episodes.map((v) => ({ value: v.id, label: v.title }))}
            className="wd-compose__pick"
          />
        ) : episodes.length > 0 ? (
          <TextButton tone="quiet" size="sm" className="wd-attach" onClick={() => setAttaching(true)}>
            + ATTACH AN EPISODE
          </TextButton>
        ) : (
          <span />
        )}
        <span className="wd-end">
          <Button type="submit" variant="gold" size="sm" pending={pending} pendingLabel="Posting">
            Post to the deck
          </Button>
        </span>
      </div>
    </form>
  );
}

/* — Crew-thread filter + feed — */
export function FeedList({ posts }: { posts: FeedPost[] }) {
  /* In the URL like every other list, so a member can link a crew thread. */
  const { values, set } = useFilterParams({ thread: "all" });
  const filter = values.thread;

  const threads = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of posts) {
      if (p.episodeId && p.voyageTitle && !seen.has(p.episodeId)) {
        seen.set(p.episodeId, p.voyageTitle);
      }
    }
    return Array.from(seen, ([id, title]) => ({ id, title }));
  }, [posts]);

  const shown = filter === "all" ? posts : posts.filter((p) => p.episodeId === filter);

  return (
    <div className="deck-feed">
      {threads.length > 0 ? (
        <ListToolbar
          filterCount={filter === "all" ? 0 : 1}
          resultCount={shown.length}
          resultNoun="post"
          chips={
            filter === "all"
              ? []
              : [
                  {
                    key: "thread",
                    label: "Thread",
                    value: threads.find((t) => t.id === filter)?.title ?? filter,
                  },
                ]
          }
          onDropChip={() => set("thread", "all")}
          onClear={() => set("thread", "all")}
          filters={
            <FilterPills
              label="Thread"
              value={filter}
              onChange={(next) => set("thread", next)}
              allCount={posts.length}
              options={threads.map((t) => ({
                id: t.id,
                label: t.title,
                count: posts.filter((p) => p.episodeId === t.id).length,
              }))}
            />
          }
        />
      ) : null}
      {/* The deck had no zero-state at all: a new member saw a composer and
          then an empty flex column, with nothing to say the deck was empty
          rather than broken.

          It then fell through to the kit's generic empty block, which talks
          about water on a page about a deck and offers nothing to do — the one
          genuine dead end in the product. Its own words now, and they aim at
          the composer sitting directly above it. */}
      {posts.length === 0 ? (
        <StateBlock
          status="empty"
          icon="MessageSquare"
          title="Nothing on the deck yet."
          detail="The composer is right above. Post the first word and the rest follows."
        />
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
  /* Four actions share one transition, so `pending` alone cannot say which one
     is working. This names it, and only that control wears the busy face. */
  const [running, setRunning] = React.useState<"hail" | "remove" | "comment" | "report" | null>(null);
  const [showComments, setShowComments] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [reporting, setReporting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const [flagError, setFlagError] = React.useState<string | null>(null);
  const [flagged, setFlagged] = React.useState(false);
  const [toasting, setToasting] = React.useState(false);

  /* Three of the four actions on a post threw their result away. RLS on
     open_deck_hails, open_deck_comments and open_deck_flags all carry is_active(),
     so a member on hold pressed HAIL and nothing happened; opened REPLY, typed,
     pressed Reply, and the post still read "No words yet." with their text
     sitting in the box and no explanation anywhere — while the composer three
     inches above said "The deck is closed while your membership is on hold."
     The app knew. It just did not say. */
  const [actionError, setActionError] = React.useState<string | null>(null);

  /* The flag flips and the count moves as the thumb lifts; the server's row
     replaces it on the next render, and a refusal (a member on hold) puts it
     back with the words. */
  const [hailShown, setHailShown] = React.useOptimistic({ hailed: post.myHail, count: post.hails });
  const hail = () =>
    startTransition(async () => {
      setActionError(null);
      setRunning("hail");
      setHailShown({ hailed: !post.myHail, count: post.hails + (post.myHail ? -1 : 1) });
      const res = await toggleHail(post.id, post.myHail);
      if (res?.error) setActionError(res.error);
    });
  const remove = () =>
    startTransition(async () => {
      setActionError(null);
      setRunning("remove");
      const res = await deletePost(post.id);
      setConfirming(false);
      if (res?.error) setActionError(res.error);
    });
  const comment = () =>
    startTransition(async () => {
      setActionError(null);
      setRunning("comment");
      const res = await addComment(post.id, draft);
      if (res.error) setActionError(res.error);
      else setDraft("");
    });
  const report = () =>
    startTransition(async () => {
      setFlagError(null);
      setRunning("report");
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

  /* Whether a post has been answered was legible only by reading its footer,
     one post at a time. A conversation takes a --line-strong rule on the
     leading edge; a post nobody has replied to keeps the hairline. Same fact,
     carried in form, so live threads are findable down the column. */
  const answered = post.comments.length > 0;

  return (
    <DeckPost
      author={post.who}
      tone={post.tone}
      timestamp={post.meta}
      sailing={post.voyageTitle ?? undefined}
      aboard={post.aboard}
      media={post.frame}
      mediaAlt={post.voyageTitle ? `A frame from ${post.voyageTitle}` : ""}
      body={post.body}
      style={
        answered
          ? { borderInlineStartWidth: 3, borderInlineStartColor: "var(--border-strong)" }
          : undefined
      }
      footer={
        <>
          <Hail count={hailShown.count} hailed={hailShown.hailed} onToggle={pending ? undefined : hail} />
          <TextButton
            size="sm"
            className="wd-reply"
            onClick={() => setShowComments((s) => !s)}
            aria-expanded={showComments}
          >
            {post.comments.length > 0 ? `WORDS · ${post.comments.length}` : "REPLY"}
          </TextButton>
          <span className="wd-end">
            {post.mine ? (
              <TextButton tone="quiet" size="sm" className="wd-strike" onClick={() => setConfirming(true)}>
                STRIKE
              </TextButton>
            ) : (
              <FlagButton flagged={flagged} onFlag={() => setReporting(true)} />
            )}
          </span>
          {actionError ? (
            <Notice tone="danger" compact>
              {actionError}
            </Notice>
          ) : null}
        </>
      }
    >
      {showComments ? (
        <div>
          <CommentThread
            comments={post.comments.map((c) => ({ id: c.id, author: c.who, tone: "sand", body: c.body }))}
          />
          <div className="wd-cmt__form">
            <Textarea
              rows={1}
              maxLength={1000}
              placeholder="Add a word…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!draft.trim() || (pending && running !== "comment")}
              pending={pending && running === "comment"}
              pendingLabel="Replying…"
              onClick={comment}
            >
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
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              pending={pending && running === "remove"}
              pendingLabel="Striking…"
              onClick={remove}
            >
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
            <Button
              variant="outline"
              size="sm"
              disabled={!reason || (pending && running !== "report")}
              pending={pending && running === "report"}
              pendingLabel="Sending…"
              onClick={report}
            >
              Send the flag
            </Button>
          </>
        }
      >
        <div className="mbr-stack">
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
        <Toast fixed message="Flagged for the Bridge. Never silently." duration={4000} onClose={() => setToasting(false)} />
      ) : null}
    </DeckPost>
  );
}
