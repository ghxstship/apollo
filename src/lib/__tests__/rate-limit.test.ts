import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientKey, overLimit, tooMany } from "@/lib/rate-limit";

/* The window lives in module memory, so every test works its own key — a
   shared key would carry one test's spend into the next. */
let n = 0;
const key = () => `k${++n}-${Date.now()}`;

describe("overLimit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lets the allowance through and refuses the call after it", () => {
    const k = key();
    expect(overLimit(k, 3, 60_000)).toBe(false);
    expect(overLimit(k, 3, 60_000)).toBe(false);
    expect(overLimit(k, 3, 60_000)).toBe(false);
    expect(overLimit(k, 3, 60_000)).toBe(true);
    expect(overLimit(k, 3, 60_000)).toBe(true);
  });

  it("keeps one key's spend off another's", () => {
    const a = key(), b = key();
    expect(overLimit(a, 1, 60_000)).toBe(false);
    expect(overLimit(a, 1, 60_000)).toBe(true);
    expect(overLimit(b, 1, 60_000)).toBe(false);
  });

  it("starts the window again once it has run out", () => {
    const k = key();
    expect(overLimit(k, 1, 1_000)).toBe(false);
    expect(overLimit(k, 1, 1_000)).toBe(true);
    vi.advanceTimersByTime(1_001);
    expect(overLimit(k, 1, 1_000)).toBe(false);
  });

  it("a window is measured from its first call, not its last", () => {
    const k = key();
    overLimit(k, 1, 1_000);
    vi.advanceTimersByTime(900);
    expect(overLimit(k, 1, 1_000)).toBe(true);
    vi.advanceTimersByTime(101);
    expect(overLimit(k, 1, 1_000)).toBe(false);
  });
});

describe("clientKey", () => {
  const req = (headers: Record<string, string>) => new Request("https://un.example/x", { headers });

  it("prefers the platform's own header over the forwarded chain", () => {
    expect(
      clientKey(req({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))
    ).toBe("203.0.113.9");
  });
  it("takes the rightmost hop, never the leftmost the client wrote itself", () => {
    expect(clientKey(req({ "x-forwarded-for": " 6.6.6.6 , 203.0.113.9 " }))).toBe("203.0.113.9");
  });
  it("a caller rotating the hop it writes itself stays in one bucket", () => {
    const a = clientKey(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }));
    const b = clientKey(req({ "x-forwarded-for": "2.2.2.2, 203.0.113.9" }));
    expect(a).toBe(b);
  });
  it("falls back to x-real-ip, then to unknown", () => {
    expect(clientKey(req({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientKey(req({}))).toBe("unknown");
  });
  it("an empty forwarded header is not a key", () => {
    expect(clientKey(req({ "x-forwarded-for": "", "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  });
});

describe("tooMany", () => {
  it("is a 429 with a Retry-After and nothing cached in between", async () => {
    const res = tooMany({ error: "slow down" }, 30);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: "slow down" });
  });
});
