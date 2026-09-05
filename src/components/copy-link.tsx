"use client";

/* Copy control for a long, unmemorable URL — the season feed, mostly. */

import React from "react";
import { Button, Toast } from "@/components/ds";

export function CopyLink({
  value,
  label = "Copy",
  toast = "Copied.",
}: {
  value: string;
  label?: string;
  toast?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* Clipboard unavailable — the address is on screen regardless. */
    }
    setCopied(true);
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={copy}>
        {copied ? "Copied" : label}
      </Button>
      {/* Toast owns its own clock and its own exit: `duration` starts the
          4000ms it used to be given by a hand-rolled setTimeout here, and
          `onClose` fires once the exit animation has actually run — which the
          old shape never let it do, because the state that unmounted the toast
          was the same state that would have played it out. */}
      {copied ? <Toast fixed message={toast} duration={4000} onClose={() => setCopied(false)} /> : null}
    </>
  );
}
