import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* The MCP layer without a database: the key check, the scope gate, and —
   the whole of the privacy story — what each tool asks the records for and
   what it hands back. The fake admin below honours the SELECT list it is
   given, so a tool that asked for `email` would get it and the leak test
   would see it; a tool that never asks never receives. The e2e module
   (scripts/e2e/crew-door-wallet-mcp.mjs) covers the same ground over HTTP on
   a deployment that holds a service key; this holds it everywhere. */

type Row = Record<string, unknown>;
type Log = { table: string; select?: string; or?: string; update?: Row };

function project(row: Row, cols: string): Row {
  if (cols.trim() === "*") return row;
  const names = cols.split(",").map((c) => c.trim()).filter(Boolean);
  return Object.fromEntries(names.filter((n) => n in row).map((n) => [n, row[n]]));
}

function fakeAdmin(tables: Record<string, Row[]>, log: Log[] = []) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      let cols = "*";
      let head = false;
      let single = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select(c: string, opts?: { head?: boolean }) { cols = c; head = !!opts?.head; log.push({ table, select: c }); return b; },
        update(patch: Row) { log.push({ table, update: patch }); return b; },
        or(expr: string) { log.push({ table, or: expr }); return b; },
        eq: () => b, neq: () => b, gte: () => b, lte: () => b, lt: () => b, gt: () => b,
        in: () => b, ilike: () => b, not: () => b, order: () => b, limit: () => b,
        maybeSingle() { single = true; return b; },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
          const shaped = rows.map((r) => project(r, cols));
          const data = head ? null : single ? (shaped[0] ?? null) : shaped;
          return Promise.resolve({ data, error: null, count: rows.length }).then(res, rej);
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminForAuth }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminForAuth: any;

const { hashKey, verifyKey, NO_SERVICE_KEY } = await import("../auth");
const { TOOLS, toolsFor, callTool } = await import("../tools");
const { isRequest, hasId, params, fail, ok, FORBIDDEN, INVALID_REQUEST } = await import("../jsonrpc");
type ApiKey = Parameters<typeof toolsFor>[0];

const key = (scopes: string[], extra: Partial<ApiKey> = {}): ApiKey =>
  ({ id: "k1", label: "E2E", key_hash: "h", prefix: "un_e2e", scopes, revoked: false, created_by: null, created_at: "", last_used_at: null, ...extra }) as ApiKey;

/* The seeded records carry everything a tool must NOT hand back. */
const SECRETS = /email|phone|stripe|boarding_code|sign_token|calendar_token|push_token|key_hash|fixtures\.invalid|cus_|UN-[A-Z]{4}-\d{4}-\d{3,4}/;
const tables: Record<string, Row[]> = {
  cities: [{ id: "c1", slug: "miami", name: "Miami", time_zone: "America/New_York" }],
  episodes: [{
    id: "e1", slug: "e2e-night", title: "E2E night.", setting: "sea", experience_class: "open", sub_class: "passage", series: "sandbar",
    kind: "sea_day", status: "live", starts_at: "2026-09-07T22:00:00Z", ends_at: null, time_zone: "America/New_York", city_id: "c1", venue_id: null,
    price_cents: 0, deposit_cents: 0, passes_total: 8, held_passes: 0, standby_passes: 0, by_request: false, min_tier: "regional", blurb: null, sale_opens_at: null,
    stripe_price_id: "price_secret", muster: "Slip 9",
  }],
  episode_capacity: [{ episode_id: "e1", passes_total: 8, aboard: 2, waitlisted: 0, passes_left: 6 }],
  venues: [],
  profiles: [{
    id: "p1", member_no: "UN-0029", full_name: "E2e Regional", handle: "ee29", tier: "regional", home_city: "c1", status: "active", hold_reason: null,
    joined_at: "2026-08-01T00:00:00Z", is_staff: false, plan_id: "plan1",
    email: "e2e-regional@fixtures.invalid", phone: "+1 305 555 0100", stripe_customer_id: "cus_e2e_secret", calendar_token: "cal_secret",
  }],
  member_value: [{ profile_id: "p1", dues_cents: 1000, spend_cents: 0, first_charge: null, last_charge: null, stripe_customer_id: "cus_leak" }],
  member_engagement: [{ profile_id: "p1", passes: 1, attended: 0, posts: 0, knots: 25, last_booked_at: null }],
  passes: [{
    id: "r1", episode_id: "e1", profile_id: "p1", status: "aboard", standby: false, comp: false, guests: 1, guest_names: ["A Guest"],
    checked_in_at: "2026-09-07T22:10:00Z", created_at: "2026-09-01T00:00:00Z", boarding_code: "UN-NIGH-0907-0001", vessel_id: null,
  }],
  account_ledger: [{ delta_cents: -1000, service_date: "2026-09-07" }],
  subscriptions: [{ status: "active", interval: "month", plan_id: "plan1" }],
  membership_plans: [{ id: "plan1", price_cents: 4900, annual_price_cents: null }],
  membership_cohorts: [{ cohort: "2026-08", joined: 3, retained: 3 }],
  application_funnel: [{ stage: "applied", n: 4 }],
  series: [{ slug: "sandbar", label: "Sandbar", blurb: null }],
};

