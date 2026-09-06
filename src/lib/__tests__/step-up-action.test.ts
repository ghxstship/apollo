import { describe, it, expect } from "vitest";
import { actionStepUp } from "../supabase/step-up-action";

/* The seam below the one step-up.test.ts covers.
   step-up.ts reaches route handlers; the proxy reaches pages. A server action
   is neither: it is dispatched by a Next-Action id to whatever route the client
   happens to be on, and the proxy's gate is a list of path prefixes. So a POST
   carrying an action id to a path that is not on PROTECTED — "/", "/series", a
   log entry — was never redirected, and setPassword, departClub, the two
   consent switches and the calendar-token rotation all ran at the first
   assurance level no matter which screen their form was rendered on.

   Nothing in the database consults an assurance level either, so RLS is not the
   backstop here any more than it was there. These assertions are. */

type Level = { currentLevel: string; nextLevel: string } | null;

const client = (aal: Level, error: unknown = null) =>
  ({ auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: aal, error }) } } }) as never;

const member = (factors: { status: string }[] | undefined) =>
  ({ id: "m", factors }) as never;

describe("the second step reaches server actions", () => {
  it("refuses an action on a session that has not proven the code", async () => {
    const res = await actionStepUp(
      client({ currentLevel: "aal1", nextLevel: "aal2" }),
      member([{ status: "verified" }]),
    );
    expect(res).not.toBeNull();
    expect(res!.next).toBe("/gangway/verify");
    /* A sentence a form can render, not a Response: an action returns a value
       its own form shows, and a 401 body is not something a form can display. */
    expect(typeof res!.error).toBe("string");
  });

  it("lets the action through once the code is proven", async () => {
    const res = await actionStepUp(
      client({ currentLevel: "aal2", nextLevel: "aal2" }),
      member([{ status: "verified" }]),
    );
    expect(res).toBeNull();
  });

  it("does not ask a member who has enrolled nothing", async () => {
    expect(await actionStepUp(client(null), member([]))).toBeNull();
    expect(await actionStepUp(client(null), member(undefined))).toBeNull();
  });

  it("does not count an unverified factor as enrolment", async () => {
    /* Half-finished enrolment leaves an unverified factor behind. Treating it
       as enrolled would lock somebody out of the very screen they abandoned. */
    expect(await actionStepUp(client(null), member([{ status: "unverified" }]))).toBeNull();
  });

  it("fails closed when the assurance level cannot be read", async () => {
    const res = await actionStepUp(
      client(null, new Error("provider unreachable")),
      member([{ status: "verified" }]),
    );
    expect(res).not.toBeNull();
  });

  it("leaves a caller with no session to its own refusal", async () => {
    /* Every action here has already said "Sign in first." by the time it asks;
       answering again here would be a second refusal for one problem. */
    expect(await actionStepUp(client(null), null)).toBeNull();
  });
});
