import { NextResponse } from "next/server";
import { overLimit, tooMany } from "@/lib/rate-limit";
import { verifyKey, type Admin, type ApiKey } from "@/lib/mcp/auth";
import {
  FORBIDDEN,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  fail,
  hasId,
  isRequest,
  ok,
  params,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@/lib/mcp/jsonrpc";
import { callTool, toolsFor } from "@/lib/mcp/tools";

/* The club, read from outside: a Model Context Protocol server over
   Streamable HTTP. One address, POST only, JSON-RPC 2.0 in and out.

   AUTHENTICATION IS THE KEY, NOT THE COOKIE. Every call carries
   `Authorization: Bearer un_…` and is verified against api_keys exactly as
   the keys console minted it (a SHA-256 of the key, looked up by equality).
   The proxy does not run on this path — there is no session to refresh — so
   nothing here may assume one. Once the key is good the tools run on the
   service role, and every tool is checked against the key's scopes before a
   query runs; see lib/mcp/tools.ts for what each one returns and withholds.

   Stateless on purpose. The spec allows a server to keep a session and to
   stream over SSE; this one does neither. Every request is answered whole,
   as JSON, and GET answers 405 as the spec permits a server that does not
   offer a stream. A client that sends a session id gets it ignored, which the
   spec also permits. Nothing here is cached: every answer is no-store.

   Rate-limited PER KEY with the in-memory brake — a best-effort gate on one
   instance, honest about what it is (see lib/rate-limit.ts). */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/* Newest first; the initialize handshake echoes the client's version when
   it is one of these and offers the newest otherwise. */
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const SERVER = { name: "[un] Bridge", version: "1.0.0" };

const INSTRUCTIONS =
  "Read-only tools about [un], a social club run as a series of episodes — every event, afloat or ashore, is an episode. " +
  "Members hold passes on episodes. Money is in cents. Nothing here writes; nothing here returns contact details or boarding codes.";

/* Body cap. A JSON-RPC request about the club fits in a few kilobytes; a
   body past this is not one. */
const MAX_BODY = 64 * 1024;

/* Per key: two calls a second sustained. Past that the key waits, not the
   database. */
const LIMIT = 120;
const WINDOW_MS = 60_000;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function unauthorized(message: string) {
  return json(fail(null, INVALID_REQUEST, message), 401, {
    "WWW-Authenticate": 'Bearer realm="[un] Bridge"',
  });
}

export async function POST(request: Request) {
  const verdict = await verifyKey(request);
  if (!verdict.ok) return unauthorized(verdict.message);
  const { key, admin } = verdict;

  if (overLimit(`mcp:${key.id}`, LIMIT, WINDOW_MS)) {
    return tooMany(fail(null, INVALID_REQUEST, "This key is calling faster than the club answers. Wait half a minute."), 30);
  }

  /* Read the body as text first: a cap needs the length, and a parse error
     needs to be a JSON-RPC parse error rather than an exception. */
  const text = await request.text();
  if (text.length > MAX_BODY) {
    return json(fail(null, INVALID_REQUEST, "That request is larger than any call the club takes."), 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(fail(null, PARSE_ERROR, "That was not JSON."), 400);
  }

  /* One message, or — for clients on the 2025-03-26 protocol — a batch. A
     batch of nothing is a malformed request, per JSON-RPC. */
  const messages = Array.isArray(body) ? body : [body];
  if (messages.length === 0) return json(fail(null, INVALID_REQUEST, "An empty batch asks nothing."), 400);

  const replies: JsonRpcResponse[] = [];
  for (const m of messages) {
    if (!isRequest(m)) {
      replies.push(fail(null, INVALID_REQUEST, "Each message needs jsonrpc: \"2.0\" and a method."));
      continue;
    }
    if (!hasId(m)) continue; /* a notification — acknowledged by silence */
    replies.push(await answer(m, key, admin));
  }

  /* Only notifications: 202 Accepted with no body, as the spec asks. */
  if (replies.length === 0) return new Response(null, { status: 202, headers: NO_STORE });

  return json(Array.isArray(body) ? replies : replies[0]);
}

async function answer(m: JsonRpcRequest, key: ApiKey, admin: Admin): Promise<JsonRpcResponse> {
  const id = m.id ?? null;
  const p = params(m);

  switch (m.method) {
    case "initialize": {
      const asked = typeof p.protocolVersion === "string" ? p.protocolVersion : "";
      return ok(id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: toolsFor(key) });
    case "tools/call": {
      const name = typeof p.name === "string" ? p.name : "";
      const args = p.arguments && typeof p.arguments === "object" && !Array.isArray(p.arguments)
        ? (p.arguments as Record<string, unknown>)
        : {};
      if (!name) return fail(id, INVALID_PARAMS, "tools/call needs a tool name.");
      const verdict = await callTool(admin, key, name, args);
      switch (verdict.kind) {
        case "unknown":
          return fail(id, INVALID_PARAMS, `No tool called ${name}. tools/list names the ones this key may call.`);
        case "forbidden":
          return fail(id, FORBIDDEN, verdict.message);
        case "bad_args":
          return fail(id, INVALID_PARAMS, verdict.message);
        case "result":
          return ok(id, verdict.result);
      }
      return fail(id, INTERNAL_ERROR, "That didn't land. Try again.");
    }
    /* Capabilities this server does not declare. A client that asks anyway
       gets the method-not-found the spec reserves for it. */
    default:
      return fail(id, METHOD_NOT_FOUND, `The club does not answer ${m.method}.`);
  }
}

/* No stream is offered, so GET has nothing to open; no session is kept, so
   DELETE has nothing to close. 405 for both, as the spec allows. */
function notAllowed() {
  return json(fail(null, INVALID_REQUEST, "POST a JSON-RPC message; this server keeps no stream and no session."), 405, {
    Allow: "POST",
  });
}

export function GET() {
  return notAllowed();
}

export function DELETE() {
  return notAllowed();
}
