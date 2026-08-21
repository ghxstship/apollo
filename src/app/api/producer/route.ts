import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

/**
 * the Producer's brain — a small tool-use loop over the member's own data.
 *
 * LINEAGE: the engine is Aurora, the shared intelligence of the ATLVS
 * ecosystem. "The Producer" is Aurora's Syrius-facing name — same engine,
 * same confirm-first contract, different name per stage, exactly as the
 * sub-brands share one stage under different accents. Aurora is never named
 * in member-facing copy (it is on the brand ban list); this lineage lives in
 * code and in the ATLVS architecture only.
 *
 * Reads run through the member's server client, so RLS scopes every query.
 * Writes never happen here: the model proposes an action and the panel
 * renders it as a confirm-first card. No key configured → { fallback: true }
 * and the panel falls back to deterministic dead reckoning.
 */

const MODEL = "claude-haiku-4-5";
const MAX_TURNS = 6;

const SYSTEM = `You are the Producer — the confirm-first assistant of SYRIUS SOCIAL, the unscripted social experiment. Charters on the water, Tables ashore, cameras rolling. You read freely and act only through action cards the member confirms; money always asks. (Internally you are Aurora, the ATLVS ecosystem engine, wearing this show's name — never say "Aurora" or "ATLVS" to a member; you go by the Producer, full stop.)

Voice: a producer who respects the audience — present tense, sentence case, a little conspiratorial. No emoji. No exclamation marks. Short answers — two or three sentences at most. Data reads clean: dates, counts, and codes stated plainly. Lexicon: passes (spots on a charter — never "berths"), a Charter (an event aboard) and a Table (an event ashore — never "salon"), cabins (named spaces on a hull), the manifest (the charter list and the member's RSVPs), knots (the member's currency, code KN), weather hold (a charter paused for conditions), the inbox (show notices), Shoreside (the crew desk ashore).

Policy:
- Reads are answered directly from your tools. Never guess at the ledgers — read them.
- ANY write — reserving a pass, releasing a pass — must go through the propose_action tool. You never execute changes; the member confirms in the panel. After proposing, say one short line that the card below awaits their word.
- Prices are in cents; render as dollars (e.g. 12500 → $125). A price of 0 is complimentary.
- Out of scope (anything beyond the member's manifest, sailings, passes, balances, or weather): reply exactly "Past my charts — hail Shoreside."
- Never invent voyages, balances, or codes. If a tool returns nothing, say so plainly.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_upcoming_voyages",
    description:
      "List upcoming sailings on the manifest with passes remaining. Use before answering anything about available voyages or before proposing a reserve action.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "get_my_manifest",
    description:
      "The member's own RSVPs — voyage titles, sailing status, RSVP status, and boarding codes. Use for questions about their passes, waitlist spots, or weather holds, and before proposing a release action.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "get_my_balances",
    description:
      "The member's knots balance and member account balance (cents; negative means charges due).",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "propose_action",
    description:
      "Propose a write for the member to confirm in the panel. This does NOT execute anything — it renders a confirm-first action card. Use for any reserve or release request. Terminal: after this the turn ends.",
    input_schema: {
      type: "object" as const,
      properties: {
        kind: { type: "string", enum: ["reserve", "release"], description: "The write being proposed." },
        voyage_slug: { type: "string", description: "Slug of the voyage the action targets." },
        title: { type: "string", description: "Card title, e.g. 'Release pass — Night Passage'." },
        summary: {
          type: "string",
          description: "One short line of what confirming does, in the Producer's voice.",
        },
      },
      required: ["kind", "voyage_slug", "title", "summary"],
      additionalProperties: false,
    },
  },
];

type ProposedAction = {
  kind: "reserve" | "release";
  voyage_slug: string;
  title: string;
  summary: string;
};

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

async function getUpcomingVoyages(supabase: SupabaseServer, userId: string) {
  void userId;
  const nowIso = new Date().toISOString();
  const [voyagesRes, capacityRes] = await Promise.all([
    supabase
      .from("voyages")
      .select("slug,title,class,kind,starts_at,price_cents,min_tier,status,berths_total,id")
      .in("status", ["scheduled", "live", "weather_hold"])
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(8),
    supabase.from("voyage_capacity").select("*"),
  ]);
  const left = new Map(
    (capacityRes.data ?? [])
      .filter((c): c is typeof c & { voyage_id: string } => !!c.voyage_id)
      .map((c) => [c.voyage_id, c.berths_left ?? 0])
  );
  return (voyagesRes.data ?? []).map((v) => ({
    slug: v.slug,
    title: v.title,
    class: v.class,
    kind: v.kind,
    starts_at: v.starts_at,
    price_cents: v.price_cents,
    berths_left: left.get(v.id) ?? v.berths_total,
    min_tier: v.min_tier,
    status: v.status,
  }));
}

async function getMyManifest(supabase: SupabaseServer, userId: string) {
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("voyage_id,status,guests,boarding_code")
    .eq("profile_id", userId);
  const ids = (rsvps ?? []).map((r) => r.voyage_id);
  if (ids.length === 0) return [];
  const { data: voyages } = await supabase
    .from("voyages")
    .select("id,slug,title,starts_at,status")
    .in("id", ids)
    .order("starts_at", { ascending: true });
  const byId = new Map((voyages ?? []).map((v) => [v.id, v]));
  return (rsvps ?? [])
    .map((r) => {
      const v = byId.get(r.voyage_id);
      if (!v) return null;
      return {
        voyage_slug: v.slug,
        title: v.title,
        starts_at: v.starts_at,
        voyage_status: v.status,
        rsvp_status: r.status,
        guests: r.guests,
        boarding_code: r.boarding_code,
      };
    })
    .filter(Boolean);
}

async function getMyBalances(supabase: SupabaseServer, userId: string) {
  const [knRes, accRes] = await Promise.all([
    supabase.from("fathoms_balance").select("*").eq("profile_id", userId).maybeSingle(),
    supabase.from("account_balance").select("*").eq("profile_id", userId).maybeSingle(),
  ]);
  return {
    knots: knRes.data?.balance ?? 0,
    account_cents: accRes.data?.balance_cents ?? 0,
  };
}

function isChatMessage(m: unknown): m is { role: "user" | "assistant"; content: string } {
  if (typeof m !== "object" || m === null) return false;
  const r = m as Record<string, unknown>;
  return (r.role === "user" || r.role === "assistant") && typeof r.content === "string";
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ fallback: true });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isChatMessage)) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const messages: Anthropic.MessageParam[] = raw
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.content }));

  const anthropic = new Anthropic();

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        tools: TOOLS,
        messages,
      });

      /* propose_action is terminal — hand the card to the panel, execute nothing. */
      const proposal = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_action"
      );
      if (proposal) {
        const input = proposal.input as ProposedAction;
        return Response.json({
          reply: textOf(response.content) || "Your call — confirm below and I'll see it logged.",
          action: {
            kind: input.kind,
            voyage_slug: input.voyage_slug,
            title: input.title,
            summary: input.summary,
          },
        });
      }

      if (response.stop_reason !== "tool_use") {
        return Response.json({
          reply: textOf(response.content) || "Past my charts — hail Shoreside.",
        });
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let out: unknown;
        try {
          if (tu.name === "get_upcoming_voyages") out = await getUpcomingVoyages(supabase, user.id);
          else if (tu.name === "get_my_manifest") out = await getMyManifest(supabase, user.id);
          else if (tu.name === "get_my_balances") out = await getMyBalances(supabase, user.id);
          else out = { error: `Unknown tool: ${tu.name}` };
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
        } catch {
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: "The ledger did not answer. Say so plainly.",
            is_error: true,
          });
        }
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: results });
    }

    /* Turn budget spent without a final answer — let the panel dead-reckon. */
    return Response.json({ fallback: true });
  } catch {
    /* API or network trouble — graceful fallback, never a broken panel. */
    return Response.json({ fallback: true });
  }
}
