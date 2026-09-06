import "server-only";

import { callerAddress } from "@/lib/caller-address";

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

/* Who is asking, as far as the host will say. The address is used as a bucket
   key only — it is never logged and never returned.

   THE HOP. This used to take the FIRST hop of x-forwarded-for, on the comment
   that it is "what the platform saw connect". That is true only of a proxy
   that OVERWRITES the header. The standard behaviour is to append: each proxy
   adds the address it saw, so the leftmost entry is whatever the client sent
   in a header it wrote itself, and the rightmost is the one the nearest
   trusted proxy actually observed. Off a platform that overwrites, the old
   reading let a caller mint a fresh bucket per request by rotating one header
   and the gate never fired.

   THE DEPLOYMENT. This app deploys to Vercel (.vercel/project.json, and
   next.config.ts reads VERCEL_DEPLOYMENT_ID). Vercel stamps the real peer into
   its own single-value header, which the edge sets and a client cannot
   contribute to — so that header is the answer wherever it exists, and the
   rightmost hop of x-forwarded-for is the fallback for anywhere else. Both of
   those readings already live in callerAddress(), which the gangway uses for
   the same purpose; one reading of "who is this" for the whole app, in one
   place, is the point.

   EASY TO GET WRONG THE OTHER WAY. Two failure modes were considered and
   rejected. Taking a fixed number of hops from the right needs a
   trusted-proxy count this deployment does not have and would silently key
   every caller to a proxy's own address if it were set wrong — one bucket for
   the whole site, which is the shape of the outage that shared pacing caused
   before. And refusing to key at all when no header is trustworthy has the
   same effect by another road: everything lands in one "unknown" bucket, so
   one caller can spend the limit for everyone. The fallback below is therefore
   deliberately last and deliberately narrow — it is reached only where there
   is no proxy at all, which off a platform means a deployment that should not
   be exposed directly in the first place. What this gate can and cannot
   promise is at the top of this file: it is the cheap first brake, and the
   limits that have to hold are counted in the database. */
export function clientKey(request: Request): string {
  return callerAddress(request.headers) || request.headers.get("x-real-ip")?.trim() || "unknown";
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
