import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Dialog, Toast } from "../feedback";
import { useExitPhase } from "../use-exit-phase";

/* The exit phase, tested through the two surfaces that carry it.

   A surface that unmounts the frame `open` goes false cannot leave: it is
   simply gone. Three things have to hold, and all three are invisible to a
   structural gate:

     1. `open` going false keeps the node ON THE PAGE, so the exit keyframes
        have something to run on.
     2. `animationend` ends the phase — and the safety timer ends it anyway
        when no animation event ever arrives (a tab hidden mid-exit, an
        animation the cascade removed, a browser that drops the event).
        Without the timer the surface stays mounted forever.
     3. The close callback runs exactly ONCE. It has two paths into it — the
        animation event and the safety timer — and a toast that calls its
        parent's onClose twice removes two things from a queue of one.

   jsdom runs no animations, so `animationend` never fires on its own; every
   test below either fires it by hand (the browser's path) or deliberately does
   not (the safety timer's path). That is the whole point of having both. */

const SAFETY_MS = 400;

/* Both surfaces portal into document.body, so the animating node is found by
   role/text rather than from render()'s container. */
const dialog = () => screen.queryByRole("dialog");

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/* An animationend the way the browser sends it: BUBBLING. Testing Library's
   default init for this event is `bubbles: false`, and React delegates its
   listeners at the root container, so an unbubbled one is dispatched into a
   void and the handler never runs — the test would pass or fail for reasons
   that have nothing to do with the component. Firing it on a child is
   therefore a real test of the `e.target === e.currentTarget` guard rather
   than a test of Testing Library's defaults. */
function endAnimation(el: Element) {
  act(() => {
    fireEvent.animationEnd(el, { bubbles: true });
  });
}

/** Advance the clock inside act(), the way a real timer firing would arrive. */
function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("Dialog exit", () => {
  it("stays on the page when `open` goes false, and leaves on animationend", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Confirm your pass">
        Body
      </Dialog>
    );
    expect(dialog()).not.toBeNull();

    rerender(
      <Dialog open={false} onClose={() => {}} title="Confirm your pass">
        Body
      </Dialog>
    );
    /* Still mounted: this is the frame the exit animation runs in. */
    const veil = screen.getByText("Confirm your pass").closest("[aria-hidden='true']");
    expect(veil).not.toBeNull();
    expect(screen.queryByText("Confirm your pass")).not.toBeNull();

    endAnimation(veil!);
    expect(screen.queryByText("Confirm your pass")).toBeNull();
  });

  it("hides the leaving dialog from the accessibility tree while it runs", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Confirm your pass">
        Body
      </Dialog>
    );
    expect(dialog()).not.toBeNull();
    rerender(
      <Dialog open={false} onClose={() => {}} title="Confirm your pass">
        Body
      </Dialog>
    );
    /* Visible, but no longer announced — the veil carries aria-hidden, so the
       dialog underneath it is out of the tree. */
    expect(dialog()).toBeNull();
    expect(screen.queryByText("Confirm your pass")).not.toBeNull();
  });

  it("leaves anyway when no animationend ever arrives — the safety timer", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Confirm your pass">
        Body
      </Dialog>
    );
    rerender(
      <Dialog open={false} onClose={() => {}} title="Confirm your pass">
        Body
      </Dialog>
    );
    expect(screen.queryByText("Confirm your pass")).not.toBeNull();
    tick(SAFETY_MS);
    expect(screen.queryByText("Confirm your pass")).toBeNull();
  });

  it("does not leave focus inside the subtree it has just hidden", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Confirm your pass">
        Body
      </Dialog>
    );
    const x = screen.getByRole("button", { name: "Close" });
    act(() => {
      x.focus();
    });
    expect(x).toHaveFocus();

    rerender(
      <Dialog open={false} onClose={() => {}} title="Confirm your pass">
        Body
      </Dialog>
    );
    /* The veil goes aria-hidden for the whole exit and the × is inside it, so
       for one --dur-exit a reader's focus would sit on a control in a subtree
       it had been told to ignore — the aria-hidden violation with the worst
       failure mode, because most readers say nothing at all about it. */
    expect(x).not.toHaveFocus();
    expect(screen.getByText("Confirm your pass").closest("[aria-hidden='true']")).not.toContainElement(
      document.activeElement as HTMLElement | null
    );
  });

  it("ignores an animationend bubbling up from a child", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Confirm your pass">
        <span data-testid="inner">Body</span>
      </Dialog>
    );
    rerender(
      <Dialog open={false} onClose={() => {}} title="Confirm your pass">
        <span data-testid="inner">Body</span>
      </Dialog>
    );
    endAnimation(screen.getByTestId("inner"));
    /* A child finishing first must not cut the parent's exit off. */
    expect(screen.queryByText("Confirm your pass")).not.toBeNull();
  });
});

