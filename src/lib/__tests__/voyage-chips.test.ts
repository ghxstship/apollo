import { describe, expect, it } from "vitest";
import { depositChip } from "@/components/site/voyage-chips";

describe("depositChip", () => {
  it("states the voyage's own figure", () => {
    expect(depositChip(12000)).toBe("$120 HOLDS IT");
  });
  it("reads a zero as complimentary, never as $0", () => {
    expect(depositChip(0)).not.toContain("$0");
  });
});
