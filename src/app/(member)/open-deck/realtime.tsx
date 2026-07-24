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
        { event: "*", schema: "public", table },
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
