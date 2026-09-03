"use client";

import React from "react";
import { Tag } from "./display";

/* The two control shapes, and there are only two.

   PILLS for an axis of six or fewer values a reader chooses between. Always
   visible, always carrying their own count — a pill that says how many rows it
   leads to is the difference between choosing and guessing, and it is the one
   thing every list in this app was missing.

   The tray they live in, the chips that read them back and the sort menu that
   sits beside them are all in toolbar.tsx — this file is just the axis.

   Every pill writes through useFilterParams, so what it produces is a URL. */

export type FilterOption = {
  id: string;
  label: string;
  /** Rows this value would leave. Omitted where counting is not meaningful. */
  count?: number;
};

/* — pills — */

export function FilterPills({
  label,
  options,
  value,
  onChange,
  allLabel = "All",
  allCount,
  className = "",
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (next: string) => void;
  /** Omit to drop the All pill — an axis where every row has a value. */
  allLabel?: string | null;
  allCount?: number;
  className?: string;
}) {
  /* The label span is the group's accessible name. Without the pairing a
     screen reader hears a run of bare toggles with no idea which of them are
     answers to the same question. */
  const id = React.useId();
  return (
    <div className={["ls-filters", className].filter(Boolean).join(" ")} role="group" aria-labelledby={id}>
      <span className="ls-filters__label" id={id}>
        {label}
      </span>
      {allLabel === null ? null : (
        <Tag active={value === "all"} onClick={() => onChange("all")}>
          {allLabel}
          {allCount == null ? null : <span className="ls-tag__n">{allCount}</span>}
        </Tag>
      )}
      {options.map((o) => (
        <Tag key={o.id} active={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count == null ? null : <span className="ls-tag__n">{o.count}</span>}
        </Tag>
      ))}
    </div>
  );
}
