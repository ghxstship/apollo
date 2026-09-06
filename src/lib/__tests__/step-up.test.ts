import { describe, it, expect } from "vitest";
import { stepUpRefusal } from "../supabase/step-up";

/* The hole this closes: the proxy's second-step gate runs only for the page
   prefixes in PROTECTED, and no route handler is a page. Someone holding a
   member's password but not their phone was bounced from /home and then read
   boarding codes from /api/producer. Nothing in the database knows about
   assurance levels, so RLS cannot be the backstop — these assertions are. */

type Level = { currentLevel: string; nextLevel: string } | null;

const client = (aal: Level, error: unknown = null) =>
  ({ auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: aal, error }) } } }) as never;

const member = (factors: { status: string }[] | undefined) =>
  ({ id: "m", factors }) as never;

describe("the second step reaches the routes, not only the pages", () => {
  it("refuses a session that has not proven the code", async () => {
    const res = await stepUpRefusal(
      client({ currentLevel: "aal1", nextLevel: "aal2" }),
      member([{ status: "verified" }]),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    expect(await res!.json()).toMatchObject({ next: "/gangway/verify" });
  });

  it("lets a session through once the code is proven", async () => {
    const res = await stepUpRefusal(
      client({ currentLevel: "aal2", nextLevel: "aal2" }),
      member([{ status: "verified" }]),
    );
    expect(res).toBeNull();
  });

  it("asks nothing of a member who has enrolled no factor", async () => {
    for (const factors of [undefined, [], [{ status: "unverified" }]]) {
      const res = await stepUpRefusal(client(null), member(factors));
      expect(res).toBeNull();
    }
  });

  it("leaves the caller's own 401 to the caller when nobody is signed in", async () => {
    const res = await stepUpRefusal(client({ currentLevel: "aal1", nextLevel: "aal2" }), null);
    expect(res).toBeNull();
  });

  it("fails closed when the level cannot be read", async () => {
    const res = await stepUpRefusal(client(null, { message: "network" }), member([{ status: "verified" }]));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("never caches a refusal", async () => {
    const res = await stepUpRefusal(
      client({ currentLevel: "aal1", nextLevel: "aal2" }),
      member([{ status: "verified" }]),
    );
    expect(res!.headers.get("Cache-Control")).toBe("no-store");
  });
});
