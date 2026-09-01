import { describe, expect, it } from "vitest";
import { CODE_PREFIX, RETIRED_CODE_PREFIXES, literalCode } from "@/lib/boarding-code";

describe("literalCode", () => {
  it("reads every retired prefix as the current one", () => {
    for (const p of RETIRED_CODE_PREFIXES) {
      expect(literalCode(`${p}ABCD-0912-0001-A1`)).toBe(`${CODE_PREFIX}ABCD-0912-0001-A1`);
    }
  });
  it("leaves a current code alone", () => {
    expect(literalCode("UN-ABCD-0912-0001-A1")).toBe("UN-ABCD-0912-0001-A1");
  });
});
