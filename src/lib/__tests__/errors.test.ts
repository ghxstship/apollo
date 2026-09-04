import { describe, expect, it } from "vitest";
import { HOLD_MESSAGE, REFUSED_MESSAGE, isRlsRefusal, voice, voiceWith } from "@/lib/errors";

describe("isRlsRefusal", () => {
  it("reads the code or the message", () => {
    expect(isRlsRefusal({ code: "42501" })).toBe(true);
    expect(isRlsRefusal({ message: 'new row violates row-level security policy for table "passes"' })).toBe(true);
    expect(isRlsRefusal({ code: "23505" })).toBe(false);
    expect(isRlsRefusal(null)).toBe(false);
  });
});

describe("voice", () => {
  it("does not diagnose a policy refusal it has not checked", () => {
    expect(voice({ code: "42501" })).toBe(REFUSED_MESSAGE);
    expect(voice({ code: "42501" })).not.toMatch(/paused|hold/i);
  });
  it("a constraint or a bad id names no table, column or type", () => {
    for (const e of [
      { code: "23514", message: 'new row for relation "shop_order_items" violates check constraint "shop_order_items_qty_check"' },
      { code: "23505", message: 'duplicate key value violates unique constraint "passes_pkey"' },
      { message: "violates check constraint x" },
      { code: "22P02", message: "invalid input syntax for type uuid" },
      { code: "22007" },
      { message: 'column "foo" does not exist' },
      { message: 'relation "bar" does not exist' },
    ]) {
      const v = voice(e);
      expect(v).not.toMatch(/relation|column|constraint|uuid|syntax|"/);
    }
  });
  it("never names a route for a bad id — the same id reaches here from five surfaces", () => {
    expect(voice({ code: "22P02" })).not.toMatch(/\//);
  });
  it("passes a guard's own words through with a capital and a full stop", () => {
    expect(voice({ message: "a member number is issued once" })).toBe("A member number is issued once.");
    expect(voice({ message: "Is that yours?" })).toBe("Is that yours?");
    expect(voice({ message: "Done." })).toBe("Done.");
  });
  it("has one line for nothing at all", () => {
    expect(voice(null)).toBe("That didn't land. Try again.");
    expect(voice({ message: "   " })).toBe("That didn't land. Try again.");
  });
});

describe("voiceWith", () => {
  const client = (data: unknown) => ({ rpc: async () => ({ data }) });
  it("says the hold only when is_active() says so", async () => {
    expect(await voiceWith(client(false), { code: "42501" })).toBe(HOLD_MESSAGE);
    expect(await voiceWith(client(true), { code: "42501" })).toBe(REFUSED_MESSAGE);
    expect(await voiceWith(client(null), { code: "42501" })).toBe(REFUSED_MESSAGE);
  });
  it("falls back to the vague truth when the question cannot be asked", async () => {
    const broken = { rpc: async () => { throw new Error("offline"); } };
    expect(await voiceWith(broken, { code: "42501" })).toBe(REFUSED_MESSAGE);
  });
  it("does not ask for anything that is not a policy refusal", async () => {
    let asked = 0;
    const counting = { rpc: async () => { asked++; return { data: false }; } };
    expect(await voiceWith(counting, { code: "23514" })).toBe(voice({ code: "23514" }));
    expect(asked).toBe(0);
  });
});
