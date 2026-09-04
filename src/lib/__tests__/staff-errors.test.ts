import { describe, expect, it } from "vitest";
import { ERR_LAND, ERR_STAFF, isUnanswered } from "@/lib/staff-errors";

describe("isUnanswered", () => {
  it("names the two messages that say nothing about the pass", () => {
    expect(isUnanswered(ERR_STAFF)).toBe(true);
    expect(isUnanswered(ERR_LAND)).toBe(true);
  });
  it("a real refusal is an answer", () => {
    expect(isUnanswered("Waiver outstanding. Sign it on the You page.")).toBe(false);
    expect(isUnanswered(undefined)).toBe(false);
    expect(isUnanswered("")).toBe(false);
  });
});
