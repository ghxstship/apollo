import { describe, expect, it } from "vitest";
import {
  memberMark, memberNumber, memberNumberCandidates, memberNumberFilter, memberNumberTail,
  productPrice, productWeight,
} from "@/lib/membership";

describe("memberNumber / memberMark", () => {
  it("strips a retired prefix of any era, or none", () => {
    expect(memberNumber("SYR-0047")).toBe("0047");
    expect(memberNumber("LS-0047")).toBe("0047");
    expect(memberNumber("UN 0047")).toBe("0047");
    expect(memberNumber("0047")).toBe("0047");
  });
  it("answers empty for nothing", () => {
    expect(memberNumber(null)).toBe("");
    expect(memberNumber(undefined)).toBe("");
    expect(memberNumber("   ")).toBe("");
    expect(memberMark(null)).toBe("");
  });
  it("sets the mark the way the card does", () => {
    expect(memberMark("SYR-0047")).toBe("Nº 0047");
  });
});

describe("memberNumberCandidates", () => {
  it("offers the typed value and the bare number for a prefixed card", () => {
    expect(memberNumberCandidates("syr-0047")).toEqual(["SYR-0047", "0047"]);
  });
  it("offers a stored-with-any-prefix pattern for a bare number", () => {
    expect(memberNumberCandidates("0047")).toEqual(["0047", "%-0047"]);
  });
  it("offers nothing for nothing", () => {
    expect(memberNumberCandidates("  ")).toEqual([]);
  });
});

describe("memberNumberTail", () => {
  it("takes the digits after the last dash", () => {
    expect(memberNumberTail("UN-ABCD-0047")).toBe("0047");
    expect(memberNumberTail(" 0047 ")).toBe("0047");
    expect(memberNumberTail("un-0047")).toBe("0047");
  });
  it("refuses LIKE wildcards — this is operator-typed input bound for a pattern", () => {
    expect(memberNumberTail("00%7")).toBeNull();
    expect(memberNumberTail("_047")).toBeNull();
    expect(memberNumberTail("UN-%")).toBeNull();
  });
  it("refuses an empty or oversized tail", () => {
    expect(memberNumberTail("")).toBeNull();
    expect(memberNumberTail("UN-")).toBeNull();
    expect(memberNumberTail("A".repeat(13))).toBeNull();
  });
  it("filters on the exact number or any prefix before it", () => {
    expect(memberNumberFilter("0047")).toBe("member_no.eq.0047,member_no.like.%-0047");
  });
});

describe("productPrice", () => {
  it("an unpublished product has no number, not a hidden one", () => {
    expect(productPrice({ price_cents: 35000, published: false })).toBe("By invitation");
    expect(productPrice({ price_cents: null as unknown as number, published: true })).toBe("By invitation");
  });
  it("states the figure in dollars", () => {
    expect(productPrice({ price_cents: 35000, published: true })).toBe("$350");
    expect(productPrice({ price_cents: 1_250_000, published: true })).toBe("$12,500");
  });
});

describe("productWeight", () => {
  it("numerals on both sides, pluralised each", () => {
    expect(productWeight({ ratio_units: 1, ratio_heads: 2 })).toBe("1 unit · 2 seats");
    expect(productWeight({ ratio_units: 2, ratio_heads: 1 })).toBe("2 units · 1 seat");
  });
  it("a product that takes no place says so", () => {
    expect(productWeight({ ratio_units: 0, ratio_heads: 0 })).toBe("Takes no place of its own");
  });
});
