"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABLES = ["wardroom_posts", "wardroom_comments", "wardroom_hails"] as const;

/* Refresh the server-rendered feed on any open-deck change (legacy wardroom_* tables) — no client merge,
   just a debounced router.refresh(). */
export function OpenDeckRealtime() {
  const router = useRouter();

  React.useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };
    let channel = supabase.channel("wardroom-live");
    for (const table of TABLES) {
      channel = channel.on(
        "postgres_changes",
        /* INSERT and UPDATE named rather than "*", because DELETE is no longer
           published at all: Realtime cannot apply RLS to a row that is gone, so
           it was broadcasting deleted primary keys to every subscriber
           including unauthenticated ones — and wardroom_hails is PRIMARY KEY
           (post_id, profile_id), which makes the key the private fact. This
           handler never read the payload, so the only thing lost is that an
           un-hail no longer nudges another member's feed until its next event
           or navigation. */
        { event: "INSERT", schema: "public", table },
        refresh
      );
      channel = channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table },
        refresh
      );
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
