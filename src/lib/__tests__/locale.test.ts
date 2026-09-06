import { describe, it, expect } from "vitest";
import { DEFAULT_LOCALE, direction, isSupported, negotiate } from "../locale";

describe("which language the club is read in", () => {
  it("prefers what the member chose over what their browser asks for", () => {
    expect(negotiate("fr-FR,fr;q=0.9", "es-ES")).toBe("es-ES");
  });

  it("falls to the cookie when there is no stored choice", () => {
    expect(negotiate("fr-FR", null, "de-DE")).toBe("de-DE");
  });

  it("reads Accept-Language by quality, not by order", () => {
    expect(negotiate("de-DE;q=0.2,fr-FR;q=0.9")).toBe("fr-FR");
  });

  it("reaches a region from a bare language", () => {
    /* A browser asking for `fr` has not said it dislikes fr-FR. */
    expect(negotiate("fr")).toBe("fr-FR");
  });

  it("ignores a language the club does not speak", () => {
    expect(negotiate("is-IS,kl-GL")).toBe(DEFAULT_LOCALE);
  });

  it("ignores a header that is not one", () => {
    expect(negotiate("")).toBe(DEFAULT_LOCALE);
    expect(negotiate(null)).toBe(DEFAULT_LOCALE);
    /* Arrives from the network; a header of ten thousand tags is deliberate. */
    expect(negotiate(Array(5000).fill("xx-XX").join(","))).toBe(DEFAULT_LOCALE);
  });

  it("refuses a q of zero, which means 'not this one'", () => {
    expect(negotiate("fr-FR;q=0")).toBe(DEFAULT_LOCALE);
  });

  it("knows which way a script runs", () => {
    expect(direction("en-US")).toBe("ltr");
    expect(direction("ar-AE")).toBe("rtl");
    expect(direction("he-IL")).toBe("rtl");
    /* Direction belongs to the script, so any region of a language agrees. */
    expect(direction("ar-EG")).toBe("rtl");
  });

  it("does not negotiate into the pseudo-locale", () => {
    /* It is a tool for finding unextracted strings, reachable only by asking
       for it outright — never something a browser lands in by accident. */
    expect(isSupported("en-XA")).toBe(false);
    expect(negotiate("en-XA")).toBe("en-US");
  });
});
