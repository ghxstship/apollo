import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANCHOR, BANNED_TERMS, DIVISIONS, editionName, knots, lockup, lockupSuffix, sentenceCase,
} from "@/lib/brand";
import { parseBannedTerms } from "../../../scripts/lib/banned-terms.mjs";

describe("editionName", () => {
  it("joins series and city as one name, Love Island USA", () => {
    expect(editionName("Afterglow", "Miami")).toBe("Afterglow Miami");
  });
  it("is the series alone with no city, and the city alone with no series", () => {
    expect(editionName("Afterglow", null)).toBe("Afterglow");
    expect(editionName("Afterglow", "  ")).toBe("Afterglow");
    expect(editionName("", "Miami")).toBe("Miami");
    expect(editionName("  ", undefined)).toBe("");
  });
});

describe("the lockup", () => {
  it("is the anchor alone with no division", () => {
    expect(lockup()).toBe(ANCHOR);
    expect(lockup(null)).toBe(ANCHOR);
  });
  it("sets the suffix in sentence case, whatever case it arrives in", () => {
    expect(sentenceCase("HINGED")).toBe("Hinged");
    expect(sentenceCase("hinged")).toBe("Hinged");
    expect(sentenceCase("")).toBe("");
    expect(lockupSuffix("HINGED")).toBe("Hinged");
    expect(lockupSuffix("Hinged", "caps")).toBe("HINGED");
    expect(lockupSuffix("Hinged", "editorial")).toBe("hinged");
    expect(lockup("hinged")).toBe(`${ANCHOR} ${DIVISIONS.hinged.suffix}`);
    expect(lockup("hinged", "caps")).toBe(`${ANCHOR} ${DIVISIONS.hinged.suffix.toUpperCase()}`);
  });
});

describe("knots", () => {
  it("sets a true minus, not a hyphen", () => {
    expect(knots(-3)).toBe("−3 KN");
    expect(knots(0)).toBe("0 KN");
    expect(knots(25)).toBe("25 KN");
  });
});

/* The two lexicon gates read BANNED_TERMS out of this file's SOURCE by regex,
   not by import. That is the fragility: the array is what the gates enforce
   only if the parser reads all of it, and a comment with a `]` in it once cut
   the e2e suite's reading to twelve terms. This holds the parser to the import. */
describe("BANNED_TERMS as the gates read it", () => {
  it("is the same list by regex as by import", () => {
    const src = readFileSync(join(__dirname, "..", "brand.ts"), "utf8");
    expect(parseBannedTerms(src)).toEqual([...BANNED_TERMS]);
  });
  it("is a flat list of non-empty strings, none of which is the live brand", () => {
    expect(BANNED_TERMS.length).toBeGreaterThan(0);
    for (const t of BANNED_TERMS) {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
      expect(ANCHOR.toLowerCase().includes(t.toLowerCase())).toBe(false);
    }
  });
});
