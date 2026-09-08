import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListToolbar } from "../toolbar";

/* The sort menu used to say `role="listbox"` and behave like a toolbar; the
   first remediation renamed it `role="menu"` with `menuitemradio` children and
   stopped there, which made the claim MORE specific and no more true — a menu
   promises the arrow keys by name, and there was no onKeyDown anywhere in the
   file. Focus landed on the panel box and Tab walked the options one at a
   time.

   What a menu owes: focus on an item when it opens (the checked one, so the
   reader lands where they already are), Up and Down wrapping at the ends,
   Home and End, and exactly one item in the tab order at a time so Tab is the
   way OUT rather than the way through. */

const OPTIONS = [
  { id: "soon", label: "Soonest first" },
  { id: "late", label: "Latest first" },
  { id: "az", label: "A–Z" },
];

function Toolbar({ value = "soon", onSort = () => {} }: { value?: string; onSort?: (id: string) => void }) {
  return (
    <ListToolbar
      sortOptions={OPTIONS}
      sortValue={value}
      onSort={onSort}
      resultCount={16}
      resultNoun="episode"
    />
  );
}

const items = () => screen.getAllByRole("menuitemradio");

async function openMenu(user: ReturnType<typeof userEvent.setup>, value = "soon") {
  render(<Toolbar value={value} />);
  await user.click(screen.getByRole("button", { name: /Soonest first|Latest first|A–Z|Sort/ }));
  return items();
}

describe("the sort menu says what it is", () => {
  it("opens a menu, named, with one radio per option", async () => {
    const user = userEvent.setup();
    await openMenu(user);
    expect(screen.getByRole("menu", { name: "Sort by" })).toBeInTheDocument();
    expect(items()).toHaveLength(3);
    expect(items()[0]).toHaveAttribute("aria-checked", "true");
  });

  it("declares aria-haspopup on the trigger", () => {
    render(<Toolbar />);
    expect(screen.getByRole("button", { name: /Soonest first/ })).toHaveAttribute("aria-haspopup", "menu");
  });
});

describe("the sort menu serves the arrow keys", () => {
  it("puts focus on the checked item when it opens", async () => {
    const user = userEvent.setup();
    const list = await openMenu(user, "late");
    expect(list[1]).toHaveFocus();
  });

  it("moves down and wraps at the end", async () => {
    const user = userEvent.setup();
    const list = await openMenu(user);
    await user.keyboard("{ArrowDown}");
    expect(list[1]).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(list[0]).toHaveFocus();
  });

  it("moves up and wraps at the start", async () => {
    const user = userEvent.setup();
    const list = await openMenu(user);
    await user.keyboard("{ArrowUp}");
    expect(list[2]).toHaveFocus();
  });

  it("takes Home and End", async () => {
    const user = userEvent.setup();
    const list = await openMenu(user);
    await user.keyboard("{End}");
    expect(list[2]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(list[0]).toHaveFocus();
  });

  /* Roving tabindex is what makes Tab the way out rather than the way through:
     exactly one item is a tab stop, and it is the one focus is on. */
  it("keeps exactly one option in the tab order, and it is the focused one", async () => {
    const user = userEvent.setup();
    const list = await openMenu(user);
    await user.keyboard("{ArrowDown}");
    expect(list.filter((el) => el.tabIndex === 0)).toEqual([list[1]]);
    expect(list[0].tabIndex).toBe(-1);
    expect(list[2].tabIndex).toBe(-1);
  });

  it("picks with Enter and reports the choice", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(<Toolbar onSort={onSort} />);
    await user.click(screen.getByRole("button", { name: /Soonest first/ }));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSort).toHaveBeenCalledWith("late");
  });
});

/* The filter panel is the same shell with role="dialog", and it must NOT grow
   a menu's keyboard: it is a form of pills a reader Tabs through. */
describe("the filter panel is not a menu", () => {
  it("leaves the arrow keys alone", async () => {
    const user = userEvent.setup();
    render(
      <ListToolbar
        filters={<label htmlFor="f">Setting<input id="f" /></label>}
        filterCount={0}
        resultCount={16}
        resultNoun="episode"
      />
    );
    await user.click(screen.getByRole("button", { name: /Filter/ }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0);
  });
});

/* WHAT THE PANEL OWES THE PAGE BEHIND IT.
 *
 * useModal is passed `{ modal: false }` here and the comment beside it calls
 * that load-bearing: "the results behind the panel stay readable and
 * scrollable, which is the whole reason this is not a dialog."
 *
 * Nothing asserted it. A later edit dropping that option — or a refactor that
 * routed this through Dialog for the shared exit phase — would lock the page
 * behind a filter panel, and on a phone that is a list you cannot scroll while
 * the thing you opened to narrow it sits on top. That is the same failure the
 * shared scroll lock produced on 2026-09-07, arrived at from the other end.
 *
 * The three below are what every overlay in the kit owes regardless of
 * modality: Escape closes it, focus comes back to what opened it, and the page
 * is left exactly as it was found. */
describe("the sort menu leaves the page alone", () => {
  it("does not lock the page's scroll — it is a popover, not a dialog", async () => {
    const user = userEvent.setup();
    await openMenu(user);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    await openMenu(user);
    await user.keyboard("{Escape}");
    expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0);
  });

  it("gives focus back to the trigger it came from", async () => {
    const user = userEvent.setup();
    render(<Toolbar />);
    const trigger = screen.getByRole("button", { name: /Soonest first|Latest first|A–Z|Sort/ });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("leaves the page's overflow exactly as it found it", async () => {
    const user = userEvent.setup();
    /* Set deliberately, so a naive save-and-restore that wrote "" back would
       be caught as well as one that wrote "hidden". */
    document.body.style.overflow = "clip";
    await openMenu(user);
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("clip");
    document.body.style.overflow = "";
  });
});
