"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* Refresh the server-rendered feed on any open_deck_* change — no client merge,
   just a debounced router.refresh().

   New posts refresh unconditionally — a post that is not on the page yet is
   the one event the page wants to hear about. Hails and comments only refresh
   when they land on a post that IS on the page: the feed reads the newest
   sixty, so a word on an older thread is not a change the reader can see and
   was costing a full server render for nothing. */
export function OpenDeckRealtime({ postIds = [] }: { postIds?: string[] }) {
  const router = useRouter();
  /* Keyed on the joined string, not the array — router.refresh() hands the
     page a new array of the same ids and the channel must not resubscribe
     for that. */
  const scope = postIds.join(",");

  React.useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };
    let channel = supabase.channel("open-deck-live");
    /* INSERT and UPDATE named rather than "*", because DELETE is no longer
       published at all: Realtime cannot apply RLS to a row that is gone, so
       it was broadcasting deleted primary keys to every subscriber
       including unauthenticated ones — and open_deck_hails is PRIMARY KEY
       (post_id, profile_id), which makes the key the private fact. This
       handler never read the payload, so the only thing lost is that an
       un-hail no longer nudges another member's feed until its next event
       or navigation. */
    for (const event of ["INSERT", "UPDATE"] as const) {
      channel = channel.on(
        "postgres_changes",
        { event, schema: "public", table: "open_deck_posts" },
        refresh
      );
    }
    if (scope) {
      const filter = `post_id=in.(${scope})`;
      for (const table of ["open_deck_comments", "open_deck_hails"] as const) {
        for (const event of ["INSERT", "UPDATE"] as const) {
          channel = channel.on(
            "postgres_changes",
            { event, schema: "public", table, filter },
            refresh
          );
        }
      }
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, scope]);

  return null;
}
