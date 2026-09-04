"use client";

/* Push controls — the word, on this device.
   Permission and subscription live in the browser; the endpoint lives in
   push_subscriptions. A trigger already fans every notification into
   push_outbox, so enabling here is the whole of the member's part. */

import React from "react";
import { Switch } from "@/components/ds";
import { removePushSubscription, savePushSubscription } from "./signal-actions";

/* Public half of the VAPID pair — safe in the browser bundle by design. */
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BCpjDsjHZPzvA2pSfIpWmkMATNyxK7WcJYKMqTD6gj-DPEld7Roouodty-yvCVOkVWZgXIkUU_UBSPNu9d9JrK4";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "var(--track-data)",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

/* Capability is an external fact, not React state — read it as a store so the
   server renders "checking" and the client settles it on hydration. */
const NO_SUBSCRIBE = () => () => {};

function usePushSupport(): boolean | null {
  return React.useSyncExternalStore<boolean | null>(
    NO_SUBSCRIBE,
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    () => null
  );
}

export function PushControls() {
  const supported = usePushSupport();
  const [asked, setAsked] = React.useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* Notification.permission is only readable once the browser half is known. */
  const permission: NotificationPermission = asked ?? (supported ? Notification.permission : "default");

  React.useEffect(() => {
    if (!supported) return;
    let live = true;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => {
        if (live) setSubscribed(Boolean(sub));
      })
      .catch(() => {
        /* No worker yet — the switch registers one on the way in. */
      });
    return () => {
      live = false;
    };
  }, [supported]);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const granted = await Notification.requestPermission();
      setAsked(granted);
      if (granted !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      /* Always a fresh subscription, never a reused one. The endpoint is the
         key push_subscriptions rows are unique on, and the row belongs to
         whoever enabled it last. Reusing the device's existing subscription
         meant a second member on a shared phone tried to upsert an endpoint
         another member's row already held — which the policy refuses — and
         got "That didn't land" with nothing to do about it. A new endpoint is
         this member's alone; the old row goes stale and send-push drops it on
         its first 410. */
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe().catch(() => {});
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const keys = sub.toJSON().keys ?? {};
      const result = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: keys.p256dh ?? "",
        auth: keys.auth ?? "",
      });
      if (result.error) {
        await sub.unsubscribe().catch(() => {});
        setError(result.error);
        return;
      }
      setSubscribed(true);
    } catch {
      setError("That didn't land. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        const { endpoint } = sub;
        await sub.unsubscribe().catch(() => {});
        const result = await removePushSubscription(endpoint);
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      setSubscribed(false);
    } catch {
      setError("That didn't land. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (supported === null) {
    return <span style={MONO}>CHECKING THIS DEVICE</span>;
  }

  if (!supported) {
    return <span style={MONO}>NOT SUPPORTED ON THIS DEVICE</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Switch
        name="push"
        label="Send word to this device"
        checked={subscribed}
        disabled={busy || permission === "denied"}
        onChange={(e) => {
          if (busy) return;
          if (e.currentTarget.checked) void enable();
          else void disable();
        }}
      />
      {permission === "denied" ? (
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", maxWidth: "42ch" }}>
          This device is refusing the word. Change it in browser settings.
        </p>
      ) : (
        <span style={MONO}>
          {busy ? "WORKING" : subscribed ? "THIS DEVICE IS LISTENING" : "THIS DEVICE IS QUIET"}
        </span>
      )}
      {error ? (
        <p style={{ fontSize: "var(--text-xs)", color: "var(--terracotta, var(--text-2))" }} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
