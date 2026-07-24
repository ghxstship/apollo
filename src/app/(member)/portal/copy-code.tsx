"use client";

import React from "react";
import { Button, Toast } from "@/components/ds";

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 4000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* clipboard unavailable — the code is on screen regardless */
    }
    setCopied(true);
  };

  return (
    <>
      <div className="ptl-code">
        <span style={{ flex: 1 }}>{code}</span>
        <Button variant="ghost" size="sm" onClick={copy}>
          Copy
        </Button>
      </div>
      {copied ? (
        <Toast fixed message="Invite code copied." meta={code} onDismiss={() => setCopied(false)} />
      ) : null}
    </>
  );
}
