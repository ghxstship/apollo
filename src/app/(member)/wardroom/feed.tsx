"use client";

import React from "react";
import { Avatar, Button, Dialog, Icon, Tag, Textarea } from "@/components/ds";
import { addComment, createPost, deletePost, toggleHail, type WardroomResult } from "./actions";

export type FeedComment = {
  id: string;
  who: string;
  body: string;
};

export type FeedPost = {
  id: string;
  who: string;
  tone: "ink" | "sea" | "brass" | "sand";
  meta: string;
  body: string;
  voyageTitle: string | null;
  hails: number;
  myHail: boolean;
  mine: boolean;
  comments: FeedComment[];
};

/* — Composer — */
export function Composer({ authorName, tone }: { authorName: string; tone: string }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = React.useActionState<WardroomResult, FormData>(
    async (prev, fd) => {
      const res = await createPost(prev, fd);
      if (!res.error) formRef.current?.reset();
      return res;
    },
    {}
  );

  return (
    <div className="wd-post">
      <div className="wd-post__head">
        <Avatar name={authorName} tone={tone as "ink" | "sea" | "brass" | "sand"} />
        <div className="wd-post__who">
          <b>Say it to the crew</b>
          <span>POSTS STAY ABOARD — NEVER PUBLIC</span>
        </div>
      </div>
      <form ref={formRef} action={formAction} style={{ marginTop: 14 }}>
        <Textarea
          name="body"
          rows={3}
          maxLength={2000}
          placeholder="A sighting, a thanks, a berth to fill…"
          error={state.error}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <Button type="submit" variant="brass" size="sm" disabled={pending}>
            Post to the Wardroom
          </Button>
        </div>
      </form>
    </div>
  );
}

/* — Post card — */
export function PostCard({ post }: { post: FeedPost }) {
  const [pending, startTransition] = React.useTransition();
  const [showComments, setShowComments] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [draft, setDraft] = React.useState("");

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

  return (
    <article className="wd-post">
      <div className="wd-post__head">
        <Avatar name={post.who} tone={post.tone} />
        <div className="wd-post__who" style={{ flex: 1 }}>
          <b>{post.who}</b>
          <span>{post.meta}</span>
        </div>
        {post.voyageTitle ? <Tag>{post.voyageTitle}</Tag> : null}
        {post.mine ? (
          <button
            type="button"
            className="wd-x"
            aria-label="Delete post"
            onClick={() => setConfirming(true)}
          >
            ✕
          </button>
        ) : null}
      </div>
      <p className="wd-post__body">{post.body}</p>
      <div className="wd-post__acts">
        <button
          type="button"
          className={"wd-hail" + (post.myHail ? " on" : "")}
          aria-pressed={post.myHail}
          disabled={pending}
          onClick={hail}
        >
          <Icon name="Anchor" size={13} />
          Hail · {post.hails}
        </button>
        <button
          type="button"
          className="wd-hail"
          onClick={() => setShowComments((s) => !s)}
          aria-expanded={showComments}
        >
          <Icon name="MessageCircle" size={13} />
          {post.comments.length || "Reply"}
        </button>
      </div>
      {showComments ? (
        <div>
          {post.comments.map((c) => (
            <div className="wd-cmt" key={c.id}>
              <Avatar name={c.who} size="sm" tone="sand" />
              <div className="wd-cmt__b">
                <b>{c.who}</b>
                {c.body}
              </div>
            </div>
          ))}
          <div className="wd-cmt__form">
            <Textarea
              rows={1}
              maxLength={1000}
              placeholder="Add a word…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pending || !draft.trim()}
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
        eyebrow="The Wardroom"
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
    </article>
  );
}
