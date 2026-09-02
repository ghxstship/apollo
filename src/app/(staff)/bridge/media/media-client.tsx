"use client";

import React from "react";
import { CLUB_ZONE } from "@/lib/brand";
import { Badge, Button, Dialog, Select, StateBlock, Toast } from "@/components/ds";
import { logDateTime } from "@/lib/format";
import { useToast } from "../../ui";
import { approveMedia, removeMedia, unapproveMedia } from "./actions";

export type MediaCard = {
  id: string;
  voyageId: string;
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
  voyages,
}: {
  cards: MediaCard[];
  voyages: Array<{ id: string; title: string }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [voyageId, setVoyageId] = React.useState("");
  const [state, setState] = React.useState("pending");
  const [removing, setRemoving] = React.useState<MediaCard | null>(null);

  const shown = cards.filter((c) => {
    if (voyageId && c.voyageId !== voyageId) return false;
    if (state === "pending" && c.approved) return false;
    if (state === "approved" && !c.approved) return false;
    return true;
  });

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  return (
    <>
      <div className="hm-filters">
        <Select
          label="Episode"
          value={voyageId}
          onChange={(e) => setVoyageId(e.target.value)}
          options={[
            { value: "", label: "Every episode" },
            ...voyages.map((v) => ({ value: v.id, label: v.title })),
          ]}
        />
        <Select
          label="State"
          value={state}
          onChange={(e) => setState(e.target.value)}
          options={[
            { value: "pending", label: "Waiting on a look" },
            { value: "approved", label: "Cleared" },
            { value: "", label: "Everything" },
          ]}
        />
        <span className="hm-filters__acts hm-mono">
          {shown.length} OF {cards.length} FRAMES
        </span>
      </div>

      {shown.length ? (
        <div className="hm-media">
          {shown.map((c) => (
            <figure className="hm-media__card" key={c.id} style={{ margin: 0 }}>
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
                  <span className="hm-mono" style={{ padding: 12, display: "block" }}>
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
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => unapproveMedia(c.id),
                        () => show({ msg: "Pulled back for another look.", meta: "NOT SHOWING" })
                      )
                    }
                  >
                    Pull back
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => approveMedia(c.id),
                        () => show({ msg: "Cleared to show.", meta: "APPROVED", tone: "positive" })
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
        <div style={{ marginTop: 20 }}>
          <StateBlock
            status="empty"
            title="Nothing waiting."
            detail="When someone aboard sends a frame up, it queues here for a look."
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
                disabled={pending}
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
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
