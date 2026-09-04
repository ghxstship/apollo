import type { Metadata } from "next";
import { Suspense } from "react";
import { Button, Icon, StateBlock } from "@/components/ds";
import { CLUB_ZONE } from "@/lib/brand";
import { startOfDay } from "@/lib/format";
import { getMember, type Notification } from "../data";
import { KIND_ICON, noticeHref, relTime } from "../relative";
import { markAllRead } from "./actions";
import { NoticeLink } from "./notice-link";

/* Plain utility, plainly named — the owner’s call. Route, nav label, title
   and h1 all read Inbox; there is no poetic alias for it any more. */
export const metadata: Metadata = { title: "Inbox" };

/* Every notice is a link to the thing it is about. The href is the column when
   the writer set one and the kind's own door when they did not; tapping it
   reads the notice on the way through. */
function Row({ n, index }: { n: Notification; index: number }) {
  return (
    <NoticeLink
      id={n.id}
      href={noticeHref(n.kind, n.href)}
      read={n.read}
      className={"wrd-item" + (index === 0 ? " ls-rise" : index < 4 ? ` ls-rise-${Math.min(index, 3)}` : "")}
    >
      <span className="wrd-ic">
        <Icon name={KIND_ICON[n.kind] ?? "Radio"} size={16} />
      </span>
      <div>
        <b>{n.title}</b>
        {n.body ? <p>{n.body}</p> : null}
      </div>
      <span className="wrd-t">
        {!n.read ? <span className="ls-live" role="img" aria-label="Unread"></span> : null}
        {relTime(n.created_at)}
      </span>
    </NoticeLink>
  );
}

const DAY_MS = 86400000;

/* The reads, behind their own boundary. There is deliberately no loading.tsx
   under (member): the group is redirect-gated, and a loading file answers 200
   before the gate has said its 3xx. */
async function InboxBody() {
  const { supabase, user, zone } = await getMember();

  /* Capped. Notices never stop arriving, and this query had no ceiling — a
     member two seasons in rendered every notice ever written to them in one
     document. Sixty is a long scroll and a bounded one. */
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
    /* Counted at the source, not off the page: the headline is how many are
       unread, which the sixty rows below can no longer answer for. */
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("read", false),
  ]);

  const items: Notification[] = data ?? [];
  const unread = count ?? items.filter((n) => !n.read).length;

  /* Midnight on the member's own clock. setHours(0) read the render host's,
     so on a UTC host "Today" turned over at 20:00 in Miami. */
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone || CLUB_ZONE }).format(new Date());
  const todayMs = Date.parse(startOfDay(today, zone));
  const weekMs = todayMs - 6 * DAY_MS;
  const monthMs = todayMs - 29 * DAY_MS;
  const at = (n: Notification) => new Date(n.created_at).getTime();

  /* "Earlier" was everything that was not today — a single heading over months
     of notices. The same run, read as the member reads time. */
  const groups: Array<[string, Notification[]]> = [
    ["Today", items.filter((n) => at(n) >= todayMs)],
    ["This week", items.filter((n) => at(n) < todayMs && at(n) >= weekMs)],
    ["This month", items.filter((n) => at(n) < weekMs && at(n) >= monthMs)],
    ["Earlier", items.filter((n) => at(n) < monthMs)],
  ];

  return (
    <>
      <div className="wrd-head" style={{ marginTop: 8 }}>
        <p style={{ fontSize: 14, color: "var(--text-2)" }}>
          {unread ? `${unread} new.` : "All read."}
        </p>
        {unread > 0 ? (
          <form action={markAllRead}>
            <Button type="submit" variant="outline" size="sm">
              Mark all read
            </Button>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="mbr-sec">
          <StateBlock
            status="empty"
            icon="Radio"
            title="Quiet water."
            detail="Weather, passes, hails, and knots land here."
          />
        </div>
      ) : (
        <>
          {groups.map(([label, rows]) =>
            rows.length > 0 ? (
              <section className="mbr-sec" key={label}>
                <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
                  {label}
                </span>
                <div className="wrd-list">
                  {rows.map((n, i) => (
                    <Row key={n.id} n={n} index={i} />
                  ))}
                </div>
              </section>
            ) : null
          )}
        </>
      )}
    </>
  );
}

export default function InboxPage() {
  return (
    <div>
      <div>
        {/* The count was the h1, so the page never said its own name. The
            name is the h1 now and the count is the standfirst under it —
            still the first thing read, and still the number that matters. */}
        <span className="mbr-eyebrow">Notices</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          Inbox.
        </h1>
      </div>
      <Suspense
        fallback={
          <div className="mbr-sec">
            <StateBlock status="loading" />
          </div>
        }
      >
        <InboxBody />
      </Suspense>
    </div>
  );
}