describe("the key check", () => {
  const raw = "un_" + "a".repeat(32);
  const req = (auth?: string) => new Request("http://x/api/mcp", { method: "POST", headers: auth ? { authorization: auth } : {} });
  let log: Log[];
  beforeEach(() => {
    log = [];
    adminForAuth = fakeAdmin({ api_keys: [key(["read:episodes"], { key_hash: hashKey(raw) })] }, log);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("hashes as the keys console does — SHA-256 hex of the plaintext", () => {
    expect(hashKey(raw)).toBe(createHash("sha256").update(raw).digest("hex"));
  });
  it("refuses no header and a header of the wrong shape as 401, before any read", async () => {
    expect(await verifyKey(req())).toMatchObject({ ok: false, status: 401 });
    expect(await verifyKey(req("Basic abc"))).toMatchObject({ ok: false, status: 401 });
    expect(await verifyKey(req("Bearer not-a-key"))).toMatchObject({ ok: false, status: 401 });
    expect(log).toHaveLength(0);
  });
  it("fails closed as 503, in words, when the deployment has no service key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const v = await verifyKey(req(`Bearer ${raw}`));
    expect(v).toMatchObject({ ok: false, status: 503, message: NO_SERVICE_KEY });
    expect(log).toHaveLength(0);
  });
  it("admits a minted key and stamps last_used_at", async () => {
    const v = await verifyKey(req(`Bearer ${raw}`));
    expect(v.ok).toBe(true);
    expect(log.some((l) => l.table === "api_keys" && l.update && "last_used_at" in l.update)).toBe(true);
  });
  it("refuses a key nobody minted and a revoked one, each in its own words", async () => {
    adminForAuth = fakeAdmin({ api_keys: [] });
    expect(await verifyKey(req(`Bearer ${raw}`))).toMatchObject({ ok: false, status: 401, message: expect.stringMatching(/does not open/) });
    adminForAuth = fakeAdmin({ api_keys: [key(["read:episodes"], { revoked: true })] });
    expect(await verifyKey(req(`Bearer ${raw}`))).toMatchObject({ ok: false, status: 401, message: expect.stringMatching(/revoked/) });
  });
});

describe("the scope gate", () => {
  it("lists only what the key holds — five for episodes+members, seven for all three reads, none for write:passes", () => {
    expect(toolsFor(key(["read:episodes", "read:members"])).map((t) => t.name).sort()).toEqual(["get_episode", "get_member", "list_episodes", "list_members", "search"]);
    expect(toolsFor(key(["read:episodes", "read:members", "read:passes"]))).toHaveLength(7);
    expect(toolsFor(key(["write:passes"]))).toEqual([]);
    expect(TOOLS.every((t) => t.inputSchema.type === "object" && t.inputSchema.additionalProperties === false)).toBe(true);
  });
  it("refuses a tool the key lacks by naming the scope, and an unknown tool as unknown", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = fakeAdmin(tables) as any;
    const v = await callTool(admin, key(["read:episodes"]), "passes_for_episode", { slug: "e2e-night" });
    expect(v).toMatchObject({ kind: "forbidden", message: expect.stringMatching(/read:passes/) });
    expect(await callTool(admin, key(["read:episodes"]), "drop_table", {})).toEqual({ kind: "unknown" });
    expect(FORBIDDEN).toBe(-32001);
  });
  it("answers a bad argument in words", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = fakeAdmin(tables) as any;
    expect(await callTool(admin, key(["read:episodes"]), "list_episodes", { from: "not a date" })).toMatchObject({ kind: "bad_args", message: expect.stringMatching(/date/) });
    expect(await callTool(admin, key(["read:episodes"]), "get_episode", {})).toMatchObject({ kind: "bad_args", message: expect.stringMatching(/required/) });
  });
});

