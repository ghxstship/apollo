import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterPills } from "../filters";
import type { FilterOption } from "../filters";

/* A filter axis is a question with an answer set, and the pills are its
   controls. What matters is that they are reachable controls (Tag's press used
   to be a role="button" span with a real button nested inside it — a control
   in a control, which maps to nothing), that each says whether it is chosen,
   that the group says which question they answer, and that multi mode toggles
   rather than latches.

   Selection is asserted through aria-pressed, which is what a screen reader
   reads, not through the active class. */

const OPTIONS: FilterOption[] = [
  { id: "afloat", label: "Afloat", count: 12 },
  { id: "ashore", label: "Ashore", count: 4 },
  { id: "none", label: "Nothing here", count: 0, disabled: true },
];

function Single({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = React.useState("all");
  return (
    <FilterPills
      label="Setting"
      options={OPTIONS}
      allCount={16}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

function Multi({ onChange }: { onChange?: (v: string[]) => void }) {
  const [value, setValue] = React.useState<string[]>([]);
  return (
    <FilterPills
      label="Setting"
      options={OPTIONS}
      multi
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const pill = (name: string | RegExp) => screen.getByRole("button", { name });
const chosen = () =>
  screen
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent?.replace(/\d+$/, "").trim());

describe("FilterPills", () => {
  it("names the axis, so a reader knows which question the pills answer", () => {
    render(<Single />);
    expect(screen.getByRole("group", { name: "Setting" })).toBeInTheDocument();
  });

  it("renders every value as a real, reachable control", () => {
    render(<Single />);
    expect(pill(/^All/)).toBeInTheDocument();
    expect(pill(/^Afloat/)).toBeInTheDocument();
    expect(pill(/^Ashore/)).toBeInTheDocument();
  });

  it("shows the count each value would leave", () => {
    render(<Single />);
    expect(pill(/^All/)).toHaveTextContent("16");
    expect(pill(/^Afloat/)).toHaveTextContent("12");
  });

  it("keeps a value with nothing behind it in the row, but not choosable", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Single onChange={onChange} />);
    const dead = pill(/^Nothing here/);
    expect(dead).toBeDisabled();
    await user.click(dead);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("FilterPills, one value at a time", () => {
  it("starts on All and moves the selection to whatever is pressed", async () => {
    const user = userEvent.setup();
    render(<Single />);
    expect(chosen()).toEqual(["All"]);
    await user.click(pill(/^Afloat/));
    expect(chosen()).toEqual(["Afloat"]);
    await user.click(pill(/^Ashore/));
    expect(chosen()).toEqual(["Ashore"]);
  });

  it("goes back to All when All is pressed", async () => {
    const user = userEvent.setup();
    render(<Single />);
    await user.click(pill(/^Afloat/));
    await user.click(pill(/^All/));
    expect(chosen()).toEqual(["All"]);
  });
});

describe("FilterPills, multi", () => {
  it("toggles a value ON and then OFF again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Multi onChange={onChange} />);

    await user.click(pill(/^Afloat/));
    expect(onChange).toHaveBeenLastCalledWith(["afloat"]);
    expect(chosen()).toEqual(["Afloat"]);

    /* The same pill again REMOVES it — the thing single mode cannot do, and
       the reason the two modes are separate prop shapes. */
    await user.click(pill(/^Afloat/));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(chosen()).toEqual(["All"]);
  });

  it("accumulates values rather than replacing them", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Multi onChange={onChange} />);
    await user.click(pill(/^Afloat/));
    await user.click(pill(/^Ashore/));
    expect(onChange).toHaveBeenLastCalledWith(["afloat", "ashore"]);
    expect(chosen()).toEqual(["Afloat", "Ashore"]);
  });

  it("removes only the value pressed, leaving the rest of the set", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Multi onChange={onChange} />);
    await user.click(pill(/^Afloat/));
    await user.click(pill(/^Ashore/));
    await user.click(pill(/^Afloat/));
    expect(onChange).toHaveBeenLastCalledWith(["ashore"]);
    expect(chosen()).toEqual(["Ashore"]);
  });

  it("All clears the whole selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Multi onChange={onChange} />);
    await user.click(pill(/^Afloat/));
    await user.click(pill(/^Ashore/));
    await user.click(pill(/^All/));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(chosen()).toEqual(["All"]);
  });

  it("marks All chosen exactly while the set is empty", async () => {
    const user = userEvent.setup();
    render(<Multi />);
    expect(pill(/^All/)).toHaveAttribute("aria-pressed", "true");
    await user.click(pill(/^Afloat/));
    expect(pill(/^All/)).toHaveAttribute("aria-pressed", "false");
  });
});

describe("FilterPills without an All pill", () => {
  it("drops it when allLabel is null", () => {
    render(
      <FilterPills label="Setting" options={OPTIONS} allLabel={null} value="afloat" onChange={() => {}} />
    );
    expect(screen.queryByRole("button", { name: /^All/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Afloat/ })).toHaveAttribute("aria-pressed", "true");
  });
});
