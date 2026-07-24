"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, IconButton, Wordmark } from "@/components/ds";
import { SURFACES } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  ["/home-port", "Home Port"],
  ["/gateway", SURFACES.gateway],
  ["/manifest", "Voyages"],
  ["/open-deck", SURFACES.openDeck],
  ["/chandlery", "Chandlery"],
  ["/portal", "Portal"],
  ["/passbook", SURFACES.passbook],
  ["/word", "Word"],
  ["/you", "You"],
] as const;

const TABS = [
  ["/home-port", "Anchor", "Home Port"],
  ["/gateway", "Navigation", SURFACES.gateway],
  ["/manifest", "Sailboat", "Voyages"],
  ["/passbook", "IdCard", SURFACES.passbook],
  ["/word", "Bell", "Word"],
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
  return (
    <header className="mbr-top">
      <div className="mbr-top__in">
        <Link href="/home-port" className="mbr-top__wm" aria-label="Home Port — home">
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
              {href === "/word" ? <WordDot count={unread} /> : null}
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
            {href === "/word" ? <WordDot count={unread} /> : null}
          </span>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
