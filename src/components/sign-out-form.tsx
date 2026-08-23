"use client";

import type { ReactNode } from "react";

/* Signing out ends the Supabase session server-side, but Cache Storage belongs
   to the service worker and outlived it — on a shared or resold phone the next
   person's failed fetch could fall through to the last member's pages. The
   worker clears itself when told, so tell it on the way out. */
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
        navigator.serviceWorker?.controller?.postMessage({ type: "SYRIUS_SIGNED_OUT" });
      }}
    >
      {children}
    </form>
  );
}
