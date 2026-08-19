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

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 4000);
    return () => clearTimeout(t);
  }, [copied]);

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
      {copied ? <Toast fixed message={toast} onDismiss={() => setCopied(false)} /> : null}
    </>
  );
}
