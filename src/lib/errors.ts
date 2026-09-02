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
   product, is a thing that happens to an EPISODE. */
/* "Your page" named nothing. The destination has a name — You — and the nav
   label, the tab, the title and the h1 all carry it, so the refusal carries it
   too rather than sending a member to look for a page nobody calls that. */
export const HOLD_MESSAGE =
  "Your membership is paused. Resume it on the You page.";

/* What we can honestly say when the policy refused and we have not asked why. */
export const REFUSED_MESSAGE =
  "The club's records don't allow that just now. Shoreside can sort it.";

/* Card payments are handed off to Stripe by the /api/stripe/* routes, and when
   that hand-off does not come back there is one thing to say about it. It was
   declared three times across two files and said "the processor", which is a
   word from the engineering side of the wall — a member has a card, not a
   processor. Named once here, and it names the way out, because dues really
   are settled with Shoreside while the hand-off is down (see /account). */
export const CARD_UNAVAILABLE =
  "Card payments aren't going through just now. Try again shortly, or settle with Shoreside.";

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
    /* This used to say "try again from your manifest", which named a retired
       surface AND aimed at /manifest, a route that 308s to /passes. Sending a
       member to a moved route is the worst thing a refusal can do.

       It names no route now, on the same reasoning as the 42501 branch above:
       a malformed id reaches here from the galley, the shop and the agreements
       as readily as from a pass, so any route named here is right some of the
       time and confidently wrong the rest of it. */
    return "That link looks wrong. Start again from the page that offered it.";
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
