# The club, read from outside — the MCP endpoint

`POST /api/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server over Streamable HTTP. It lets a model — Claude, ChatGPT, anything that
speaks MCP — read the club's episodes, members, passes and headline figures
through a key the Bridge issued. It writes nothing.

- **Route:** `src/app/api/mcp/route.ts` (POST; GET and DELETE answer 405)
- **Key check:** `src/lib/mcp/auth.ts` — `Authorization: Bearer un_…`, verified
  against `api_keys` by SHA-256, exactly as the keys console minted it.
  Revoked keys are refused; `last_used_at` is stamped on every good call.
- **Tools:** `src/lib/mcp/tools.ts` — read-only, scope-checked, service role
  only after the key is good.
- **Wire:** `src/lib/mcp/jsonrpc.ts` — JSON-RPC 2.0 shapes and codes.
- **Brake:** per key, 120 calls a minute, via `src/lib/rate-limit.ts`
  (in-memory, per instance — a first gate, not a quota).
- Every answer is `Cache-Control: private, no-store`. The proxy does not run on
  this path: there is no session to refresh.

## Connecting

Cut a key on the Bridge (Keys, when the console is open) with the scopes the
caller needs. The key is shown once.

| Client | How |
| --- | --- |
| Claude (claude.ai, Claude Desktop, Claude Code) | Add a custom connector / remote MCP server: URL `https://<host>/api/mcp`, transport Streamable HTTP, header `Authorization: Bearer un_…`. In Claude Code: `claude mcp add --transport http un https://<host>/api/mcp --header "Authorization: Bearer un_…"`. |
| ChatGPT (connectors / Agents SDK) | Remote MCP server, URL `https://<host>/api/mcp`, authentication "API key" sent as `Authorization: Bearer un_…`. |
| Anything else | `POST https://<host>/api/mcp` with `Content-Type: application/json`, `Accept: application/json`, and the bearer header. Send `initialize`, then `tools/list`, then `tools/call`. |

The server is stateless: no `Mcp-Session-Id` is issued, and one sent is
ignored. It does not open an SSE stream; every request is answered whole, as
JSON. Protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05` are
accepted; JSON-RPC batches are accepted for clients on the older two.

A quick check by hand:

```sh
curl -s https://<host>/api/mcp \
  -H "Authorization: Bearer un_…" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Tools and scopes

Scopes are the four the keys console issues. `tools/list` returns only the
tools the key may call, so a model never plans around a refusal; calling a
tool the key cannot hold returns JSON-RPC error `-32001` naming the missing
scope. `write:passes` admits nothing here — the endpoint is read-only.

| Tool | Scope(s) | Arguments | Returns |
| --- | --- | --- | --- |
| `list_episodes` | `read:episodes` | `from?`, `to?` (date or ISO), `city?` (slug or name), `status?` (`scheduled` · `live` · `weather_hold` · `completed` · `cancelled`), `limit?` (≤200, default 100) | Episodes from the last 30 days onward by default, soonest first: slug, title, status, setting (afloat/ashore), experience and duration class, series, start/end, time zone, city, price and deposit (cents), by_request, min tier, passes_total, held and standby passes, sale opening. |
| `get_episode` | `read:episodes` | `slug` | One episode as above, plus venue and **capacity**: passes_total, aboard, waitlisted, passes_left, checked_in, standby_passes, held_passes. |
| `list_members` | `read:members` | `status?` (`active` · `paused` · `departed`), `tier?` (`regional` · `national` · `global`), `city?`, `q?` (name, handle or member number), `limit?` (≤200, default 50) | Member number, name, handle, tier, home city, status, hold reason, joined, staff flag, plan id. **Never** email, phone, Stripe or calendar fields. |
| `get_member` | `read:members` | `handle` | The record above, plus `value` (dues and spend in cents, first and last charge) and `engagement` (passes, attended, posts, knots, last booking). |
| `passes_for_episode` | `read:passes` | `slug` | Each pass: name, member number, handle, standing (`aboard` · `waitlist` · `not_going`), standby, comp, guests and guest names, checked_in_at, booked_at. **Never** boarding codes. |
| `reports_summary` | `read:members` + `read:passes` + `read:episodes` | — | MRR (cents; annual plans at one twelfth), dues-paying and past-due counts, active members, pass fill across episodes that have sailed, house billed / earned / deferred this season (cents), membership cohorts, application funnel. The same rules the Reports screen uses. |
| `search` | `read:episodes` | `q` (two characters or more) | Up to ten episodes, series and cities each, matched by name. |

All tools return one `text` content block holding JSON.

## Errors

HTTP `401` with `WWW-Authenticate: Bearer` when the key is missing, unknown or
revoked; `503` with `Retry-After` when the deployment holds no
`SUPABASE_SERVICE_ROLE_KEY` (no key can be read and no tool could run, so a
well-shaped key is told so in words rather than met with a 500); `429` with
`Retry-After` when a key is over its window; `413` for a body over 64 KB;
`400` for a body that is not JSON. Inside a good request the
answer is JSON-RPC: `-32601` for a method this server does not offer,
`-32602` for an unknown tool or bad arguments, `-32001` for a scope the key
lacks. A tool that fails at the database reports it inside its own result
with `isError: true`, in plain words — nothing from the driver reaches the
caller.
