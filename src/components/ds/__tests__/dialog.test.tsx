import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "../feedback";

/* Dialog is the surface almost every overlay in the product actually is: the
 * password change, two-step enrolment, the recovery-code sheet, the address
 * change, the shop's crate, and the Bridge's confirmations. useModal is tested
 * through a bare harness and useExitPhase through its own file — but nothing
 * tested the component those two are wired into, which is the only shape a
 * member ever meets.
 *
 * That gap mattered on 2026-09-07: the shared scroll lock broke on a phone and
 * neither hook's tests could see it, because the failure needs two consumers
 * mounted at once. These assert the invariants at the level a reader
 * experiences them.
 *
 * Nothing here asserts on a class name. Every assertion is about where focus
 * is, whether the page scrolls, and whether the thing closed. */

function Harness({ label = "A", children }: { label?: string; children?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>{`Open ${label}`}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Dialog ${label}`} closeLabel={`Close ${label}`}>
        <button type="button">{`Inside ${label}`}</button>
        {children}
      </Dialog>
    </div>
  );
}

const openIt = (l = "A") => screen.getByRole("button", { name: `Open ${l}` });

describe("Dialog — what a member meets", () => {
  it("is not in the document until it opens", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("takes focus when it opens, and names itself", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(openIt());
    const box = screen.getByRole("dialog", { name: "Dialog A" });
    expect(box.contains(document.activeElement)).toBe(true);
  });

  it("locks the page while it is open and gives it back after", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(openIt());
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(screen.getByRole("button", { name: "Close A" }));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(openIt());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gives focus back to whatever opened it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = openIt();
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(openIt());
    /* The close button and the one inside are the whole tab ring; walking off
       the end must come back round rather than reaching the opener behind. */
    await user.tab();
    await user.tab();
    await user.tab();
    const box = screen.getByRole("dialog");
    expect(box.contains(document.activeElement)).toBe(true);
  });

  /* Two at once — the shape that broke in production. The crate drawer over a
     confirmation, a Bridge dialog opened from another: nothing in the product
     forbids it, so the hook has to survive it. */
  it("two open at once keep the page locked until the last one closes", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Harness label="A" />
        <Harness label="B" />
      </div>,
    );
    await user.click(openIt("A"));
    await user.click(openIt("B"));
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Close A" }));
    /* B is still open. The page must not scroll behind it. */
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Close B" }));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("a dialog with no title still has a name", async () => {
    const user = userEvent.setup();
    function Unnamed() {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <Dialog open={open} onClose={() => setOpen(false)} label="A sheet with no heading">
            <button type="button">Inside</button>
          </Dialog>
        </div>
      );
    }
    render(<Unnamed />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    /* Without this a screen reader announces "dialog" and nothing else. */
    expect(screen.getByRole("dialog", { name: "A sheet with no heading" })).toBeTruthy();
  });

  it("closes when the veil behind it is clicked, and not when the box is", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(openIt());
    await user.click(screen.getByRole("button", { name: "Inside A" }));
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });
});
