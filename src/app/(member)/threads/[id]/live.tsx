"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@/components/ds";
import { createClient } from "@/lib/supabase/client";
import { markThreadRead, sendMessage, type ThreadResult } from "../actions";

/* Stamp the read line on open, then keep the conversation live. */
export function ThreadLive({ threadId }: { threadId: string }) {
  const router = useRouter();
  const topic = React.useId();

  React.useEffect(() => {
    void markThreadRead(threadId);
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void markThreadRead(threadId);
        router.refresh();
      }, 500);
    };
    const channel = supabase
      .channel(`thread-live-${topic}`)
      .on(
        "postgres_changes",
        /* This one is already scoped to the thread; INSERT and UPDATE are the
           events that carry a message, and DELETE is the one realtime leaks. */
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        refresh
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, threadId, topic]);

  return null;
}

export function Composer({ threadId, closed }: { threadId: string; closed: boolean }) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = React.useActionState<ThreadResult, FormData>(
    async (prev, fd) => {
      const res = await sendMessage(prev, fd);
      if (!res.error) formRef.current?.reset();
      return res;
    },
    {}
  );

  return (
    <form ref={formRef} action={formAction} className="thr-composer">
      <input type="hidden" name="thread_id" value={threadId} />
      <Textarea
        name="body"
        rows={3}
        maxLength={4000}
        disabled={closed}
        /* A direct thread is not the crew. */
        placeholder={closed ? "Nobody is left to read this." : "Say it"}
        error={state.error}
        aria-label="Your word"
      />
      <div className="thr-composer__foot">
        {closed ? (
          <p className="mbr-mono thr-closed">
            Closed after the debrief — nothing more can be sent here.
          </p>
        ) : (
          <span></span>
        )}
        <Button type="submit" variant="outline" size="sm" disabled={pending || closed}>
          Send
        </Button>
      </div>
    </form>
  );
}
