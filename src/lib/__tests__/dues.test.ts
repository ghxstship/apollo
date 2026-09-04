import { describe, expect, it } from "vitest";
import { duesNote } from "@/lib/dues";

describe("duesNote", () => {
  it("says what happened to the dues for each act", () => {
    expect(duesNote({ kind: "changed" }, "paused")).toMatch(/stop/i);
    expect(duesNote({ kind: "changed" }, "resumed")).toMatch(/start again/i);
    expect(duesNote({ kind: "changed" }, "departed")).toMatch(/end/i);
  });
  it("says nothing when there were no dues to act on", () => {
    expect(duesNote({ kind: "nothing-to-do" }, "paused")).toBeNull();
  });
  it("names the remedy the environment can actually offer", () => {
    /* Stripe is off, so /account renders no billing-portal button; the line
       must not send a member to press it. */
    expect(duesNote({ kind: "not-wired" }, "paused")).toMatch(/NOT changed/);
    expect(duesNote({ kind: "not-wired" }, "paused")).not.toMatch(/portal/i);
    expect(duesNote({ kind: "failed", detail: "x" }, "paused")).toMatch(/NOT changed/);
    expect(duesNote({ kind: "failed", detail: "x" }, "paused")).toMatch(/portal/i);
  });
});
