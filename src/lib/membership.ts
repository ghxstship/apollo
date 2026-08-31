/* Member numbers, read the way a card is read. */
/* THE TAIL IS THE MEMBER NUMBER; the letters in front are whatever the club
   called itself when the card was printed.

   Two worktrees held contradictory answers to "where does the prefix live" and
   they share one production database: one rewrote profiles.member_no to UN- and
   renders it raw, the other left the column alone by explicit design and strips
   at render. So the till could not find a member from a card reading SYR-0034,
   from the bare 0034 its own card face shows, or from the UN-0034 now stored —
   depending which worktree answered.

   Neither answer is needed. Take the digits and match the stored value's tail,
   and the lookup survives this rebrand, the last one, and the next one.

   The tail is VALIDATED to [A-Z0-9] before it reaches a LIKE pattern. `%` and
   `_` are wildcards there, and this is operator-typed input — the same hazard
   the gangway fixed by moving off ilike, which the till never got. */
export function memberNumberTail(typed: string): string | null {
  const s = String(typed ?? "").trim().toUpperCase();
  const tail = s.includes("-") ? s.slice(s.lastIndexOf("-") + 1) : s;
  return /^[A-Z0-9]{1,12}$/.test(tail) ? tail : null;
}

/* A PostgREST `or` filter matching the number however it is stored: bare, or
   behind any prefix. Safe to interpolate because the tail is validated above. */
export function memberNumberFilter(tail: string): string {
  return `member_no.eq.${tail},member_no.like.%-${tail}`;
}
