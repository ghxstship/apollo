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
        {!n.read ? <span className="ls-live" aria-label="Unread"></span> : null}
        {relTime(n.created_at)}
      </span>
    </div>
  );
}

export default async function WordPage() {
  const { supabase, user } = await getMember();

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  const items: Notification[] = data ?? [];
  const unread = items.filter((n) => !n.read).length;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const today = items.filter((n) => new Date(n.created_at) >= dayStart);
  const earlier = items.filter((n) => new Date(n.created_at) < dayStart);

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
          {today.length > 0 ? (
            <section className="mbr-sec">
              <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
                Today
              </span>
              {today.map((n, i) => (
                <Row key={n.id} n={n} index={i} />
              ))}
            </section>
          ) : null}
          {earlier.length > 0 ? (
            <section className="mbr-sec">
              <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
                Earlier
              </span>
              {earlier.map((n, i) => (
                <Row key={n.id} n={n} index={i} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
