"use client";

import React from "react";
import { Button, Toast } from "@/components/ds";

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false);

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
        <span className="mbr-fill">{code}</span>
        <Button variant="ghost" size="sm" onClick={copy}>
          Copy
        </Button>
      </div>
      {copied ? (
        <Toast fixed message="Invite code copied." meta={code} duration={4000} onClose={() => setCopied(false)} />
      ) : null}
    </>
  );
}
