import "server-only";
import { moduleTables } from "@/lib/module-tables";
import type { Database } from "@/lib/supabase/types";
import { hasScope, type Admin, type ApiKey, type Scope } from "./auth";

/* The read-only tools an outside model may call about the club.

   Every tool runs on the service role — the key was verified first, and a
   key is a staff instrument — so what each tool RETURNS is the whole of the
   privacy story. Members come back without email, phone, Stripe ids or
   calendar tokens; passes come back without boarding codes. A tool that is
   not in this list does not exist, and a tool whose scope the key lacks is
   refused by name before a query runs.

   Scopes are the four the keys console already issues. There is no write
   tool: write:passes admits nothing here, and a key holding only that scope
   sees an empty tools list. */

export type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  scopes: Scope[];
  run: (admin: Admin, args: Record<string, unknown>) => Promise<unknown>;
};

/* ── arguments ─────────────────────────────────────────────────────────────── */

class BadArgs extends Error {}

function str(args: Record<string, unknown>, k: string, max = 200): string | undefined {
  const v = args[k];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new BadArgs(`${k} must be a string.`);
  return v.trim().slice(0, max);
}

function need(args: Record<string, unknown>, k: string, max = 200): string {
  const v = str(args, k, max);
  if (!v) throw new BadArgs(`${k} is required.`);
  return v;
}

function int(args: Record<string, unknown>, k: string, fallback: number, lo: number, hi: number): number {
  const v = args[k];
  if (v === undefined || v === null) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new BadArgs(`${k} must be a number.`);
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

function iso(args: Record<string, unknown>, k: string): string | undefined {
  const v = str(args, k, 40);
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadArgs(`${k} must be a date — 2026-09-04 or an ISO timestamp.`);
  return d.toISOString();
}

function oneOf<T extends string>(args: Record<string, unknown>, k: string, allowed: readonly T[]): T | undefined {
  const v = str(args, k, 40);
  if (!v) return undefined;
  if (!(allowed as readonly string[]).includes(v)) throw new BadArgs(`${k} must be one of ${allowed.join(", ")}.`);
  return v as T;
}

/* PostgREST's or() takes a filter grammar, so a comma or a parenthesis in a
   needle is syntax, not text; % and _ are ilike wildcards. Dropped, as the
   site search does. */
function clean(raw: string): string {
  return raw.replace(/[,()%_*\\]/g, " ").trim().slice(0, 64);
}

/* A read that fails is not an empty list. */
function rows<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(`the club's records could not be read: ${res.error.message}`);
  return res.data ?? [];
}

/* ── shared readers ────────────────────────────────────────────────────────── */

const EPISODE_STATUSES = ["scheduled", "live", "weather_hold", "completed", "cancelled"] as const;
const MEMBER_STATUSES = ["active", "paused", "departed"] as const;
const TIERS = ["regional", "national", "global"] as const;

const EPISODE_FIELDS =
  "id, slug, title, setting, experience_class, sub_class, series, kind, status, starts_at, ends_at, time_zone, city_id, venue_id, price_cents, deposit_cents, passes_total, held_passes, standby_passes, by_request, min_tier, blurb, sale_opens_at";

const MEMBER_FIELDS = "id, member_no, full_name, handle, tier, home_city, status, hold_reason, joined_at, is_staff, plan_id";

type CityRef = { id: string; slug: string; name: string; time_zone: string };

async function cityIndex(admin: Admin): Promise<Map<string, CityRef>> {
  const cities = rows(await admin.from("cities").select("id, slug, name, time_zone"));
  return new Map(cities.map((c) => [c.id, c]));
}

