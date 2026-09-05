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
