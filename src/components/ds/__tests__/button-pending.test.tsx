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
    expect(btn).toBeDisabled();
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