async function cityByWord(admin: Admin, word: string): Promise<CityRef | null> {
  const w = clean(word);
  if (!w) return null;
  const { data } = await admin
    .from("cities")
    .select("id, slug, name, time_zone")
    .or(`slug.ilike.${w},name.ilike.${w}`)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

type EpisodeRow = Pick<
  Database["public"]["Tables"]["episodes"]["Row"],
  | "id" | "slug" | "title" | "setting" | "experience_class" | "sub_class" | "series" | "kind" | "status"
  | "starts_at" | "ends_at" | "time_zone" | "city_id" | "venue_id" | "price_cents" | "deposit_cents"
  | "passes_total" | "held_passes" | "standby_passes" | "by_request" | "min_tier" | "blurb" | "sale_opens_at"
>;

function shapeEpisode(v: EpisodeRow, cities: Map<string, CityRef>) {
  const city = v.city_id ? cities.get(v.city_id) : undefined;
  return {
    slug: v.slug,
    title: v.title,
    status: v.status,
    setting: v.setting === "sea" ? "afloat" : "ashore",
    experience_class: v.experience_class,
    duration_class: v.sub_class,
    series: v.series,
    kind: v.kind,
    starts_at: v.starts_at,
    ends_at: v.ends_at,
    time_zone: v.time_zone,
    city: city ? { slug: city.slug, name: city.name } : null,
    price_cents: v.price_cents,
    deposit_cents: v.deposit_cents,
    by_request: v.by_request,
    min_tier: v.min_tier,
    passes_total: v.passes_total,
    held_passes: v.held_passes,
    standby_passes: v.standby_passes,
    sale_opens_at: v.sale_opens_at,
    blurb: v.blurb,
  };
}

/* ── the tools ─────────────────────────────────────────────────────────────── */

const listEpisodes: Tool = {
  name: "list_episodes",
  description:
    "List the club's episodes — every event, afloat or ashore. Filter by a date window (from/to), a city (slug or name) and a status. Defaults to the last 30 days onward, soonest first, at most 100. Prices are in cents.",
  scopes: ["read:episodes"],
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Earliest starts_at, as a date or ISO timestamp. Default: 30 days ago." },
      to: { type: "string", description: "Latest starts_at, as a date or ISO timestamp." },
      city: { type: "string", description: "City slug or name, e.g. miami." },
      status: { type: "string", enum: [...EPISODE_STATUSES] },
      limit: { type: "integer", minimum: 1, maximum: 200, description: "Default 100." },
    },
    additionalProperties: false,
  },
  async run(admin, args) {
    const from = iso(args, "from") ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = iso(args, "to");
    const status = oneOf(args, "status", EPISODE_STATUSES);
    const limit = int(args, "limit", 100, 1, 200);
    const cityWord = str(args, "city", 80);
    const city = cityWord ? await cityByWord(admin, cityWord) : null;
    if (cityWord && !city) return { episodes: [], note: `No city called ${cityWord}.` };

    let q = admin.from("episodes").select(EPISODE_FIELDS).gte("starts_at", from).order("starts_at", { ascending: true }).limit(limit);
    if (to) q = q.lte("starts_at", to);
    if (status) q = q.eq("status", status);
    if (city) q = q.eq("city_id", city.id);
    const [episodes, cities] = await Promise.all([q, cityIndex(admin)]);
    return { episodes: rows(episodes).map((v) => shapeEpisode(v, cities)) };
  },
};

