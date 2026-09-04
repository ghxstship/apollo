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

describe("literalCode, at the gangway", () => {
  it("reads a scanned value however it was cased or padded", () => {
    expect(literalCode("  syr-abcd-0912 ")).toBe("UN-ABCD-0912");
    expect(literalCode("ls-abcd")).toBe("UN-ABCD");
  });
  it("maps a retired prefix only at the front — never inside a code", () => {
    expect(literalCode("UN-LS-0001")).toBe("UN-LS-0001");
    expect(literalCode("XSYR-0001")).toBe("XSYR-0001");
  });
  it("lists LYRE- beside the SQL repair so the two lists agree", () => {
    expect(RETIRED_CODE_PREFIXES).toContain("LYRE-");
    expect(RETIRED_CODE_PREFIXES).toContain("LS-");
  });
});
