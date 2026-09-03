"use client";

import React from "react";
import { Button } from "./actions";
import { Icon, Tag } from "./display";
import { useModal } from "./use-modal";

/* THE list toolbar. One row, every list, no exceptions.

   This replaces the arrangement that grew here first — a pill row per axis,
   plus a pill row for sort, plus a chips row, plus a standing line — which put
   five or six rows of chrome above the first record and looked different on
   every surface.

   The shape is the one every serious list product has converged on, and they
   did not converge by accident: Shopify's Polaris ships it as a component
   (search, a Filter button, a Sort button that opens a popover), Linear puts
   Filter left and Display right with chips in a second bar, Notion gives
   Filter, Sort and Search three peer buttons, Stripe and the Shopify admin put
   search left and sort right with removable chips beneath.

   The three rules they all keep:

   ONE ROW. Search, filter and sort are peers. Not three shapes at three
   heights — one bar the eye reads in a single pass.

   SORT IS A MENU, NEVER PILLS. It is one value out of N and it is almost
   always the default; a row of pills spends a whole line saying so.

   CHIPS BELOW, AND ONLY WHEN THERE ARE ANY. What is in force reads back in one
   place, each one removable, with the way out at the end of the line. An empty
   chips row takes no space because it is not rendered.

   Axes live in the tray rather than in the open. A pill row is faster to read
   for the one axis a reader uses constantly, and that was the argument for
   keeping Setting outside — but the argument loses, because it is the argument
   every surface makes about its own favourite axis, and five surfaces each
   winning it is how the six-row header got built. */

export type SortOption = { id: string; label: string };
export type ToolbarChip = { key: string; label: string; value: string };

