import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, IconButton, LinkButton, TextButton } from "../actions";

/* `pending` is the state 284 call sites were spelling as `disabled={pending}`,
   which tells a reader the control is not available rather than that their
   action is under way. What the state owes: aria-busy, no second submission,
   and — this is the part a class-name test would miss — an accessible name
   that is still there and now says what is happening.

   The four button components have drifted from each other before (LinkButton
   had no pending at all, Button had no disabled modifier), so all four are
   held to the same contract here. */

describe("Button pending", () => {
  it("marks itself busy", () => {
    render(<Button pending>Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("is not busy at rest", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });

  it("refuses a second press while the first is in flight", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        Save
      </Button>
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("swaps the label for pendingLabel, and keeps exactly one accessible name", () => {
    const { rerender } = render(
      <Button pendingLabel="Saving…">Save</Button>
    );
    /* At rest the button is named for the action. The pending copy is in the
       DOM — its width is what stops the row jumping — but out of the tree. */
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    rerender(<Button pending pendingLabel="Saving…">Save</Button>);
    /* In flight the name is the pending copy, and the resting copy is now the
       hidden one. A button that announced "Save Saving…" would be a button
       whose name got longer every time it was pressed. */
    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("keeps its name when no pendingLabel is given", () => {
    render(
      <Button pending>Save</Button>
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("holds both copies in the DOM at rest, so the control does not resize", () => {
    render(<Button pendingLabel="Saving…">Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("Save");
    expect(btn).toHaveTextContent("Saving…");
  });
});

describe("IconButton pending", () => {
  it("marks itself busy and replaces its name", () => {
    render(
      <IconButton pending label="Save" pendingLabel="Saving">
        <span aria-hidden="true">◆</span>
      </IconButton>
    );
    const btn = screen.getByRole("button", { name: "Saving" });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).not.toBeDisabled();
  });

  it("keeps its own label when no pendingLabel is given", () => {
    render(
      <IconButton pending label="Save">
        <span aria-hidden="true">◆</span>
      </IconButton>
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "true");
  });
});

describe("TextButton pending", () => {
  it("marks itself busy and refuses the press", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TextButton pending pendingLabel="Sending…" onClick={onClick}>
        Send
      </TextButton>
    );
    const btn = screen.getByRole("button", { name: "Sending…" });
    expect(btn).toHaveAttribute("aria-busy", "true");
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

/* An anchor has no `disabled` attribute, so LinkButton has to carry the state
   itself — and it is the component that shipped without `pending` at all,
   which is why call sites reached for `disabled` and told readers the
   destination was unavailable rather than busy. */
describe("LinkButton pending", () => {
  it("marks itself busy, out of the tab order, and named for what is happening", () => {
    render(
      <LinkButton href="/book" pending pendingLabel="Holding your pass…">
        Book a pass
      </LinkButton>
    );
    const link = screen.getByRole("link", { name: "Holding your pass…" });
    expect(link).toHaveAttribute("aria-busy", "true");
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabindex", "-1");
  });

  it("refuses the navigation rather than leaving it to the cascade", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <LinkButton href="https://example.com/book" pending onClick={onClick}>
        Book a pass
      </LinkButton>
    );
    await user.click(screen.getByRole("link"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps the href, so the destination stays discoverable", () => {
    render(
      <LinkButton href="https://example.com/book" pending>
        Book a pass
      </LinkButton>
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.com/book");
  });

  it("is an ordinary link at rest", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((e: React.MouseEvent) => e.preventDefault());
    render(
      <LinkButton href="https://example.com/book" onClick={onClick}>
        Book a pass
      </LinkButton>
    );
    const link = screen.getByRole("link", { name: "Book a pass" });
    expect(link).not.toHaveAttribute("aria-busy");
    expect(link).not.toHaveAttribute("aria-disabled");
    await user.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("disabled is not pending", () => {
  it("a disabled button says nothing about being busy", () => {
    render(<Button disabled>Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).not.toHaveAttribute("aria-busy");
  });
});

/* THE REGRESSION THIS FILE EXISTS FOR, second time around.

   The first remediation gave the three button components `pending` and then
   spelled it `disabled={disabled || pending}` — which is the same defect it
   was fixing, one level down. A control carrying the HTML `disabled` attribute
   is dropped from the accessibility tree in several assistive technologies, so
   the aria-busy and the swapped pendingLabel that the whole state exists to
   announce were announced to nobody; and the attribute lands on the control
   UNDER THE FINGER THAT PRESSED IT, which drops focus and takes the button out
   of the tab order until the server answers.

   So the contract is: while pending, a button STAYS in the tree, STAYS
   focusable, is aria-disabled and aria-busy, and refuses the press in JS —
   including the form submission the attribute used to refuse natively. Each
   of the three is held to all of it, because they have drifted before. */
describe("pending is announced, not hidden", () => {
  const each = [
    ["Button", (p: { pending?: boolean; onClick?: () => void }) => <Button {...p}>Save</Button>],
    ["TextButton", (p: { pending?: boolean; onClick?: () => void }) => <TextButton {...p}>Save</TextButton>],
    ["IconButton", (p: { pending?: boolean; onClick?: () => void }) => (
      <IconButton label="Save" {...p}><span aria-hidden="true">◆</span></IconButton>
    )],
  ] as const;

  for (const [name, Render] of each) {
    it(`${name} keeps its accessible name and exposes aria-busy while in flight`, () => {
      render(Render({ pending: true }));
      /* getByRole with a name is the assertion: a control the tree has dropped
         cannot be found by role at all, and one whose name went missing cannot
         be found by name. Both halves fail loudly if `disabled` comes back. */
      const el = screen.getByRole("button", { name: "Save" });
      expect(el).toHaveAttribute("aria-busy", "true");
      expect(el).toHaveAttribute("aria-disabled", "true");
      expect(el).not.toBeDisabled();
    });

    it(`${name} stays focusable while in flight`, () => {
      render(Render({ pending: true }));
      const el = screen.getByRole("button", { name: "Save" });
      el.focus();
      expect(el).toHaveFocus();
    });
  }
});

/* `disabled` was refusing the FORM SUBMIT natively, and that is the half a
   handler-only guard drops on the floor: these are submit buttons, and a
   pending Save that stopped calling its own onClick while still posting the
   form twice would be worse than no guard at all. */
describe("pending refuses the submit, not just the handler", () => {
  it("a pending submit button does not submit its form a second time", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" pending pendingLabel="Saving…">Save</Button>
      </form>
    );
    await user.click(screen.getByRole("button", { name: "Saving…" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("but submits normally at rest", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Save</Button>
      </form>
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

/* TextButton swapped its label outright where Button lays both copies in one
   grid cell, so a pending TextButton was as wide as whichever word was
   showing — and a TextButton lives in running copy, where that is the
   sentence reflowing under the reader. */
describe("TextButton reserves its width", () => {
  /* The copy is the kit's own example of a TextButton and is deliberately
     multi-word: the icons gate reads any quoted PascalCase word in this
     directory as a glyph reference, and a one-word label like "Send" is also
     the name of a Lucide icon. */
  it("holds both copies in the DOM at rest, and names exactly one of them", () => {
    const { rerender } = render(<TextButton pendingLabel="Resending…">Resend the code</TextButton>);
    const btn = screen.getByRole("button", { name: "Resend the code" });
    expect(btn).toHaveTextContent("Resend the code");
    expect(btn).toHaveTextContent("Resending…");

    rerender(<TextButton pending pendingLabel="Resending…">Resend the code</TextButton>);
    expect(screen.getByRole("button", { name: "Resending…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend the code" })).toBeNull();
  });
});