const getEpisode: Tool = {
  name: "get_episode",
  description:
    "One episode by slug, with its capacity: passes_total, aboard (passes held), waitlisted, passes_left, checked_in (people who have boarded), standby and held passes.",
  scopes: ["read:episodes"],
  inputSchema: {
    type: "object",
    properties: { slug: { type: "string" } },
    required: ["slug"],
    additionalProperties: false,
  },
  async run(admin, args) {
    const slug = need(args, "slug", 120);
    const { data: v, error } = await admin.from("episodes").select(EPISODE_FIELDS).eq("slug", slug).maybeSingle();
    if (error) throw new Error(`the club's records could not be read: ${error.message}`);
    if (!v) return { episode: null, note: `No episode under the slug ${slug}.` };

    const [cities, capacity, boarded, venue] = await Promise.all([
      cityIndex(admin),
      admin.from("episode_capacity").select("*").eq("episode_id", v.id).maybeSingle(),
      admin.from("passes").select("id", { count: "exact", head: true }).eq("episode_id", v.id).not("checked_in_at", "is", null),
      v.venue_id ? admin.from("venues").select("name, kind").eq("id", v.venue_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const c = capacity.data;
    return {
      episode: {
        ...shapeEpisode(v, cities),
        venue: venue.data ? { name: venue.data.name, kind: venue.data.kind } : null,
        capacity: {
          passes_total: c?.passes_total ?? v.passes_total,
          aboard: c?.aboard ?? 0,
          waitlisted: c?.waitlisted ?? 0,
          passes_left: c?.passes_left ?? null,
          checked_in: boarded.count ?? 0,
          standby_passes: v.standby_passes,
          held_passes: v.held_passes,
        },
      },
    };
  },
};

const listMembers: Tool = {
  name: "list_members",
  description:
    "List members — number, name, handle, tier, home city, standing. Filter by status (active, paused, departed), tier (regional, national, global), home city, and a free-text q over name, handle and member number. Never returns contact or billing details. Default limit 50, at most 200.",
  scopes: ["read:members"],
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: [...MEMBER_STATUSES] },
      tier: { type: "string", enum: [...TIERS] },
      city: { type: "string", description: "Home city, as the member's record names it." },
      q: { type: "string", description: "Matches name, handle or member number." },
      limit: { type: "integer", minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  },
  async run(admin, args) {
    const status = oneOf(args, "status", MEMBER_STATUSES);
    const tier = oneOf(args, "tier", TIERS);
    const city = str(args, "city", 80);
    const q = str(args, "q", 64);
    const limit = int(args, "limit", 50, 1, 200);

    let query = admin.from("profiles").select(MEMBER_FIELDS).order("joined_at", { ascending: false }).limit(limit);
    if (status) query = query.eq("status", status);
    if (tier) query = query.eq("tier", tier);
    if (city) query = query.ilike("home_city", clean(city));
    if (q) {
      const like = `%${clean(q)}%`;
      query = query.or(`full_name.ilike.${like},handle.ilike.${like},member_no.ilike.${like}`);
    }
    return { members: rows(await query) };
  },
};

const getMember: Tool = {
  name: "get_member",
  description:
    "One member by handle: their record (no contact or billing details), lifetime value (dues and spend in cents, first and last charge) and engagement (passes held, attended, posts, knots, last booking).",
  scopes: ["read:members"],
  inputSchema: {
    type: "object",
    properties: { handle: { type: "string" } },
    required: ["handle"],
    additionalProperties: false,
  },
  async run(admin, args) {
    const handle = need(args, "handle", 80).replace(/^@/, "");
    const { data: m, error } = await admin.from("profiles").select(MEMBER_FIELDS).eq("handle", handle).maybeSingle();
    if (error) throw new Error(`the club's records could not be read: ${error.message}`);
    if (!m) return { member: null, note: `No member under the handle @${handle}.` };
    const [value, engagement] = await Promise.all([
      admin.from("member_value").select("dues_cents, spend_cents, first_charge, last_charge").eq("profile_id", m.id).maybeSingle(),
      admin.from("member_engagement").select("passes, attended, posts, knots, last_booked_at").eq("profile_id", m.id).maybeSingle(),
    ]);
    return { member: { ...m, value: value.data ?? null, engagement: engagement.data ?? null } };
  },
};

const passesForEpisode: Tool = {
  name: "passes_for_episode",
  description:
    "The passes on one episode by slug: who holds one (name, member number, handle), their standing (aboard, waitlist, not_going), whether it is a standby or a comp, how many guests and their names, and whether they have checked in. Boarding codes are never returned.",
  scopes: ["read:passes"],
  inputSchema: {
    type: "object",
    properties: { slug: { type: "string" } },
    required: ["slug"],
    additionalProperties: false,
  },
  async run(admin, args) {
    const slug = need(args, "slug", 120);
    const { data: v, error } = await admin.from("episodes").select("id, slug, title, starts_at, time_zone").eq("slug", slug).maybeSingle();
    if (error) throw new Error(`the club's records could not be read: ${error.message}`);
    if (!v) return { episode: null, passes: [], note: `No episode under the slug ${slug}.` };

    const passes = rows(
      await admin
        .from("passes")
        .select("id, profile_id, status, standby, comp, guests, guest_names, checked_in_at, created_at")
        .eq("episode_id", v.id)
        .order("created_at", { ascending: true })
    );
    const ids = [...new Set(passes.map((p) => p.profile_id))];
    const people = ids.length
      ? rows(await admin.from("profiles").select("id, member_no, full_name, handle").in("id", ids))
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      episode: { slug: v.slug, title: v.title, starts_at: v.starts_at, time_zone: v.time_zone },
      passes: passes.map((p) => {
        const who = byId.get(p.profile_id);
        return {
          name: who?.full_name ?? null,
          member_no: who?.member_no ?? null,
          handle: who?.handle ?? null,
          standing: p.status,
          standby: p.standby,
          comp: p.comp,
          guests: p.guests,
          guest_names: p.guest_names ?? [],
          checked_in_at: p.checked_in_at,
          booked_at: p.created_at,
        };
      }),
    };
  },
};

const reportsSummary: Tool = {
  name: "reports_summary",
  description:
    "The Bridge's headline figures, as the Reports screen computes them: MRR (active subscriptions, annual plans at one twelfth), active members, pass fill across episodes that have sailed, earned and deferred house revenue this season (cents), membership cohorts and the application funnel.",
  scopes: ["read:members", "read:passes", "read:episodes"],
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async run(admin) {
    const seasonStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const nowIso = new Date().toISOString();
    const todayISO = nowIso.slice(0, 10);

    const [active, episodes, capacity, ledger, subs, plans, cohorts, funnel] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
      admin.from("episodes").select("id, status, starts_at"),
      admin.from("episode_capacity").select("episode_id, aboard, passes_total"),
      admin.from("account_ledger").select("delta_cents, service_date").lt("delta_cents", 0).gte("created_at", seasonStart),
      admin.from("subscriptions").select("status, interval, plan_id"),
      admin.from("membership_plans").select("id, price_cents, annual_price_cents"),
      admin.from("membership_cohorts").select("*"),
      admin.from("application_funnel").select("*"),
    ]);

    /* Pass fill — past + live, non-cancelled, exactly the Reports rule. */
    const cap = new Map(rows(capacity).filter((c) => c.episode_id).map((c) => [c.episode_id as string, c]));
    const sailed = rows(episodes).filter(
      (v) => v.status !== "cancelled" && (v.status === "completed" || v.status === "live" || v.starts_at <= nowIso)
    );
    const aboard = sailed.reduce((t, v) => t + (cap.get(v.id)?.aboard ?? 0), 0);
    const seats = sailed.reduce((t, v) => t + (cap.get(v.id)?.passes_total ?? 0), 0);

    /* Billed is not earned: anything with a service_date ahead of today is
       money taken for a night that has not happened. */
    const ledgerRows = rows(ledger);
    const houseCents = ledgerRows.reduce((t, l) => t + Math.abs(l.delta_cents), 0);
    const deferredCents = ledgerRows
      .filter((l) => l.service_date != null && l.service_date > todayISO)
      .reduce((t, l) => t + Math.abs(l.delta_cents), 0);

    /* Dues that recur — a year's plan carries one twelfth of itself a month. */
    const planPrice = new Map(rows(plans).map((p) => [p.id, p]));
    const liveSubs = rows(subs).filter((s) => s.status === "active");
    const mrrCents = liveSubs.reduce((total, sub) => {
      const plan = sub.plan_id ? planPrice.get(sub.plan_id) : undefined;
      if (!plan) return total;
      if (sub.interval === "year") return total + Math.round((plan.annual_price_cents ?? plan.price_cents * 12) / 12);
      return total + plan.price_cents;
    }, 0);

    return {
      as_of: nowIso,
      season_from: seasonStart,
      mrr_cents: mrrCents,
      dues_paying: liveSubs.length,
      past_due: rows(subs).filter((s) => s.status === "past_due").length,
      active_members: active.count ?? 0,
      fill: { aboard, passes_total: seats, pct: seats ? Math.round((aboard / seats) * 100) : 0, episodes_sailed: sailed.length },
      house: { billed_cents: houseCents, earned_cents: houseCents - deferredCents, deferred_cents: deferredCents },
      cohorts: rows(cohorts),
      application_funnel: rows(funnel),
    };
  },
};

