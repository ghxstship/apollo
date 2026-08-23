"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* Refresh the server-rendered inbox on any message change — no client merge,
   just a debounced router.refresh(). The topic is unique per hook instance;
   supabase-js reuses channels by topic and re-attaching callbacks throws. */
export function ThreadsRealtime() {
  const router = useRouter();
  const topic = React.useId();

  React.useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };
    const channel = supabase
      .channel(`threads-live-${topic}`)
      /* Realtime withholds INSERT and UPDATE a member cannot SELECT, but
         broadcasts every DELETE — so a deletion in a stranger's thread used to
         make every client in the club re-read its list. */
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, topic]);

  return null;
}
