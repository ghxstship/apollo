import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox, Switch } from "../forms";
import { Tag } from "../display";

/* `pending` reached the four button components and stopped there, so every
   in-flight TOGGLE in the product still wore the disabled fade: push
   notifications, both consents, the pass extras, the crew roster and the
   vetting sheet all told the reader "you cannot do this" at the moment they
   were doing it.

   The contract is the buttons': busy is not unavailable. While pending a
   toggle STAYS in the accessibility tree, STAYS focusable, carries aria-busy
   and aria-disabled, and refuses the change — never the HTML `disabled`
   attribute, which drops the control out of the tree in several assistive
   technologies and out of the tab order under the finger that just used it. */

const CASES = [
  ["Switch", "switch"] as const,
  ["Checkbox", "checkbox"] as const,
];

function Render({ which, pending, onChange }: { which: string; pending?: boolean; onChange?: () => void }) {
  return which === "Switch"
    ? <Switch label="Alerts" pending={pending} checked={false} onChange={onChange} />
    : <Checkbox label="Alerts" pending={pending} checked={false} onChange={onChange} />;
}

describe.each(CASES)("%s pending", (which, role) => {
  it("stays in the tree, named, and says it is busy", () => {
    render(<Render which={which} pending />);
    const el = screen.getByRole(role, { name: "Alerts" });
    expect(el).toHaveAttribute("aria-busy", "true");
    expect(el).toHaveAttribute("aria-disabled", "true");
    expect(el).not.toBeDisabled();
  });

  it("stays focusable", () => {
    render(<Render which={which} pending />);
    const el = screen.getByRole(role, { name: "Alerts" });
    el.focus();
    expect(el).toHaveFocus();
  });

  it("refuses the change while in flight", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Render which={which} pending onChange={onChange} />);
    await user.click(screen.getByRole(role, { name: "Alerts" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("takes the change at rest", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Render which={which} onChange={onChange} />);
    await user.click(screen.getByRole(role, { name: "Alerts" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("says nothing about being busy at rest", () => {
    render(<Render which={which} />);
    expect(screen.getByRole(role, { name: "Alerts" })).not.toHaveAttribute("aria-busy");
  });
});

/* Tag is the one the vetting sheet presses: `disabled={pending}` there meant
   picking a stance disabled the control under the finger and took the whole
   axis out of the tab order until the server answered. */
describe("Tag pending", () => {
  it("stays pressable-looking, focusable, and busy", () => {
    render(<Tag pending onClick={() => {}}>Fine by me</Tag>);
    const el = screen.getByRole("button", { name: "Fine by me" });
    expect(el).toHaveAttribute("aria-busy", "true");
    expect(el).toHaveAttribute("aria-disabled", "true");
    expect(el).not.toBeDisabled();
    el.focus();
    expect(el).toHaveFocus();
  });

  it("refuses the press while in flight", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Tag pending onClick={onClick}>Fine by me</Tag>);
    await user.click(screen.getByRole("button", { name: "Fine by me" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps aria-pressed, so the stance already chosen is still readable", () => {
    render(<Tag pending active onClick={() => {}}>Fine by me</Tag>);
    expect(screen.getByRole("button", { name: "Fine by me" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is an ordinary press at rest", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Tag onClick={onClick}>Fine by me</Tag>);
    const el = screen.getByRole("button", { name: "Fine by me" });
    expect(el).not.toHaveAttribute("aria-busy");
    await user.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  /* `disabled` and `pending` are different states and must never compose into
     a control that reads as both — buttonClass has enforced that for the
     button family since the class helper was extracted. */
  it("wears the busy face rather than the unavailable one", () => {
    const { container } = render(<Tag pending disabled onClick={() => {}}>Fine by me</Tag>);
    const pill = container.querySelector(".ls-tag");
    expect(pill).toHaveClass("ls-tag--pending");
    expect(pill).not.toHaveClass("ls-tag--disabled");
  });
});
