"use client";

import type { ReactNode } from "react";

/* Signing out ends the Supabase session server-side, but Cache Storage belongs
   to the service worker and outlived it — on a shared or resold phone the next
   person's failed fetch could fall through to the last member's pages.

   Telling the worker is not enough on its own: `controller` is null on the
   first load before a worker claims the page, and null forever anywhere the
   worker never registered, so the postMessage was a silent no-op exactly when
   it mattered. Clear the caches directly as well — the page can do that
   itself, and it does not need a worker's permission. */
export function SignOutForm({
  children,
  style,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <form
      action="/auth/signout"
      method="post"
      style={style}
      onSubmit={() => {
        try {
          navigator.serviceWorker?.controller?.postMessage({ type: "SYRIUS_SIGNED_OUT" });
          if (typeof caches !== "undefined") {
            void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
          }
        } catch {
          /* Nothing here is worth blocking a sign-out for. */
        }
      }}
    >
      {children}
    </form>
  );
}
