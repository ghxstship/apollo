import type React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Checkbox, Input, Select, Textarea } from "../forms";

/* The H5 regression test.

   Every field in the kit computed `aria-describedby` from its own error and
   hint ids and then spread `{...rest}` AFTER the attribute, so a caller who
   described the field themselves — the gangway's code field, the search
   slate's combobox — silently replaced the association and the error message
   went back to being invisible to a screen reader.

   These tests are written to fail against that. The merge case asserts that
   the caller's id and the computed id are BOTH there: a field that clobbers
   still passes "the caller's description is present" and fails "and so is the
   error", which is exactly the distinction the fix is about.

   The ids themselves are the component's business (they come from useId), so
   nothing here asserts their shape. What is asserted is the association:
   follow the described-by ids to elements and read what a screen reader would
   read. */

/** The text a screen reader would reach by following `aria-describedby`. */
function describedText(el: Element): string[] {
  const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? `«dangling id ${id}»`);
}

type Extra = Record<string, unknown>;

const CASES = [
  {
    name: "Input",
    label: "Boarding code",
    hint: "Six characters, no spaces.",
    error: "That code has lapsed.",
    render: (p: Extra) => <Input label="Boarding code" {...p} />,
  },
  {
    name: "Textarea",
    label: "Word to Shoreside",
    hint: "Keep it short.",
    error: "Say something first.",
    render: (p: Extra) => <Textarea label="Word to Shoreside" {...p} />,
  },
  {
    name: "Select",
    label: "Series",
    hint: "Pick one.",
    error: "Pick a series.",
    render: (p: Extra) => <Select label="Series" options={[{ value: "a", label: "A" }]} {...p} />,
  },
] as const;

describe.each(CASES)("$name", ({ label, hint, error, render: renderField }) => {
  it("associates its hint", () => {
    render(renderField({ hint }));
    expect(describedText(screen.getByLabelText(label))).toEqual([hint]);
  });

  it("associates its error and marks the control invalid", () => {
    render(renderField({ hint, error }));
    const field = screen.getByLabelText(label);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(describedText(field)).toEqual([error]);
  });

  it("MERGES a caller's aria-describedby rather than dropping the error", () => {
    render(
      <>
        <p id="caller-note">Charged to your account.</p>
        {renderField({ hint, error, "aria-describedby": "caller-note" })}
      </>
    );
    const said = describedText(screen.getByLabelText(label));
    /* The caller's own description survives … */
    expect(said).toContain("Charged to your account.");
    /* … and so does the field's error. This is the assertion that failed
       before the fix: `rest` was spread last and won outright. */
    expect(said).toContain(error);
  });

  it("keeps a caller's aria-describedby when the field has nothing of its own to say", () => {
    render(
      <>
        <p id="caller-note">Charged to your account.</p>
        {renderField({ "aria-describedby": "caller-note" })}
      </>
    );
    expect(describedText(screen.getByLabelText(label))).toEqual(["Charged to your account."]);
  });

  it("describes nothing when there is nothing to describe", () => {
    render(renderField({}));
    expect(screen.getByLabelText(label)).not.toHaveAttribute("aria-describedby");
  });
});

describe("Checkbox", () => {
  it("associates its error and merges a caller's description", () => {
    render(
      <>
        <p id="terms-note">The full terms are on the agreement page.</p>
        <Checkbox label="I agree" error="You have to agree to go on." aria-describedby="terms-note" />
      </>
    );
    const box = screen.getByLabelText(/I agree/);
    expect(box).toHaveAttribute("aria-invalid", "true");
    const said = describedText(box);
    expect(said).toContain("The full terms are on the agreement page.");
    expect(said.some((t) => t.includes("agree to go on"))).toBe(true);
  });
});

describe("the error message", () => {
  it("announces itself when it appears", () => {
    render(<Input label="Boarding code" error="That code has lapsed." />);
    expect(screen.getByRole("alert")).toHaveTextContent("That code has lapsed.");
  });

  it("replaces the hint rather than joining it, so the field is not read twice", () => {
    render(<Input label="Boarding code" hint="Six characters, no spaces." error="That code has lapsed." />);
    expect(describedText(screen.getByLabelText("Boarding code"))).toEqual(["That code has lapsed."]);
    expect(screen.queryByText("Six characters, no spaces.")).toBeNull();
  });
});

/* — proof that the assertion above has teeth —
   The regression this file exists for cannot be re-created by editing the kit
   (the fix is in), so the old shape is re-created here instead: the exact
   prop order forms.tsx used to have, with `{...rest}` spread AFTER the
   computed attribute. If the merge assertion above would pass against that,
   it is not testing anything, and this test says so. */
function LegacyInput({ error, id, ...rest }: { error: string; id: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <>
      <label htmlFor={id}>Boarding code</label>
      <input id={id} aria-describedby={`${id}-err`} {...rest} />
      <span id={`${id}-err`}>{error}</span>
    </>
  );
}

describe("the old behaviour", () => {
  it("drops the error association, and this file's assertion catches it", () => {
    render(
      <>
        <p id="caller-note">Charged to your account.</p>
        <LegacyInput id="legacy" error="That code has lapsed." aria-describedby="caller-note" />
      </>
    );
    const said = describedText(screen.getByLabelText("Boarding code"));
    expect(said).toContain("Charged to your account.");
    expect(said).not.toContain("That code has lapsed.");
  });
});
