import { describe, expect, it } from "vitest";
import { qrDataUrl } from "@/lib/commerce-qr";

describe("qrDataUrl", () => {
  it("renders a PNG data URL the card can drop straight into an <img>", async () => {
    const url = await qrDataUrl("UN-1A2B3C4D");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    /* PNG magic bytes, so the payload is an image and not an error string. */
    const bytes = Buffer.from(url.slice("data:image/png;base64,".length), "base64");
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("two codes render two different images, and the same code renders the same one", async () => {
    const [a, b, aAgain] = await Promise.all([qrDataUrl("UN-1A2B3C4D"), qrDataUrl("UN-1A2B3C4D-G1"), qrDataUrl("UN-1A2B3C4D")]);
    expect(a).not.toBe(b);
    expect(a).toBe(aAgain);
  });
});
