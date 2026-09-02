import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

/**
 * the Producer's brain — a small tool-use loop over the member's own data.
 *
 * LINEAGE: the engine is Aurora, the shared intelligence of the ATLVS
 * ecosystem. "The Producer" is Aurora's [un]-facing name — same engine,
 * same confirm-first contract, different name per stage, exactly as the
 * divisions share one stage under different accents. Aurora is never named
 * in member-facing copy (it is on the brand ban list); this lineage lives in
 * code and in the ATLVS architecture only — and NOT in SYSTEM below. The
 * prompt used to name both codenames and then forbid saying them, which is a
 * strictly worse guarantee than never putting them in the context at all: a
 * member who asks the right question is asking a model to keep a secret it
 * was handed. It has no need of the name to be the Producer.
 *
 * Reads run through the member's server client, so RLS scopes every query.
 * Writes never happen here: the model proposes an action and the panel
 * renders it as a confirm-first card. No key configured → { fallback: true }
 * and the panel falls back to deterministic dead reckoning.
 */

const MODEL = "claude-haiku-4-5";
const MAX_TURNS = 6;

const SYSTEM = `You are the Producer — the confirm-first assistant of [un], a nautical social club. Episodes on the water, episodes ashore, cameras rolling. You read freely and act only through action cards the member confirms; money always asks.

Voice: a producer who respects the audience — present tense, sentence case, a little conspiratorial. No emoji. No exclamation marks. Short answers — two or three sentences at most. Data reads clean: dates, counts, and codes stated plainly. Lexicon: an episode (every event the club runs — afloat or ashore, an hour or three days, it is always an episode and never a charter, a sailing, or an event), passes (spots on an episode — never "berths"), the boarding pass (a member's own credential for an episode they hold a pass on), the manifest (the episode list and the member's RSVPs), cabins (named spaces on a hull), knots (the member's currency, code KN), weather hold (an episode paused for conditions), the inbox (show notices), Shoreside (the crew desk ashore). Sail and sailing stay as verbs — an episode sails, and it is never called a sailing.

Policy:
- Reads are answered directly from your tools. Never guess at the ledgers — read them.
- ANY write — reserving a pass, releasing a pass — must go through the propose_action tool. You never execute changes; the member confirms in the panel. After proposing, say one short line that the card below awaits their word.
- Prices are in cents; render as dollars (e.g. 12500 → $125). A price of 0 is complimentary.
- Out of scope (anything beyond the member's manifest, episodes, passes, balances, or weather), or anything that needs a person — a dispute, a refund, an accommodation, a complaint, a question about another member: reply exactly "Past my charts — hail Shoreside." and, in the same turn, call propose_action with kind "hail_shoreside" and the member's question restated in one clean line as \`question\`. Confirming that card opens a Shoreside thread in the member's name with the question already posted; a person answers there. Never answer such a question yourself.
- Never invent episodes, balances, or codes. If a tool returns nothing, say so plainly.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_upcoming_episodes",
    description:
      "List upcoming episodes on the manifest with passes remaining. Use before answering anything about which episodes have room, or before proposing a reserve action.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "get_my_manifest",
    description:
      "The member's own RSVPs — episode titles, episode status, RSVP status, and boarding codes. Use for questions about their passes, waitlist spots, or weather holds, and before proposing a release action.",
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
      "Propose a write for the member to confirm in the panel. This does NOT execute anything — it renders a confirm-first action card. Use for any reserve or release request, and for hail_shoreside when a question needs a person. Terminal: after this the turn ends.",
    input_schema: {
      type: "object" as const,
      properties: {
        kind: {
          type: "string",
          enum: ["reserve", "release", "hail_shoreside"],
          description:
            "The write being proposed: reserve a pass on an episode, release a pass on an episode, or hail Shoreside.",
        },
        episode_slug: {
          type: "string",
          description: "Slug of the episode the action targets. Required for reserve and release; omit for hail_shoreside.",
        },
        question: {
          type: "string",
          description:
            "hail_shoreside only: the member's question, restated in one clean line as they would put it to a person. Under 400 characters.",
        },
        title: { type: "string", description: "Card title, e.g. 'Release pass — Night Passage' or 'Hail Shoreside'." },
        summary: {
          type: "string",
          description: "One short line of what confirming does, in the Producer's voice.",
        },
      },
      required: ["kind", "title", "summary"],
      additionalProperties: false,
    },
  },
];

type ProposedAction = {
  kind: "reserve" | "release" | "hail_shoreside";
  episode_slug?: string;
  question?: string;
  title: string;
  summary: string;
};

/* What the panel is handed. A reserve or release without a slug is a card that
   confirms nothing, so it is refused here rather than rendered; a hail without
   a question falls back to the member's own last line in the panel. */
function shapeProposal(input: ProposedAction) {
  if (input.kind === "hail_shoreside") {
    return {
      kind: "hail_shoreside" as const,
      question: typeof input.question === "string" ? input.question.slice(0, 4000) : "",
      title: input.title || "Hail Shoreside",
      summary: input.summary,
    };
  }
  if (!input.episode_slug) return null;
  return {
    kind: input.kind,
    episode_slug: input.episode_slug,
    title: input.title,
    summary: input.summary,
  };
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

async function getUpcomingEpisodes(supabase: SupabaseServer, userId: string) {
  void userId;
  const nowIso = new Date().toISOString();
  const [episodesRes, capacityRes] = await Promise.all([
    supabase
      .from("episodes")
      .select("slug,title,setting,kind,starts_at,price_cents,min_tier,status,passes_total,id")
      .in("status", ["scheduled", "live", "weather_hold"])
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(8),
    supabase.from("episode_capacity").select("*"),
  ]);
  const left = new Map(
    (capacityRes.data ?? [])
      .filter((c): c is typeof c & { episode_id: string } => !!c.episode_id)
      .map((c) => [c.episode_id, c.passes_left ?? 0])
  );
  return (episodesRes.data ?? []).map((v) => ({
    slug: v.slug,
    title: v.title,
    class: v.setting,
    kind: v.kind,
    starts_at: v.starts_at,
    price_cents: v.price_cents,
    passes_left: left.get(v.id) ?? v.passes_total,
    min_tier: v.min_tier,
    status: v.status,
  }));
}

async function getMyManifest(supabase: SupabaseServer, userId: string) {
  const { data: passes } = await supabase
    .from("passes")
    .select("episode_id,status,guests,boarding_code")
    .eq("profile_id", userId);
  const ids = (passes ?? []).map((r) => r.episode_id);
  if (ids.length === 0) return [];
  const { data: episodes } = await supabase
    .from("episodes")
    .select("id,slug,title,starts_at,status")
    .in("id", ids)
    .order("starts_at", { ascending: true });
  const byId = new Map((episodes ?? []).map((v) => [v.id, v]));
  return (passes ?? [])
    .map((r) => {
      const v = byId.get(r.episode_id);
      if (!v) return null;
      return {
        episode_slug: v.slug,
        title: v.title,
        starts_at: v.starts_at,
        episode_status: v.status,
        pass_status: r.status,
        guests: r.guests,
        boarding_code: r.boarding_code,
      };
    })
    .filter(Boolean);
}

async function getMyBalances(supabase: SupabaseServer, userId: string) {
  const [knRes, accRes] = await Promise.all([
    supabase.from("knots_balance").select("*").eq("profile_id", userId).maybeSingle(),
    supabase.from("account_balance").select("*").eq("profile_id", userId).maybeSingle(),
  ]);
  return {
    knots: knRes.data?.balance ?? 0,
    account_cents: accRes.data?.balance_cents ?? 0,
  };
}

/* A turn a person could plausibly type. The endpoint is authenticated, but it
   spends real tokens per call, and nothing else bounded the payload — twenty-four
   messages of unbounded length is a bill, not a conversation. */
const MAX_CHARS = 4000;

/* Assistant turns are accepted by the parser and then discarded above — the
   panel still sends them, and rejecting the shape outright would break it. */
function isChatMessage(m: unknown): m is { role: "user" | "assistant"; content: string } {
  if (typeof m !== "object" || m === null) return false;
  const r = m as Record<string, unknown>;
  return (
    (r.role === "user" || r.role === "assistant") &&
    typeof r.content === "string" &&
    r.content.length <= MAX_CHARS
  );
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

  /* Before spending anything. The route had no limit at all — thirty concurrent
     requests from one member all went through, and each is up to six model
     turns. The counter lives in the database because this runs serverless and
     an in-memory bucket does not survive between invocations. */
  const { error: budget } = await supabase.rpc("take_a_producer_turn");
  if (budget) {
    return Response.json(
      { error: "The Producer needs a moment. Try again in a few minutes." },
      { status: 429 }
    );
  }

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

  /* Only the member's own turns. The client used to be able to post
     `role:"assistant"` messages, so a member could fabricate what the Producer
     had supposedly already said and steer it from there. The tools can only
     reach the caller's own rows, so this was steering rather than disclosure —
     but a transcript the client writes is not a transcript. */
  const messages: Anthropic.MessageParam[] = raw
    .filter((m) => m.role === "user")
    .slice(-12)
    .map((m) => ({ role: "user" as const, content: m.content }));
  if (messages.length === 0) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  /* Six turns at the SDK's ten-minute default would hold one serverless
     invocation for an hour. Twenty seconds a turn, one retry. */
  const anthropic = new Anthropic({ timeout: 20_000, maxRetries: 1 });

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
        const action = shapeProposal(proposal.input as ProposedAction);
        const reply =
          textOf(response.content) ||
          (action?.kind === "hail_shoreside"
            ? "Past my charts — hail Shoreside."
            : "Your call — confirm below and I'll see it logged.");
        return Response.json(action ? { reply, action } : { reply });
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
          if (tu.name === "get_upcoming_episodes") out = await getUpcomingEpisodes(supabase, user.id);
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