type SeriesRow = { slug: string; label: string; blurb: string | null };

const search: Tool = {
  name: "search",
  description: "Search episodes, series and cities by name. Returns up to ten of each, grouped by kind.",
  scopes: ["read:episodes"],
  inputSchema: {
    type: "object",
    properties: { q: { type: "string" } },
    required: ["q"],
    additionalProperties: false,
  },
  async run(admin, args) {
    const q = clean(need(args, "q", 64));
    if (q.length < 2) return { episodes: [], series: [], cities: [], note: "Two characters or more." };
    const like = `%${q}%`;
    const [episodes, series, cities] = await Promise.all([
      admin.from("episodes").select("slug, title, status, starts_at, time_zone, series").ilike("title", like).order("starts_at", { ascending: false }).limit(10),
      moduleTables(admin).from("series").select("slug, label, blurb").or(`label.ilike.${like},slug.ilike.${like}`).limit(10),
      admin.from("cities").select("slug, name, status").or(`name.ilike.${like},slug.ilike.${like}`).limit(10),
    ]);
    return {
      episodes: rows(episodes),
      series: rows(series as { data: SeriesRow[] | null; error: { message: string } | null }),
      cities: rows(cities),
    };
  },
};

export const TOOLS: Tool[] = [listEpisodes, getEpisode, listMembers, getMember, passesForEpisode, reportsSummary, search];

