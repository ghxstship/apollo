import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("keeps a path of our own, with its query and fragment", () => {
    expect(safeNext("/passes?tab=held#top")).toBe("/passes?tab=held#top");
    expect(safeNext("/")).toBe("/");
  });
  it("falls back for nothing", () => {
    expect(safeNext(null)).toBe("/home");
    expect(safeNext(undefined)).toBe("/home");
    expect(safeNext("")).toBe("/home");
    expect(safeNext("", "/you")).toBe("/you");
  });
  it("refuses every shape that leaves the origin", () => {
    for (const bad of [
      "//evil.com", "/\\evil.com", "/\\/evil.com", "/..//evil.com", "/../\\evil.com",
      "https://evil.com/x", "http://evil.com", "javascript:alert(1)", "data:text/html,hi",
      "\\\\evil.com", "///evil.com",
    ]) {
      expect(safeNext(bad), bad).toBe("/home");
    }
  });
  it("normalises dot segments and still insists the result is ours", () => {
    expect(safeNext("/passes/../you")).toBe("/you");
  });
});
