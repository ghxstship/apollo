"use client";

import React from "react";
import { Button } from "./actions";
import { cx } from "./class";
import { Icon, Tag } from "./display";
import { useExitPhase } from "./use-exit-phase";
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

export interface ListToolbarProps {
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
}

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
}: ListToolbarProps) {
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

/* The shell both of them are. It owns the open state, the anchor, the catch,
   the exit phase, the panel element and everything the panel owes the keyboard;
   what is left over — the trigger, and what is inside — is all that ever
   differed. Two copies of this stood here, and the drift between them is on
   record: one was a fixed drawer behind a scrim and the other a dropdown, and
   after they were reconciled the exit phase still had to be added to each of
   them separately.

   `trigger` and `children` are functions rather than nodes so the caller can
   reach the state it needs — `open` for aria-expanded, `close` for a button
   inside the panel — without the shell guessing which of them it wants. */
function Popover({
  role,
  label,
  panelClass,
  trigger,
  children,
}: {
  /** dialog for a panel that persists across selections, menu for one choice
      that closes on picking. */
  role: "dialog" | "menu";
  /** Names the panel. A popover with no accessible name is announced as
      "dialog" and nothing else. */
  label: string;
  /** The panel's own class, beside `ls-pop__panel`. */
  panelClass: string;
  trigger: (state: { open: boolean; toggle: () => void; controls: string }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  /* modal:false is load-bearing: the results behind the panel stay readable
     and scrollable, which is the whole reason this is not a dialog. It takes
     Escape and focus, and never traps Tab or locks the page. */
  const boxRef = useModal(open, close, { modal: false });
  const id = React.useId();
  /* Both panels arrived on --dur-enter and left between two frames. They are
     held for one --dur-exit now, the same way the Dialog holds its veil. */
  const { present, closing, onAnimationEnd } = useExitPhase(open, { ref: boxRef });

  /* — what role="menu" owes the keyboard —
     The panel declared role="menu" with menuitemradio children and had no
     onKeyDown anywhere: focus landed on the panel box and Tab walked the
     items one at a time. A menu is not a Tab stop per item — every reader
     that hears "menu" reaches for the arrow keys, and Tab is how you leave.
     Declaring the role and not serving it is worse than the listbox claim it
     replaced, because this one names the exact keys it then ignores.

     So: roving tabindex. One item in the tab order at a time (the checked one
     when there is one, so Tab lands where the reader already is), Up/Down
     wrapping, Home/End to the ends. Tab still leaves the menu, which is what
     it is for.

     Everything is read off the DOM rather than out of state because the shell
     does not know what its children are — `children` is the caller's render
     function, and FilterButton's panel is a form, not a menu. `role` is the
     one thing that decides whether any of this runs. */
  const menuItems = React.useCallback(
    () => Array.from(
      boxRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]'
      ) ?? []
    ),
    [boxRef]
  );

  /* Declared after useModal, which focuses the panel box on open; the later
     effect wins, so focus lands on an item rather than on the box around it.
     Focusing is a DOM call, not a setState, so nothing cascades. */
  React.useEffect(() => {
    if (role !== "menu" || !present) return;
    const items = menuItems();
    if (items.length === 0) return;
    const checked = items.findIndex((el) => el.getAttribute("aria-checked") === "true");
    const start = checked < 0 ? 0 : checked;
    items.forEach((el, i) => { el.tabIndex = i === start ? 0 : -1; });
    items[start].focus({ preventScroll: true });
  }, [role, present, menuItems]);

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (role !== "menu") return;
    const items = menuItems();
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (e.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    items.forEach((el, i) => { el.tabIndex = i === next ? 0 : -1; });
    items[next].focus();
  };

  return (
    <span className="ls-pop">
      {trigger({ open, toggle: () => setOpen((o) => !o), controls: id })}
      {present ? (
        <>
          {/* Catches the click that dismisses. Invisible, and it does not veil
              the page — the results underneath are the point. Dropped the
              instant the exit starts, so a click during it lands on the page
              rather than on a sheet that is already leaving. */}
          {closing ? null : <span className="ls-pop__catch" onClick={close} />}
          <div
            id={id}
            className={cx("ls-pop__panel", panelClass, closing && "ls-pop__panel--out")}
            role={role}
            aria-label={label}
            aria-hidden={closing || undefined}
            onAnimationEnd={onAnimationEnd}
            onKeyDown={onPanelKeyDown}
            ref={boxRef}
            tabIndex={-1}
          >
            {children(close)}
          </div>
        </>
      ) : null}
    </span>
  );
}

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
  return (
    <Popover
      role="dialog"
      label="Filters"
      panelClass="ls-filterpanel"
      trigger={({ open, toggle, controls }) => (
        <Button variant="outline" size="sm" aria-expanded={open} aria-controls={controls} onClick={toggle}>
          <Icon name="SlidersHorizontal" size={14} />
          Filter
          {count > 0 ? <span className="ls-toolbar__n">{count}</span> : null}
        </Button>
      )}
    >
      {(close) => (
        <>
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
            <Button variant="gold" size="sm" onClick={close}>
              Show {resultCount} {noun}
            </Button>
          </div>
        </>
      )}
    </Popover>
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
  return (
    /* It claimed to be a listbox and behaved like a toolbar: no accessible
       name, no aria-activedescendant, no arrow keys, and Tab walking the
       options — which is exactly what a menu of buttons is, and nothing like
       what a reader is promised when it hears "listbox". It says what it is
       now. Each option is a menuitemradio, because picking one is choosing
       among mutually exclusive sorts rather than selecting an item; the panel
       names itself so the reader knows what the choice is about.

       Renaming it was only half the fix and left the worse half standing: the
       new name promises arrow keys by name where the old one merely promised
       them by convention, and Tab still walked the options. Popover serves
       them now — roving tabindex, Up/Down wrapping, Home/End — for every
       panel that says role="menu". */
    <Popover
      role="menu"
      label="Sort by"
      panelClass="ls-sortmenu"
      trigger={({ open, toggle, controls }) => (
        <Button
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={controls}
          aria-haspopup="menu"
          onClick={toggle}
        >
          <Icon name="ArrowUpDown" size={14} />
          {label ?? "Sort"}
        </Button>
      )}
    >
      {(close) => options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="menuitemradio"
          aria-checked={o.id === value}
          className={cx("ls-sortmenu__opt", o.id === value && "ls-sortmenu__opt--on")}
          onClick={() => {
            onPick(o.id);
            close();
          }}
        >
          {o.label}
          {o.id === value ? <Icon name="Check" size={14} /> : null}
        </button>
      ))}
    </Popover>
  );
}