export function ListToolbar({
  search,
  filters,
  filterCount = 0,
  sortOptions,
  sortValue,
  onSort,
  resultCount,
  resultNoun = "result",
  resultNounPlural,
  countSuffix,
  chips = [],
  onDropChip,
  onClear,
  actions,
  trailing,
}: {
  /** Rendered as the field. Omit on a surface with nothing to type. */
  search?: React.ReactNode;
  /** The axes, as FilterPills. Omit where a surface has none. */
  filters?: React.ReactNode;
  /** Axes in force — the number on the button. Counts axes, not URL keys. */
  filterCount?: number;
  sortOptions?: SortOption[];
  sortValue?: string;
  onSort?: (id: string) => void;
  resultCount: number;
  resultNoun?: string;
  resultNounPlural?: string;
  /** " · SEP – NOV", or anything else the count line should carry. */
  countSuffix?: string;
  chips?: ToolbarChip[];
  onDropChip?: (key: string) => void;
  onClear?: () => void;
  /** A page action that belongs beside the controls rather than below them —
      the crate on the Shop. Rides the bar, before the count. */
  actions?: React.ReactNode;
  /** Rides the end of the chips line — the standing-view control, and nothing
      that needs to be seen when no filter is in force. */
  trailing?: React.ReactNode;
}) {
  const noun = resultCount === 1 ? resultNoun : (resultNounPlural ?? `${resultNoun}s`);
  const sortLabel = sortOptions?.find((s) => s.id === sortValue)?.label;

  return (
    <div className="ls-toolbar">
      <div className="ls-toolbar__bar">
        {search ? <div className="ls-toolbar__q">{search}</div> : null}
        {filters ? (
          <FilterButton count={filterCount} resultCount={resultCount} noun={noun} onClear={onClear}>
            {filters}
          </FilterButton>
        ) : null}
        {sortOptions && sortOptions.length > 1 && onSort ? (
          <SortButton options={sortOptions} value={sortValue} label={sortLabel} onPick={onSort} />
        ) : null}
        {actions}
        <span className="ls-toolbar__count">
          {resultCount} {noun}
          {countSuffix ?? ""}
        </span>
      </div>
      {chips.length > 0 || trailing ? (
        <div className="ls-toolbar__under">
          {chips.map((c) => (
            <Tag
              key={c.key}
              className="ls-toolbar__chip"
              onRemove={onDropChip ? () => onDropChip(c.key) : undefined}
              removeLabel={`Remove the ${c.label.toLowerCase()} filter`}
            >
              <span className="ls-toolbar__chipk">{c.label}</span>
              {c.value}
            </Tag>
          ))}
          {chips.length > 0 && onClear ? (
            <button type="button" className="ls-toolbar__clear" onClick={onClear}>
              Clear all
            </button>
          ) : null}
          {trailing ? <span className="ls-toolbar__trail">{trailing}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* — Filter and Sort are the same object at two sizes —

   They were not, and it showed: Sort dropped from its button while Filter
   arrived from off the screen edge as a full-height drawer behind a scrim.
   Two buttons sitting side by side, identical to look at, opening two
   unrelated kinds of surface. The drawer was the odd one out — it is an
   e-commerce MOBILE pattern applied at desktop, and its scrim dimmed the very
   results the panel exists to let you watch change.

   Both are anchored panels now, from the same wrapper, with the same corner,
   border and shadow. What still differs is only what they hold, because the
   two controls really do different work:

   SORT is one choice that closes on selection — pick, apply, dismiss.

   FILTER is a session. The reader sets an axis, then another, watching the
   counts move and the foot recount, so the panel must persist across
   selections. That is why it keeps a foot and Sort does not, and it is why it
   is the wider of the two rather than a menu.

   Absolute inside a relative wrapper, not fixed: a menu belongs to its button,
   and absolute positioning resolves against that wrapper rather than against
   whichever ancestor happens to be running an animation. On a phone both
   become bottom sheets, which is the one place a sheet is the right pattern. */

function FilterButton({
  count,
  resultCount,
  noun,
  onClear,
  children,
}: {
  count: number;
  resultCount: number;
  noun: string;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  /* modal:false is load-bearing: the results behind the panel stay readable
     and scrollable, which is the whole reason this is not a dialog. It takes
     Escape and focus, and never traps Tab or locks the page. */
  const boxRef = useModal(open, () => setOpen(false), { modal: false });
  const panelId = React.useId();

  return (
    <span className="ls-pop">
      <Button
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="SlidersHorizontal" size={14} />
        Filter
        {count > 0 ? <span className="ls-toolbar__n">{count}</span> : null}
      </Button>
      {open ? (
        <>
          {/* Catches the click that dismisses. Invisible, and it does not veil
              the page — the results underneath are the point. */}
          <span className="ls-pop__catch" onClick={() => setOpen(false)} />
          <div
            id={panelId}
            className="ls-pop__panel ls-filterpanel"
            role="dialog"
            aria-label="Filters"
            ref={boxRef}
            tabIndex={-1}
          >
            <div className="ls-filterpanel__body">{children}</div>
            {/* The count rides the foot so it stays in view however far down
                the axes the reader has scrolled. Applying is not a step — the
                filters are already live — so this only dismisses, and it says
                what it is dismissing you back to. */}
            <div className="ls-filterpanel__foot">
              {count > 0 && onClear ? (
                <Button variant="ghost" size="sm" onClick={onClear}>
                  Clear all
                </Button>
              ) : null}
              <Button variant="gold" size="sm" onClick={() => setOpen(false)}>
                Show {resultCount} {noun}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </span>
  );
}

function SortButton({
  options,
  value,
  label,
  onPick,
}: {
  options: SortOption[];
  value?: string;
  label?: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const boxRef = useModal(open, () => setOpen(false), { modal: false });
  const menuId = React.useId();

  return (
    <span className="ls-pop">
      <Button
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="ArrowUpDown" size={14} />
        {label ?? "Sort"}
      </Button>
      {open ? (
        <>
          <span className="ls-pop__catch" onClick={() => setOpen(false)} />
          <div
            id={menuId}
            className="ls-pop__panel ls-sortmenu"
            role="listbox"
            ref={boxRef}
            tabIndex={-1}
          >
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === value}
                className={"ls-sortmenu__opt" + (o.id === value ? " ls-sortmenu__opt--on" : "")}
                onClick={() => {
                  onPick(o.id);
                  setOpen(false);
                }}
              >
                {o.label}
                {o.id === value ? <Icon name="Check" size={14} /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </span>
  );
}
