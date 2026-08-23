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

  /* 23514 — a check constraint. Postgres names the constraint, which is our
     schema talking to itself, not to a member: "new row for relation
     \"shop_order_items\" violates check constraint \"shop_order_items_qty_check\"".
     23505 is the same problem for a unique index. Neither ever speaks. */
  if (error.code === "23514" || error.code === "23505" ||
      /violates (check|unique) constraint/i.test(error.message ?? "")) {
    return "That didn't land — check the numbers and try again.";
  }

  const m = (error.message ?? "").trim();
  if (!m) return "That didn't land. Try again.";
  /* Anything still carrying database furniture is the schema talking, not us. */
  if (/relation "|column "|constraint "|violates /i.test(m)) {
    return "That didn't land. Try again.";
  }
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.?]$/.test(m) ? "" : ".");
}
