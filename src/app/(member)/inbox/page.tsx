import type { Metadata } from "next";
import { Button, Icon, StateBlock } from "@/components/ds";
import { getMember, type Notification } from "../data";
import { KIND_ICON, relTime } from "../relative";
import { markAllRead } from "./actions";

export const metadata: Metadata = { title: "The Word" };

function Row({ n, index }: { n: Notification; index: number }) {
  return (
    <div className={"wrd-item" + (index === 0 ? " ls-rise" : index < 4 ? ` ls-rise-${Math.min(index, 3)}` : "")}>
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
    </div>
  );
}

const DAY_MS = 86400000;

export default async function WordPage() {
  const { supabase, user } = await getMember();

  /* Capped. The word never stops arriving, and this query had no ceiling — a
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

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayMs = dayStart.getTime();
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
    <div>
      <div className="wrd-head">
        <div>
          <span className="mbr-eyebrow">The Word</span>
          <h1 className="mbr-h1" style={{ marginTop: 6 }}>
            {unread ? `${unread} new.` : "All read."}
          </h1>
        </div>
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
    </div>
  );
}
