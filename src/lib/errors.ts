/* One voice for database refusals.

   Guard triggers and RPCs already raise in the brand's voice ("a member number
   is issued once"), so those messages pass through with only a capital and a
   full stop added. What does not speak for itself is an RLS refusal: Postgres
   says "new row violates row-level security policy", which tells a member
   nothing.

   This USED to answer every 42501 with "your membership is on hold", on the
   reasoning that a hold is the commonest cause. Commonest is not only. The
   galley proved it: galley_orders had no member INSERT policy at all, so every
   member self-order was refused — and a member in perfect standing would have
   been told their membership was on hold, sent to a page where nothing was
   wrong, with nothing to do. Worse, it would have hidden the dead feature
   behind a plausible billing story; nobody would have looked at the policy.

   A confidently wrong message is worse than a vague one, because the reader
   cannot tell it is wrong. So: voice() no longer asserts the hold. Where the
   caller has a Supabase client — every server action does — voiceWith() asks
   is_active() and says the true thing either way. */

export type PgLikeError = { message?: string | null; code?: string | null };

/* "Paused", not "on hold": that is the word the column uses, the word the
   action uses, and the word the button a member presses uses. A hold, in this
   product, is a thing that happens to a SAILING. */
export const HOLD_MESSAGE =
  "Your membership is paused. Your page has the way back.";

/* What we can honestly say when the policy refused and we have not asked why. */
export const REFUSED_MESSAGE =
  "The club's records don't allow that just now. Shoreside can sort it.";

export function isRlsRefusal(error: PgLikeError | null | undefined): boolean {
  return (
    !!error &&
    (error.code === "42501" || /row-level security/i.test(error.message ?? ""))
  );
}

export function voice(error: PgLikeError | null | undefined): string {
  if (!error) return "That didn't land. Try again.";

  /* 42501 — insufficient privilege: the policy said no, and from here we
     cannot tell why. True and unhelpful beats specific and false; use
     voiceWith() to get the specific-and-true version. */
  if (isRlsRefusal(error)) return REFUSED_MESSAGE;

  /* 23514 — a check constraint. Postgres names the constraint, which is our
     schema talking to itself, not to a member: "new row for relation
     \"shop_order_items\" violates check constraint \"shop_order_items_qty_check\"".
     23505 is the same problem for a unique index. Neither ever speaks. */
  if (error.code === "23514" || error.code === "23505" ||
      /violates (check|unique) constraint/i.test(error.message ?? "")) {
    return "That didn't land — check the numbers and try again.";
  }

  /* 22P02 — a malformed value reached the driver, usually a bad id off a
     stale link. "invalid input syntax for type uuid" names a Postgres type at
     a member who never chose one. */
  if (error.code === "22P02" || error.code === "22007" ||
      /invalid input syntax for type/i.test(error.message ?? "")) {
    return "That link looks wrong. Try again from your manifest.";
  }

  const m = (error.message ?? "").trim();
  if (!m) return "That didn't land. Try again.";
  /* Anything still carrying database furniture is the schema talking, not us. */
  if (/relation "|column "|constraint "|violates |input syntax|type "/i.test(m)) {
    return "That didn't land. Try again.";
  }
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.?]$/.test(m) ? "" : ".");
}

/* The honest version of the 42501 branch, for callers holding a client.

   is_active() is SECURITY DEFINER, takes no arguments and is executable by
   `authenticated`, so the answer costs one round trip and is the difference
   between telling a member something true about their account and telling them
   something false about it. */
export async function voiceWith(
  supabase: { rpc: (fn: "is_active") => PromiseLike<{ data: unknown }> },
  error: PgLikeError | null | undefined
): Promise<string> {
  if (!isRlsRefusal(error)) return voice(error);
  try {
    const { data } = await supabase.rpc("is_active");
    return data === false ? HOLD_MESSAGE : REFUSED_MESSAGE;
  } catch {
    return REFUSED_MESSAGE;
  }
}
