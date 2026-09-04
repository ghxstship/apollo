import "server-only";

/* A best-effort brake on the public routes — search on every keystroke, and
   the first hop of the Producer before the database counts a real turn.

   HONEST ABOUT WHAT IT IS. The window lives in the memory of one server
   instance, so on a serverless host every instance has its own and a cold
   start begins at zero. It stops one client hammering one instance; it is not
   a quota, and anything that spends money (the Producer's model turns) keeps
   its real limit in the database, where take_a_producer_turn counts across
   every instance. Treat this as the cheap first gate, never the only one. */

type Window = { count: number; resetAt: number };

const WINDOWS = new Map<string, Window>();
const SWEEP_EVERY = 5_000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY) return;
  lastSweep = now;
  for (const [key, w] of WINDOWS) if (w.resetAt <= now) WINDOWS.delete(key);
}

/* True when the key has already spent its allowance in the current window. */
export function overLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const w = WINDOWS.get(key);
  if (!w || w.resetAt <= now) {
    WINDOWS.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  w.count += 1;
  return w.count > limit;
}

/* Who is asking, as far as the host will say. The first hop of
   x-forwarded-for is what the platform saw connect; anything after it is
   whatever the client chose to write. The address is used as a bucket key
   only — it is never logged and never returned. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

/* The one answer a throttled caller gets. JSON, so a client that reads the
   body finds a shape it already knows, and no-store so nothing in between
   remembers the refusal. */
export function tooMany(body: Record<string, unknown>, retryAfterSeconds: number): Response {
  return Response.json(body, {
    status: 429,
    headers: {
      "Cache-Control": "private, no-store",
      "Retry-After": String(retryAfterSeconds),
    },
  });
}
