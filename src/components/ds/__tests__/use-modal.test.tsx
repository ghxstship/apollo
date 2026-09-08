import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useModal } from "../use-modal";

/* The hook's own comment says what it owes the keyboard and then says the
   thing that made this file necessary: "Hand-verified in a real browser on
   2026-08-24 … NOT verified by anything, by hand or otherwise: that a later
   edit to this file preserves any of the above. A regression here breaks four
   surfaces at once — including the two on the checkout path."

   This is that verification, automated. It exercises the hook through a
   harness rather than through Dialog, because the option under test
   (`{ modal: false, trapTab: true }` — the Producer's combination) has no
   consumer in the kit's own components, and because a harness makes the
   opener/close cycle explicit.

   Nothing here asserts on a class name or on markup: the surface is a div with
   three buttons, and every assertion is about where focus is, whether the page
   scrolls, and whether the close callback ran. */

function Harness({
  modal,
  trapTab,
  onClose,
  extra,
}: {
  modal?: boolean;
  trapTab?: boolean;
  onClose?: () => void;
  /** An element rendered outside the surface, to prove Tab cannot reach it. */
  extra?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const close = () => {
    onClose?.();
    setOpen(false);
  };
  const boxRef = useModal(open, close, { modal, trapTab });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open the sheet
      </button>
      {extra ? (
        <button type="button">Behind the veil</button>
      ) : null}
      {open ? (
        <div ref={boxRef} tabIndex={-1} role="dialog" aria-label="The sheet">
          <button type="button">First</button>
          <button type="button">Middle</button>
          <button type="button">Last</button>
        </div>
      ) : null}
    </div>
  );
}

const opener = () => screen.getByRole("button", { name: "Open the sheet" });
const surface = () => screen.getByRole("dialog", { name: "The sheet" });

describe("useModal", () => {
  it("moves focus into the surface when it opens", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(opener());
    expect(surface()).toHaveFocus();
  });

  it("wraps Tab forward from the last control to the first", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(opener());
    screen.getByRole("button", { name: "Last" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("wraps Shift+Tab backward from the first control to the last", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(opener());
    screen.getByRole("button", { name: "First" }).focus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
  });

  it("wraps Shift+Tab from the surface itself, which is where focus lands on open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(opener());
    expect(surface()).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
  });

  it("does not let Tab walk out into the page behind it", async () => {
    const user = userEvent.setup();
    render(<Harness extra />);
    await user.click(opener());
    /* Four Tabs from the surface: First, Middle, Last, then round to First
       again. If the trap leaked, one of them would land on the opener or on
       the button behind the veil. */
    for (let i = 0; i < 4; i++) await user.tab();
    expect(surface().contains(document.activeElement)).toBe(true);
    expect(screen.getByRole("button", { name: "Behind the veil" })).not.toHaveFocus();
    expect(opener()).not.toHaveFocus();
  });

  it("closes on Escape, from anywhere on the page", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.click(opener());
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gives focus back to the opener when it goes away", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(opener());
    expect(surface()).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(opener()).toHaveFocus();
  });

  it("locks the page's scroll while it is open and gives it back", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(document.body.style.overflow).not.toBe("hidden");
    await user.click(opener());
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("useModal({ modal: false })", () => {
  it("leaves the page scrolling", async () => {
    const user = userEvent.setup();
    render(<Harness modal={false} />);
    await user.click(opener());
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("does not trap Tab — a reader can walk out into the page", async () => {
    const user = userEvent.setup();
    render(<Harness modal={false} extra />);
    await user.click(opener());
    screen.getByRole("button", { name: "Last" }).focus();
    await user.tab();
    expect(surface().contains(document.activeElement)).toBe(false);
  });

  it("still closes on Escape and still restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness modal={false} onClose={onClose} />);
    await user.click(opener());
    expect(surface()).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(opener()).toHaveFocus();
  });
});

/* The Producer's combination, and the reason `trapTab` is separable from
   `modal` at all: a panel the member deliberately opened over a page that must
   keep scrolling, where the next Tab never means "out the back into the page".
   Nothing in ds/ passes this pair, so without a test it is the option most
   likely to be quietly dropped by a later edit to the hook. */
describe("useModal({ modal: false, trapTab: true }) — the Producer's pair", () => {
  it("traps Tab", async () => {
    const user = userEvent.setup();
    render(<Harness modal={false} trapTab extra />);
    await user.click(opener());
    screen.getByRole("button", { name: "Last" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("but does not lock the page's scroll", async () => {
    const user = userEvent.setup();
    render(<Harness modal={false} trapTab />);
    await user.click(opener());
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

/* TWO SURFACES AT ONCE, which is the case that actually broke.
 *
 * Every test above opens one thing. The hook was correct for one thing. On
 * 2026-09-07 a reader on a phone found the page would not scroll and nothing
 * was open to close: the search and the mobile menu both lock the page, both
 * remembered body.style.overflow for themselves, and closing them in the order
 * a person naturally does left the remembered "hidden" behind.
 *
 *   open A  -> A remembers "",       sets hidden
 *   open B  -> B remembers "hidden", sets hidden
 *   close A -> A puts back "",       the page scrolls while B is still open
 *   close B -> B puts back "hidden", the page never scrolls again
 *
 * Two failures in that sequence, and the second is the one the reader meets.
 * The lock is counted now; these assert both halves, because a fix that only
 * stopped the leak at the end would still let the page scroll behind an open
 * overlay. */
function Pair() {
  const [a, setA] = React.useState(false);
  const [b, setB] = React.useState(false);
  const aRef = useModal(a, () => setA(false));
  const bRef = useModal(b, () => setB(false));
  return (
    <div>
      <button type="button" onClick={() => setA(true)}>Open A</button>
      <button type="button" onClick={() => setB(true)}>Open B</button>
      {a ? (
        <div ref={aRef} role="dialog" aria-modal="true" aria-label="A" tabIndex={-1}>
          <button type="button" onClick={() => setA(false)}>Close A</button>
        </div>
      ) : null}
      {b ? (
        <div ref={bRef} role="dialog" aria-modal="true" aria-label="B" tabIndex={-1}>
          <button type="button" onClick={() => setB(false)}>Close B</button>
        </div>
      ) : null}
    </div>
  );
}

describe("two modal surfaces open at once", () => {
  it("keeps the page locked while either is still open", async () => {
    const user = userEvent.setup();
    render(<Pair />);
    await user.click(screen.getByRole("button", { name: "Open A" }));
    await user.click(screen.getByRole("button", { name: "Open B" }));
    expect(document.body.style.overflow).toBe("hidden");

    /* A closes first. B is still open, so the page must stay locked — the old
       save-and-restore unlocked here, letting the page scroll behind B. */
    await user.click(screen.getByRole("button", { name: "Close A" }));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("gives the page back when the last one closes", async () => {
    const user = userEvent.setup();
    render(<Pair />);
    await user.click(screen.getByRole("button", { name: "Open A" }));
    await user.click(screen.getByRole("button", { name: "Open B" }));
    await user.click(screen.getByRole("button", { name: "Close A" }));
    await user.click(screen.getByRole("button", { name: "Close B" }));
    /* The failure a reader actually meets: nothing open, and a dead page. */
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("gives it back whichever order they close in", async () => {
    const user = userEvent.setup();
    render(<Pair />);
    await user.click(screen.getByRole("button", { name: "Open A" }));
    await user.click(screen.getByRole("button", { name: "Open B" }));
    await user.click(screen.getByRole("button", { name: "Close B" }));
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(screen.getByRole("button", { name: "Close A" }));
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