describe("what the seven tools hand back", () => {
  const all = key(["read:episodes", "read:members", "read:passes"]);
  const run = async (name: string, args: Record<string, unknown>) => {
    const log: Log[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = await callTool(fakeAdmin(tables, log) as any, all, name, args);
    if (v.kind !== "result") throw new Error(`${name}: ${JSON.stringify(v)}`);
    const text = v.result.content[0].text;
    return { text, data: JSON.parse(text), log, isError: v.result.isError === true };
  };

  it("never asks the records for a contact, billing or boarding column", async () => {
    for (const t of TOOLS) {
      const args = { slug: "e2e-night", handle: "ee29", q: "night" };
      const { log } = await run(t.name, args);
      for (const l of log) if (l.select) expect(l.select, `${t.name} selects from ${l.table}`).not.toMatch(/email|phone|stripe|boarding_code|sign_token|calendar_token|push_token/);
    }
  });
  it("list_episodes says afloat for sea and leaks nothing", async () => {
    const { data, text, isError } = await run("list_episodes", {});
    expect(isError).toBe(false);
    expect(data.episodes[0]).toMatchObject({ slug: "e2e-night", setting: "afloat", city: { slug: "miami" } });
    expect(text).not.toMatch(SECRETS);
  });
  it("get_episode carries the capacity and the checked-in count", async () => {
    const { data, text } = await run("get_episode", { slug: "e2e-night" });
    expect(data.episode.capacity).toMatchObject({ passes_total: 8, aboard: 2, checked_in: 1 });
    expect(text).not.toMatch(SECRETS);
  });
  it("list_members and get_member name and number a member — no address, phone or Stripe id", async () => {
    const lm = await run("list_members", { q: "regional" });
    expect(lm.data.members[0]).toMatchObject({ member_no: "UN-0029", handle: "ee29" });
    expect(lm.text).not.toMatch(SECRETS);
    const gm = await run("get_member", { handle: "@ee29" });
    expect(gm.data.member).toMatchObject({ member_no: "UN-0029", value: { dues_cents: 1000 }, engagement: { knots: 25 } });
    expect(gm.text).not.toMatch(SECRETS);
  });
  it("passes_for_episode names the holder and their standing, never the boarding code", async () => {
    const { data, text } = await run("passes_for_episode", { slug: "e2e-night" });
    expect(data.passes[0]).toMatchObject({ member_no: "UN-0029", standing: "aboard", guests: 1, guest_names: ["A Guest"] });
    expect(data.passes[0]).not.toHaveProperty("boarding_code");
    expect(text).not.toMatch(SECRETS);
  });
  it("reports_summary is figures — MRR from live subscriptions, house billed and deferred", async () => {
    const { data, text } = await run("reports_summary", {});
    expect(data).toMatchObject({ mrr_cents: 4900, dues_paying: 1, house: { billed_cents: 1000 } });
    expect(text).not.toMatch(SECRETS);
  });
  it("search strips filter grammar from the needle and asks for two characters", async () => {
    const { log } = await run("search", { q: "x,or(slug.eq.a)%_" });
    const ors = log.filter((l) => l.or).map((l) => l.or as string);
    expect(ors.length).toBeGreaterThan(0);
    for (const o of ors) {
      expect(o).not.toMatch(/[()]/);
      expect(o).toContain("%x or slug.eq.a%");
    }
    const short = await run("search", { q: "a" });
    expect(short.data.note).toMatch(/Two characters/);
  });
});

describe("the wire", () => {
  it("tells a request from a notification and reads params as an object", () => {
    expect(isRequest({ jsonrpc: "2.0", method: "ping", id: 1 })).toBe(true);
    expect(isRequest({ method: "ping" })).toBe(false);
    expect(hasId({ jsonrpc: "2.0", method: "ping" })).toBe(false);
    expect(hasId({ jsonrpc: "2.0", method: "ping", id: 0 })).toBe(true);
    expect(params({ jsonrpc: "2.0", method: "x", params: [1] })).toEqual({});
    expect(ok(1, {})).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect(fail(null, INVALID_REQUEST, "no")).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "no" } });
  });
});
