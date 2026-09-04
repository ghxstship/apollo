"use client";
import React from "react";

/* — Tabs —
   The WAI-ARIA tabs pattern, the manual-activation flavour with arrows that
   select as they move (the kit's tabs switch content that is already loaded,
   so selection on arrow is what every reader expects here).

   Roving tabindex: only the selected tab is in the Tab order, so a keyboard
   reader crosses the rail in one stop and lands in the panel, rather than
   stepping through every tab to reach what is under them. Arrow keys move
   selection AND focus — before this they moved selection only, so the focus
   ring stayed on the tab the reader had just left. Home and End go to the
   ends, and the rail wraps.

   The tab/panel pairing is the caller's: give each item a `panelId` and the
   tab renders aria-controls for it; the panel itself is role="tabpanel". */
export interface TabItem {
  id: string;
  label: React.ReactNode;
  /** id of the panel this tab controls, for aria-controls. */
  panelId?: string;
}

export function Tabs({
  items = [], value, onChange, inverse = false, grow = false, label, className = "", style,
}: {
  items: TabItem[]; value?: string; onChange?: (id: string) => void;
  inverse?: boolean; grow?: boolean;
  /** Accessible name for the tablist — what these tabs switch between. */
  label?: string;
  className?: string; style?: React.CSSProperties;
}) {
  const cls = ["ls-tabs", inverse ? "ls-tabs--inverse" : "", grow ? "ls-tabs--grow" : "", className].filter(Boolean).join(" ");
  const selected = items.findIndex((it) => it.id === value);
  /* With nothing selected the first tab is the one in the Tab order, so the
     rail is never unreachable. */
  const tabbable = selected >= 0 ? selected : 0;
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!items.length) return;
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const i = selected >= 0 ? selected : 0;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + (rtl ? -1 : 1) + items.length) % items.length;
    else if (e.key === "ArrowLeft") next = (i + (rtl ? 1 : -1) + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    const tabs = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[next]?.focus();
    if (onChange) onChange(items[next].id);
  };
  return (
    <div className={cls} style={style} role="tablist" aria-orientation="horizontal" aria-label={label} onKeyDown={onKey}>
      {items.map((it, i) => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id}
          aria-controls={it.panelId} tabIndex={i === tabbable ? 0 : -1}
          className={"ls-tab" + (value === it.id ? " ls-tab--active" : "")}
          onClick={() => onChange && onChange(it.id)}>{it.label}</button>
      ))}
    </div>
  );
}
