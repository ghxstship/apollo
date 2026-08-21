"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, IconButton, Wordmark } from "@/components/ds";
import { LOGBOOK, SURFACES } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  ["/home", "Home"],
  ["/live", SURFACES.gateway],
  ["/manifest", "Voyages"],
  ["/booth", SURFACES.openDeck],
  ["/directory", "Directory"],
  ["/tables", "Tonight"],
  ["/matches", "Matches"],
  ["/regattas", LOGBOOK.regattas],
  ["/threads", "Threads"],
  ["/slop-chest", "Slop Chest"],
  ["/portal", "Portal"],
  ["/account", "Account"],
  ["/card", SURFACES.passbook],
  ["/agreements", "Agreements"],
  ["/inbox", "Word"],
  ["/you", "You"],
] as const;

const TABS = [
  ["/home", "Anchor", "Home"],
  ["/live", "Navigation", SURFACES.gateway],
  ["/manifest", "Sailboat", "Voyages"],
  ["/card", "IdCard", SURFACES.passbook],
  ["/inbox", "Bell", "Word"],
  ["/you", "User", "You"],
] as const;

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/* Live unread count for the Word — recounts on any notifications change. */
function useUnreadWord(userId: string, initial: number): number {
  /* No prop-sync effect: server-side changes (e.g. mark-all-read) surface as
     UPDATE events on the channel, which recount. */
  const [count, setCount] = React.useState(initial);
  /* Unique per hook instance — the desktop nav and mobile tab bar both mount
     this hook, and supabase-js reuses channels by topic name; re-attaching
     callbacks to an already-subscribed channel throws. */
  const topic = React.useId();
  React.useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recount = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const { count: n } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", userId)
          .eq("read", false);
        if (n != null) setCount(n);
      }, 500);
    };
    const channel = supabase
      .channel(`word-unread-${topic}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${userId}`,
        },
        recount
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId, topic]);
  return count;
}

/* Live unread-thread count — threads holding a message newer than the
   member's read line. Recounts on any message change. */
function useUnreadThreads(userId: string): number {
  const [count, setCount] = React.useState(0);
  const topic = React.useId();
  React.useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const recount = async () => {
      const { data: mine } = await supabase
        .from("thread_members")
        .select("thread_id,last_read_at")
        .eq("profile_id", userId);
      if (!alive) return;
      if (!mine || mine.length === 0) {
        setCount(0);
        return;
      }
      const { data: msgs } = await supabase
        .from("messages")
        .select("thread_id,created_at")
        .in(
          "thread_id",
          mine.map((m) => m.thread_id)
        );
      if (!alive) return;
      const latest = new Map<string, number>();
      for (const m of msgs ?? []) {
        const at = Date.parse(m.created_at);
        if (at > (latest.get(m.thread_id) ?? 0)) latest.set(m.thread_id, at);
      }
      let n = 0;
      for (const t of mine) {
        const at = latest.get(t.thread_id);
        if (at == null) continue;
        if (!t.last_read_at || at > Date.parse(t.last_read_at)) n += 1;
      }
      setCount(n);
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void recount(), 500);
    };
    void recount();
    const channel = supabase
      .channel(`threads-unread-${topic}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, schedule)
      .subscribe();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId, topic]);
  return count;
}

function WordDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="mbr-worddot" aria-label={`${count} unread`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function MemberTopBar({
  memberNo,
  userId,
  unreadWord,
  isStaff,
}: {
  memberNo: string | null;
  userId: string;
  unreadWord: number;
  isStaff: boolean;
}) {
  const pathname = usePathname();
  const unread = useUnreadWord(userId, unreadWord);
  const unreadThreads = useUnreadThreads(userId);
  return (
    <header className="mbr-top">
      <div className="mbr-top__in">
        <Link href="/home" className="mbr-top__wm" aria-label="Home — home">
          <Wordmark size="sm" />
        </Link>
        <nav className="mbr-nav" aria-label="Member navigation">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={isCurrent(pathname, href) ? "page" : undefined}
            >
              {label}
              {href === "/inbox" ? <WordDot count={unread} /> : null}
              {href === "/threads" ? <WordDot count={unreadThreads} /> : null}
            </Link>
          ))}
          {isStaff ? (
            <Link
              href="/bridge"
              aria-current={isCurrent(pathname, "/bridge") ? "page" : undefined}
            >
              Bridge
            </Link>
          ) : null}
        </nav>
        <div className="mbr-top__meta">
          {memberNo ? <span className="mbr-top__no">{memberNo}</span> : null}
          <form action="/auth/signout" method="post" style={{ display: "inline-flex" }}>
            <IconButton label="Sign out" variant="ghost" size="sm" type="submit">
              <Icon name="LogOut" size={16} />
            </IconButton>
          </form>
        </div>
      </div>
    </header>
  );
}

export function MemberTabBar({
  userId,
  unreadWord,
}: {
  userId: string;
  unreadWord: number;
}) {
  const pathname = usePathname();
  const unread = useUnreadWord(userId, unreadWord);
  return (
    <nav className="mbr-tabbar" aria-label="Member tabs">
      {TABS.map(([href, icon, label]) => (
        <Link
          key={href}
          href={href}
          className="mbr-tab"
          aria-current={isCurrent(pathname, href) ? "page" : undefined}
        >
          <span className="mbr-tab__ic">
            <Icon name={icon} size={20} />
            {href === "/inbox" ? <WordDot count={unread} /> : null}
          </span>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
