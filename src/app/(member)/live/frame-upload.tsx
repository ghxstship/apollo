"use client";

import React from "react";
import { Button } from "@/components/ds";
import { uploadFrame } from "./actions";

/* One frame at a time, straight to the Bridge's queue. No local queue here —
   a photograph is not a check-in: if the water swallows the send, the member
   still holds the original and sends it again when the bars come back. */
export function FrameUpload({ voyageId }: { voyageId: string }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setError(null);
    setSent(false);
    const res = await uploadFrame(new FormData(form));
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    form.reset();
    setSent(true);
  }

  return (
    <form onSubmit={submit}>
      <input type="hidden" name="voyage_id" value={voyageId} />
      <div style={{ display: "grid", gap: 10 }}>
        <input
          ref={fileRef}
          type="file"
          name="frame"
          accept="image/*"
          required
          aria-label="Frame to send"
          onChange={() => {
            setError(null);
            setSent(false);
          }}
        />
        <input
          type="text"
          name="caption"
          maxLength={200}
          placeholder="A line for the log, if it wants one"
          aria-label="Caption"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send the frame"}
        </Button>
      </div>
      {error ? (
        <p role="alert" style={{ marginTop: 8 }}>
          {error}
        </p>
      ) : null}
      {sent ? (
        <p style={{ marginTop: 8 }}>
          In the queue for the Bridge&apos;s eye — it reaches the gallery once cleared.
        </p>
      ) : null}
    </form>
  );
}