describe("Toast exit", () => {
  const MSG = "The galley has it.";

  it("stays on the page when `open` goes false, and leaves on animationend", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Toast message={MSG} open onClose={onClose} />);
    expect(screen.getByText(MSG)).toBeInTheDocument();

    rerender(<Toast message={MSG} open={false} onClose={onClose} />);
    expect(screen.getByText(MSG)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    const node = screen.getByText(MSG).parentElement!;
    endAnimation(node);
    expect(screen.queryByText(MSG)).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose exactly once, not once per path into it", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Toast message={MSG} open onClose={onClose} />);
    rerender(<Toast message={MSG} open={false} onClose={onClose} />);
    const node = screen.getByText(MSG).parentElement!;
    endAnimation(node);
    /* The safety timer is still armed at this moment. Run the clock well past
       it: if the timer is not cleared when the animation ends, this is where
       the second call shows up. */
    tick(SAFETY_MS * 4);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on the safety timer when no animationend arrives, still once", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Toast message={MSG} open onClose={onClose} />);
    rerender(<Toast message={MSG} open={false} onClose={onClose} />);
    expect(screen.getByText(MSG)).toBeInTheDocument();
    tick(SAFETY_MS);
    expect(screen.queryByText(MSG)).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    tick(SAFETY_MS * 4);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses after `duration`, plays the exit, then calls onClose once", () => {
    const onClose = vi.fn();
    render(<Toast message={MSG} duration={4000} onClose={onClose} />);
    expect(screen.getByText(MSG)).toBeInTheDocument();

    tick(3999);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(MSG)).toBeInTheDocument();

    tick(1);
    /* The deadline starts the exit; it does not skip it. */
    expect(screen.getByText(MSG)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    const node = screen.getByText(MSG).parentElement!;
    endAnimation(node);
    expect(screen.queryByText(MSG)).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("holds indefinitely without a `duration`", () => {
    const onClose = vi.fn();
    render(<Toast message={MSG} onClose={onClose} />);
    tick(60_000);
    expect(screen.getByText(MSG)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("dismisses from the × — onDismiss at once, onClose after the exit", () => {
    const onDismiss = vi.fn();
    const onClose = vi.fn();
    render(<Toast message={MSG} onDismiss={onDismiss} onClose={onClose} dismissLabel="Dismiss" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(MSG)).toBeInTheDocument();
    tick(SAFETY_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(MSG)).toBeNull();
  });

  it("comes back when `open` returns true", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Toast message={MSG} open onClose={onClose} />);
    rerender(<Toast message={MSG} open={false} onClose={onClose} />);
    tick(SAFETY_MS);
    expect(screen.queryByText(MSG)).toBeNull();
    rerender(<Toast message={MSG} open onClose={onClose} />);
    expect(screen.getByText(MSG)).toBeInTheDocument();
  });
});

/* The hook the three copies of the phase were extracted into. Tested directly
   as well as through the surfaces, because the filter panel, the sort menu,
   the search slate and the site menu adopt it without going through either. */
function PhaseHarness({ open, safetyMs }: { open: boolean; safetyMs?: number }) {
  const { present, closing, onAnimationEnd } = useExitPhase(open, safetyMs ? { safetyMs } : undefined);
  if (!present) return <p>gone</p>;
  return (
    <div data-testid="panel" data-closing={closing ? "yes" : "no"} onAnimationEnd={onAnimationEnd}>
      <span data-testid="child">Panel</span>
    </div>
  );
}

describe("useExitPhase", () => {
  it("is present and not closing while open", () => {
    render(<PhaseHarness open />);
    expect(screen.getByTestId("panel")).toHaveAttribute("data-closing", "no");
  });

  it("stays present and turns closing on the very next render after `open` goes false", () => {
    const { rerender } = render(<PhaseHarness open />);
    rerender(<PhaseHarness open={false} />);
    expect(screen.getByTestId("panel")).toHaveAttribute("data-closing", "yes");
  });

  it("ends the phase on the element's own animationend", () => {
    const { rerender } = render(<PhaseHarness open />);
    rerender(<PhaseHarness open={false} />);
    endAnimation(screen.getByTestId("panel"));
    expect(screen.getByText("gone")).toBeInTheDocument();
  });

  it("ignores an animationend from a child", () => {
    const { rerender } = render(<PhaseHarness open />);
    rerender(<PhaseHarness open={false} />);
    endAnimation(screen.getByTestId("child"));
    expect(screen.getByTestId("panel")).toHaveAttribute("data-closing", "yes");
  });

  it("ends the phase on the safety timer when no event arrives", () => {
    const { rerender } = render(<PhaseHarness open />);
    rerender(<PhaseHarness open={false} />);
    tick(SAFETY_MS);
    expect(screen.getByText("gone")).toBeInTheDocument();
  });

  it("honours a caller's safetyMs", () => {
    const { rerender } = render(<PhaseHarness open safetyMs={1200} />);
    rerender(<PhaseHarness open={false} safetyMs={1200} />);
    tick(SAFETY_MS);
    expect(screen.getByTestId("panel")).toHaveAttribute("data-closing", "yes");
    tick(1200 - SAFETY_MS);
    expect(screen.getByText("gone")).toBeInTheDocument();
  });

  it("cancels the exit when `open` comes back before it finishes", () => {
    const { rerender } = render(<PhaseHarness open />);
    rerender(<PhaseHarness open={false} />);
    rerender(<PhaseHarness open />);
    expect(screen.getByTestId("panel")).toHaveAttribute("data-closing", "no");
    tick(SAFETY_MS * 4);
    expect(screen.getByTestId("panel")).toBeInTheDocument();
  });
});
