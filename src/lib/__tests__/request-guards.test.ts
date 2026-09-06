import { describe, expect, it } from "vitest";
import { crossSiteRefusal, readBounded } from "@/lib/request-guards";

/* A body that arrives in pieces and declares no length — the shape a
   Content-Length check cannot see, and the whole reason the count is kept over
   the bytes instead. */
function chunked(chunks: string[], headers: Record<string, string> = {}): Request {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Request("https://un.example/x", {
    method: "POST",
    body: stream,
    headers,
    /* Node needs to be told a streamed body is one-way. */
    duplex: "half",
  } as RequestInit);
}

describe("readBounded", () => {
  it("returns a body that fits", async () => {
    const req = new Request("https://un.example/x", { method: "POST", body: "hello" });
    expect(await readBounded(req, 1024)).toBe("hello");
  });

  it("refuses on the declared length without reading a byte", async () => {
    const req = new Request("https://un.example/x", {
      method: "POST",
      body: "small",
      headers: { "content-length": String(10 * 1024 * 1024) },
    });
    expect(await readBounded(req, 1024)).toBeNull();
  });

  it("refuses a chunked body that declares nothing and goes past the cap", async () => {
    expect(await readBounded(chunked(["a".repeat(600), "b".repeat(600)]), 1000)).toBeNull();
  });

  it("keeps a chunked body that stays inside the cap", async () => {
    const body = await readBounded(chunked(["a".repeat(400), "b".repeat(400)]), 1000);
    expect(body).toHaveLength(800);
  });

  it("counts bytes rather than characters, so multi-byte text cannot smuggle length", async () => {
    /* Four characters, twelve bytes. */
    const req = chunked(["永永永永"]);
    expect(await readBounded(req, 11)).toBeNull();
    expect(await readBounded(chunked(["永永永永"]), 12)).toBe("永永永永");
  });

  it("a body split mid-character still decodes whole", async () => {
    const bytes = new TextEncoder().encode("永");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 1));
        controller.enqueue(bytes.slice(1));
        controller.close();
      },
    });
    const req = new Request("https://un.example/x", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readBounded(req, 64)).toBe("永");
  });

  it("no body at all is an empty body, not a refusal", async () => {
    expect(await readBounded(new Request("https://un.example/x"), 1024)).toBe("");
  });
});

describe("crossSiteRefusal", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://un.example/x", { method: "POST", headers });

  it("refuses when the browser says the ask came from another site", async () => {
    const res = crossSiteRefusal(req({ "sec-fetch-site": "cross-site" }));
    expect(res?.status).toBe(403);
    expect(res?.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("lets our own pages through", () => {
    expect(crossSiteRefusal(req({ "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(crossSiteRefusal(req({ "sec-fetch-site": "same-site" }))).toBeNull();
  });

  it("says nothing about a caller that sends no such header", () => {
    expect(crossSiteRefusal(req({}))).toBeNull();
  });
});
