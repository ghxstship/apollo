"use client";

import React from "react";
import { Button, Toast } from "@/components/ds";

/* Clipboard interactions for the brand kit — swatches and boilerplate.
   One polite toast at a time, 4000ms, per the normalization plan. */

type Notice = { msg: string; meta: string };

const NoticeContext = React.createContext<(n: Notice) => void>(() => {});

export function CopyProvider({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = React.useState<Notice | null>(null);
  React.useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  return (
    <NoticeContext.Provider value={setNotice}>
      {children}
      {notice ? (
        <Toast fixed message={notice.msg} meta={notice.meta} onDismiss={() => setNotice(null)} />
      ) : null}
    </NoticeContext.Provider>
  );
}

function useCopy() {
  const notify = React.useContext(NoticeContext);
  return async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify({ msg: label + " copied.", meta: "BRAND KIT" });
    } catch {
      notify({ msg: "The clipboard refused. Select it by hand.", meta: "BRAND KIT" });
    }
  };
}

export function Swatch({
  name, hex, use, onMedia,
}: { name: string; hex: string; use: string; onMedia?: boolean }) {
  const copy = useCopy();
  return (
    <button type="button" className="bk-sw" onClick={() => copy(name, hex)} title={"Copy " + hex}>
      <span className="chip" style={{ background: hex }}>
        <span className="hex" style={{ color: onMedia ? "var(--text-on-media)" : "rgba(11,11,12,.65)" }}>{hex}</span>
      </span>
      <span className="nm">{name}</span>
      <span className="use">{use}</span>
    </button>
  );
}

export function CopyTextButton({
  label, text, children, variant = "outline", inverse = false, fullWidth = false, size,
}: {
  label: string; text: string; children: React.ReactNode;
  variant?: "primary" | "brass" | "outline" | "ghost"; inverse?: boolean; fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const copy = useCopy();
  return (
    <Button variant={variant} inverse={inverse} fullWidth={fullWidth} size={size} onClick={() => copy(label, text)}>
      {children}
    </Button>
  );
}
