"use client";

import React from "react";
import { cx } from "./class";
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
  /** Shown but not choosable — a value with nothing behind it right now. */
  disabled?: boolean;
};

/* — pills —
   One value at a time by default: `value` is the chosen id (or "all") and
   `onChange` gets the next one. With `multi`, `value` is the set of chosen
   ids and each pill toggles its own membership; the All pill clears the set
   and is active while the set is empty. */
type SingleProps = { multi?: false; value: string; onChange: (next: string) => void };
type MultiProps = { multi: true; value: string[]; onChange: (next: string[]) => void };

export type FilterPillsProps = {
  label: string;
  options: FilterOption[];
  /** Omit to drop the All pill — an axis where every row has a value. */
  allLabel?: string | null;
  allCount?: number;
  className?: string;
} & (SingleProps | MultiProps);

export function FilterPills({
  label,
  options,
  allLabel = "All",
  allCount,
  className = "",
  ...mode
}: FilterPillsProps) {
  /* The label span is the group's accessible name. Without the pairing a
     screen reader hears a run of bare toggles with no idea which of them are
     answers to the same question. */
  const id = React.useId();
  const isOn = (oid: string) => (mode.multi ? mode.value.includes(oid) : mode.value === oid);
  const allOn = mode.multi ? mode.value.length === 0 : mode.value === "all";
  const pick = (oid: string) => {
    if (mode.multi) {
      mode.onChange(mode.value.includes(oid) ? mode.value.filter((v) => v !== oid) : [...mode.value, oid]);
    } else {
      mode.onChange(oid);
    }
  };
  const clear = () => { if (mode.multi) mode.onChange([]); else mode.onChange("all"); };
  return (
    <div className={cx("ls-filters", className)} role="group" aria-labelledby={id}>
      <span className="ls-filters__label" id={id}>
        {label}
      </span>
      {allLabel === null ? null : (
        <Tag active={allOn} onClick={clear}>
          {allLabel}
          {allCount == null ? null : <span className="ls-tag__n">{allCount}</span>}
        </Tag>
      )}
      {options.map((o) => (
        <Tag key={o.id} active={isOn(o.id)} disabled={o.disabled} onClick={() => pick(o.id)}>
          {o.label}
          {o.count == null ? null : <span className="ls-tag__n">{o.count}</span>}
        </Tag>
      ))}
    </div>
  );
}