/* What a key may see. tools/list answers with these and only these, so a
   model never plans around a tool it will be refused. */
export function toolsFor(key: ApiKey) {
  return TOOLS.filter((t) => t.scopes.every((s) => hasScope(key, s))).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export type CallVerdict =
  | { kind: "unknown" }
  | { kind: "forbidden"; message: string }
  | { kind: "bad_args"; message: string }
  | { kind: "result"; result: ToolResult };

export async function callTool(admin: Admin, key: ApiKey, name: string, args: Record<string, unknown>): Promise<CallVerdict> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { kind: "unknown" };
  const missing = tool.scopes.filter((s) => !hasScope(key, s));
  if (missing.length) {
    return {
      kind: "forbidden",
      message: `This key does not hold ${missing.join(", ")}, which ${tool.name} needs. Ask the Bridge for a key that does.`,
    };
  }
  try {
    const data = await tool.run(admin, args);
    return { kind: "result", result: { content: [{ type: "text", text: JSON.stringify(data) }] } };
  } catch (e) {
    if (e instanceof BadArgs) return { kind: "bad_args", message: e.message };
    /* The tool's own failure is reported inside the result, as the protocol
       asks, so the model can say so rather than the call dying. Nothing from
       the driver reaches the caller. */
    return {
      kind: "result",
      result: { isError: true, content: [{ type: "text", text: "The club's records could not be read just now. Try again shortly." }] },
    };
  }
}
