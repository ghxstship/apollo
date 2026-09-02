"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Toast } from "@/components/ds";
import { rotateSeasonFeed } from "./actions";

/* The way back from a season-feed address that got out. It asks first, because
   rotating is not undoable and it silences every calendar the member has
   already subscribed — the new address has to be added again everywhere. */
export function RotateFeed() {
  const router = useRouter();
  const [asking, setAsking] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const rotate = () => {
    setPending(true);
    setError(null);
    void (async () => {
      const res = await rotateSeasonFeed();
      setPending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setAsking(false);
      setToast("New address issued. The old one is dead — subscribe again with the one above.");
      router.refresh();
    })();
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
        Issue a new address
      </Button>

      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        width={420}
        eyebrow="Season feed"
        title="Issue a new address?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
              Keep this one
            </Button>
            <Button variant="gold" size="sm" disabled={pending} onClick={rotate}>
              Issue a new address
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>
            The address on this page stops answering straight away, and so does
            anyone else&rsquo;s copy of it. Your own calendars go quiet until you
            subscribe again with the new address.
          </p>
          {error ? (
            <p role="alert" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--siren)" }}>
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>

      {toast ? <Toast fixed message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
