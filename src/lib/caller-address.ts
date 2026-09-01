/* The visitor's address for pacing buckets. `x-forwarded-for` is appended to
   by every proxy in the chain, so its LEFTMOST entry is whatever the client
   chose to send — an attacker's own bucket key. Vercel stamps the real peer in
   its own single-value header; failing that, the rightmost hop is the one the
   last trusted proxy saw. */
export function callerAddress(h: Headers): string | null {
  const vercel = h.get("x-vercel-forwarded-for")?.trim();
  if (vercel) return vercel.split(",").pop()?.trim() || null;
  const chain = h.get("x-forwarded-for") ?? "";
  return chain.split(",").pop()?.trim() || null;
}
