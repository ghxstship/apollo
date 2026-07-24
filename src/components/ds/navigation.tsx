"use client";
import React from "react";

/* — Tabs — */
export interface TabItem { id: string; label: React.ReactNode }

export function Tabs({
  items = [], value, onChange, inverse = false, grow = false, className = "", style,
}: {
  items: TabItem[]; value?: string; onChange?: (id: string) => void;
  inverse?: boolean; grow?: boolean; className?: string; style?: React.CSSProperties;
}) {
  const cls = ["ls-tabs", inverse ? "ls-tabs--inverse" : "", grow ? "ls-tabs--grow" : "", className].filter(Boolean).join(" ");
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = (e.key === "ArrowRight") !== (getComputedStyle(e.currentTarget).direction === "rtl") ? 1 : -1;
    const i = items.findIndex((it) => it.id === value);
    const next = items[(i + dir + items.length) % items.length];
    if (onChange && next) onChange(next.id);
  };
  return (
    <div className={cls} style={style} role="tablist" aria-orientation="horizontal" onKeyDown={onKey}>
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id}
          className={"ls-tab" + (value === it.id ? " ls-tab--active" : "")}
          onClick={() => onChange && onChange(it.id)}>{it.label}</button>
      ))}
    </div>
  );
}
