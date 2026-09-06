/* What a server action actually receives.

   A server action's parameter is typed, and the type is a promise the CALLER
   makes. The caller here is whatever posts to the action's endpoint, and an
   attacker's caller promises nothing: the argument arrives as whatever they
   serialised. So `body: string` followed by `body.trim()` is a 500 the moment
   somebody sends a number, and three actions were exactly that — a crash and
   an error digest on an attacker-controlled path, found by fuzzing the action
   surface with the wrong types.

   The framework does not coerce for us and should not. This does, at the one
   place it matters: the boundary. A non-string is not an error worth naming to
   a member — no real form can produce one — so it becomes the empty string and
   meets the same "say something first" the empty case already met. */
export function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/* The same boundary, for an id.

   Every id in this schema is a uuid, and RLS owns every row an id can name, so
   a wrong one is refused by the policy and nothing escalates. What a MALFORMED
   one does is different: it never reaches a policy at all. It reaches the
   driver, which answers "invalid input syntax for type uuid", and voice()
   flattens that into a line about a link — a Postgres type name travelling most of
   the way to a member on the strength of one bad character.

   isId is the shape check, said once. It is deliberately narrow: canonical
   8-4-4-4-12 hex, either case, nothing else. The looser /^[0-9a-f-]{36}$/ that
   several files carry admits 36 dashes. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/* The numeric twin of asText.

   `passes: number` is the same promise `body: string` was, and it is broken the
   same way: the wire may send "lots", and `Math.round("lots")` is NaN, which
   every clamp in this codebase passes straight through — Math.min(96, NaN) is
   NaN, Math.max(0, NaN) is NaN — and which serialises to null on the way to
   Postgres. A clamp is not a guard.

   Two shapes, because the call sites want two different things.

   asInt REFUSES what is outside the range: the caller has stated a rule and a
   number outside it is not a number this action can act on. Null is the
   refusal; the caller says it in its own words, because only the caller knows
   whether that bound is a hull, a headcount or a number of draws.

   clampInt CARRIES a number to the nearest end of the range, and is null only
   when there was no number at all. That is for the controls that cannot
   honestly produce an out-of-range value — a stepper with min and max on it —
   where a stale tab's off-by-one is better carried than refused. Both round
   first: every column behind these is an integer. */
function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

export function asInt(v: unknown, range: { min: number; max: number }): number | null {
  const n = Math.round(toNumber(v));
  if (!Number.isFinite(n) || n < range.min || n > range.max) return null;
  return n;
}

export function clampInt(v: unknown, range: { min: number; max: number }): number | null {
  const n = Math.round(toNumber(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(range.min, Math.min(range.max, n));
}
