"use client";

import React from "react";
import { CLUB_ZONE } from "@/lib/brand";
import { Badge, Button, Dialog, FilterPills, ListToolbar, StateBlock, Toast } from "@/components/ds";
import { logDateTime } from "@/lib/format";
import { useToast } from "../../ui";
import { approveMedia, removeMedia, unapproveMedia } from "./actions";

export type MediaCard = {
  id: string;
  episodeId: string;
  voyageTitle: string;
  uploader: string;
  caption: string;
  approved: boolean;
  createdAt: string;
  /* Null when the file is gone from the bucket but the row remains — staff
     still need the card in order to clear it. */
  src: string | null;
};

export function MediaClient({
  cards,
  episodes,
}: {
  cards: MediaCard[];
  episodes: Array<{ id: string; title: string }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, toastOpen, show, clear } = useToast();
  const [episodeId, setEpisodeId] = React.useState("");
  const [state, setState] = React.useState("pending");
  const [removing, setRemoving] = React.useState<MediaCard | null>(null);

  const shown = cards.filter((c) => {
    if (episodeId && c.episodeId !== episodeId) return false;
    if (state === "pending" && c.approved) return false;
    if (state === "approved" && !c.approved) return false;
    return true;
  });

  /* Which frame is working. One transition flag covers the whole gallery, so
     without this every card's button would read as working at once. */
  const [acting, setActing] = React.useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string }>, ok: () => void, key?: string) => {
    setActing(key ?? null);
    startTransition(async () => {
      const res = await fn();
      setActing(null);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  return (
    <>
      <ListToolbar
        filterCount={(episodeId ? 1 : 0) + (state ? 1 : 0)}
        filters={
          <>
            <FilterPills
              label="State"
              value={state || "all"}
              onChange={(next) => setState(next === "all" ? "" : next)}
              allLabel="Everything"
              allCount={cards.length}
              options={[
                { id: "pending", label: "Waiting on a look", count: cards.filter((c) => !c.approved).length },
                { id: "approved", label: "Cleared", count: cards.filter((c) => c.approved).length },
              ]}
            />
            <FilterPills
              label="Episode"
              value={episodeId || "all"}
              onChange={(next) => setEpisodeId(next === "all" ? "" : next)}
              allLabel="Every episode"
              options={episodes.map((v) => ({ id: v.id, label: v.title }))}
            />
          </>
        }
        chips={[
          ...(state
            ? [{ key: "state", label: "State", value: state === "approved" ? "Cleared" : "Waiting on a look" }]
            : []),
          ...(episodeId
            ? [{ key: "episode", label: "Episode", value: episodes.find((v) => v.id === episodeId)?.title ?? "" }]
            : []),
        ]}
        onDropChip={(key) => (key === "state" ? setState("") : setEpisodeId(""))}
        onClear={() => {
          setState("");
          setEpisodeId("");
        }}
        resultCount={shown.length}
        resultNoun="frame"
        countSuffix={` of ${cards.length}`}
      />

      {shown.length ? (
        <div className="hm-media">
          {shown.map((c) => (
            <figure className="hm-media__card" key={c.id}>
              <div className="hm-media__shot">
                {c.src ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- member uploads served from a signed bucket URL; no loader in front of it */
                  <img
                    src={c.src}
                    alt={
                      c.caption
                        ? `${c.caption} — ${c.voyageTitle}`
                        : `Frame from ${c.voyageTitle}, sent up by ${c.uploader}`
                    }
                    loading="lazy"
                  />
                ) : (
                  <span className="hm-mono hm-media__missing">
                    FILE MISSING — CLEAR THIS RECORD
                  </span>
                )}
              </div>
              <figcaption className="hm-media__body">
                <span className="hm-mono">
                  {c.voyageTitle.toUpperCase()} · {logDateTime(c.createdAt, CLUB_ZONE)}
                </span>
                <p>{c.caption || "No caption."}</p>
                <span className="hm-mono">{c.uploader.toUpperCase()}</span>
                <span>
                  {c.approved ? (
                    <Badge tone="positive">Cleared</Badge>
                  ) : (
                    <Badge tone="outline">Waiting</Badge>
                  )}
                </span>
              </figcaption>
              <div className="hm-media__acts">
                {c.approved ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending && acting !== "pull:" + c.id}
                    pending={acting === "pull:" + c.id}
                    pendingLabel="Pulling back…"
                    onClick={() =>
                      run(
                        () => unapproveMedia(c.id),
                        () => show({ msg: "Pulled back for another look.", meta: "NOT SHOWING" }),
                        "pull:" + c.id
                      )
                    }
                  >
                    Pull back
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending && acting !== "approve:" + c.id}
                    pending={acting === "approve:" + c.id}
                    pendingLabel="Approving…"
                    onClick={() =>
                      run(
                        () => approveMedia(c.id),
                        () => show({ msg: "Cleared to show.", meta: "APPROVED", tone: "positive" }),
                        "approve:" + c.id
                      )
                    }
                  >
                    Approve
                  </Button>
                )}
                {/* Remove takes the frame off the record for good; Pull back
                    beside it is a reversible second look. They were the same
                    ghost button, side by side, on every card. */}
                <Button variant="danger" size="sm" disabled={pending} onClick={() => setRemoving(c)}>
                  Remove
                </Button>
              </div>
            </figure>
          ))}
        </div>
      ) : (
        <div className="hm-block">
          <StateBlock
            status="empty"
            title={cards.length ? "Nothing under that filter." : "Nothing waiting."}
            detail={
              cards.length
                ? "Widen the filters to see every frame on the record."
                : "When someone aboard sends a frame up, it queues here for a look."
            }
          />
        </div>
      )}

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        width={420}
        eyebrow={removing ? removing.voyageTitle : ""}
        title="Remove this frame?"
        footer={
          removing ? (
            <>
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                pending={pending}
                pendingLabel="Removing…"
                onClick={() => {
                  const target = removing;
                  setRemoving(null);
                  run(
                    () => removeMedia(target.id),
                    () =>
                      show({
                        msg: "Frame removed from the record.",
                        meta: "GONE FROM THE GALLERY",
                        tone: "caution",
                      })
                  );
                }}
              >
                Remove
              </Button>
            </>
          ) : null
        }
      >
        <p className="hm-body">
          It leaves the record and stops showing anywhere. There is no undo from here — the member
          would have to send it up again.
        </p>
      </Dialog>

      {toast ? (
        <Toast fixed open={toastOpen} message={toast.msg} meta={toast.meta} tone={toast.tone} onClose={clear} />
      ) : null}
    </>
  );
}
