/* One voice for database refusals.

   Guard triggers and RPCs already raise in the brand's voice ("a member number
   is issued once"), so those messages pass through with only a capital and a
   full stop added. What does not speak for itself is an RLS refusal: Postgres
   says "new row violates row-level security policy", which tells a member
   nothing. The commonest reason a member's write is refused by policy is that
   their membership is on hold, so that is what we say. */

export type PgLikeError = { message?: string | null; code?: string | null };

export const HOLD_MESSAGE =
  "Your membership is on hold. Resume it on your page and this opens back up.";

export function voice(error: PgLikeError | null | undefined): string {
  if (!error) return "That didn't land. Try again.";

  /* 42501 — insufficient privilege: the policy said no. */
  if (error.code === "42501" || /row-level security/i.test(error.message ?? "")) {
    return HOLD_MESSAGE;
  }

  const m = (error.message ?? "").trim();
  if (!m) return "That didn't land. Try again.";
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.?]$/.test(m) ? "" : ".");
}
