import { describe, expect, it } from "vitest";
import { callerAddress } from "@/lib/caller-address";

describe("callerAddress", () => {
  it("prefers the platform's single-value header", () => {
    const h = new Headers({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 203.0.113.9" });
    expect(callerAddress(h)).toBe("203.0.113.9");
  });
  it("takes the rightmost hop, never the client-chosen leftmost", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(callerAddress(h)).toBe("203.0.113.9");
  });
  it("answers null with nothing to go on", () => {
    expect(callerAddress(new Headers())).toBeNull();
  });
});
