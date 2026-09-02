"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, IconButton, Wordmark } from "@/components/ds";
import { LOGBOOK, SURFACES } from "@/lib/brand";
import { memberMark } from "@/lib/membership";
import { createClient } from "@/lib/supabase/client";
import { SignOutForm } from "@/components/sign-out-form";

/* Every label here is the destination's NAME, not a description of it — the
   route, this label, the page title and the page h1 are one word per surface,
   and a change to any of the four is a change to all four. */
const LINKS = [
  ["/home", SURFACES.homePort],
  ["/live", SURFACES.gateway],
  ["/passes", "Passes"],
  /* The one link here that leaves the member shell, and deliberately so.
     /series was a member route until 2026-09-02, when the copy audit found
     that the page explaining the five strands was sitting behind the sign-in —
     unreadable by exactly the people deciding whether to apply. It is public
     now, and the member page was retired rather than duplicated: the two facts
     it carried that the public one did not were price and capacity, and under
     Model C both moved onto the episode.

     Do NOT recreate (member)/series to close the seam. Two pages in different
     route groups cannot resolve to one path — Next refuses the build outright,
     which is how this was found. */
  ["/series", SURFACES.series],
  ["/itinerary", "Itinerary"],
  ["/open-deck", SURFACES.openDeck],
  ["/directory", "Directory"],
  ["/tonight", "Tonight"],
  ["/matches", "Matches"],
  ["/vetting", "Vetting"],
  ["/radar", "Radar"],
  ["/regattas", LOGBOOK.regattas],
  ["/threads", "Threads"],
  ["/shop", SURFACES.shop],
  ["/portal", "Portal"],
  ["/account", "Account"],
  ["/card", SURFACES.passbook],
  ["/membership/standing", "Standing"],
  ["/agreements", "Agreements"],
  ["/inbox", "Inbox"],
  ["/you", "You"],
] as const;

const TABS = [
  /* Two tab labels here are SHORTENINGS of their destination's name, not other
     names for it. At 9px mono with .12em tracking a label wants about 6px per
     character, and six tabs leave roughly 62px each — anything past nine
     characters wraps to a second line and lifts the whole bar off the safe
     area. Member Card and Home Port are both over it. The destinations are
     still the Member Card and Home Port: the desktop nav, the page title and
     the page h1 all say so, and those are the four that have to agree. */
  ["/home", "Anchor", "Home"],
  ["/live", "Navigation", SURFACES.gateway],
  ["/passes", "Sailboat", "Passes"],
  ["/card", "IdCard", "Card"],
  ["/inbox", "Bell", "Inbox"],
  ["/you", "User", "You"],
] as const;

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/* The nav scrolls sideways inside the bar, and seven of the twenty-one links
   sit past its right edge — Portal, Account, Member Card, Standing, Agreements,
   Inbox and You were invisible by default, including the one you were standing
   on. Bring the current link into the middle of the strip on mount and on every
   move; block:"nearest" keeps the page itself from scrolling. */
function useScrollCurrentIntoView(pathname: string) {
  const ref = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const here = ref.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    here?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);
  return ref;
}

/* Live unread count for the Inbox — recounts on any notifications change. */
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
          /* Your own notices only, and never the DELETE that realtime would
             broadcast past the filter. */
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${userId}`,
        },
        recount
      )
      /* UPDATE is RLS-filtered too, and it is how the badge falls when the
         member marks a notice read in another tab. */
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
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
      /* INSERT and UPDATE are filtered by RLS; DELETE is broadcast to everyone
         whatever the policy says, and an unread count never needs it. */
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, schedule)
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
  const navRef = useScrollCurrentIntoView(pathname);
  return (
    <header className="mbr-top">
      <div className="mbr-top__in">
        <Link href="/home" className="mbr-top__wm" aria-label={`${SURFACES.homePort} — home`}>
          <Wordmark size="sm" suffix={null} />
        </Link>
        <nav className="mbr-nav" aria-label="Member navigation" ref={navRef}>
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
          {/* The run-of-show board. Crew-only like the Bridge, and conditioned
              the same way — it lives in the member route group by file layout,
              so without this it had no way in from any navigation at all and was
              reachable only by typing the address. */}
          {isStaff ? (
            <Link
              href="/show"
              aria-current={isCurrent(pathname, "/show") ? "page" : undefined}
            >
              Show
            </Link>
          ) : null}
        </nav>
        <div className="mbr-top__meta">
          {/* The number, set the way the member card sets it: a mark and digits,
              and no retired prefix. Every number in the database was minted with
              the old brand's letters in front of it, that string is in
              BANNED_TERMS, and this one line put it on all sixteen member
              surfaces. The column is not touched — it is on their papers. */}
          {memberNo ? <span className="mbr-top__no">{memberMark(memberNo)}</span> : null}
          <SignOutForm style={{ display: "inline-flex" }}>
            <IconButton label="Sign out" variant="ghost" size="sm" type="submit">
              <Icon name="LogOut" size={16} />
            </IconButton>
          </SignOutForm>
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
