/* The two errors that mean "the machine could not answer", as opposed to the
   many that mean "this pass may not board".

   They live here, apart from the server module that used to own them, so a
   client screen can tell the two apart without importing server code. The
   kiosk needs exactly that distinction: it treated ANY error as a refusal, so
   a weak signal or a quietly expired kiosk token met a member with "Not this
   door. / Staff only." — the machine's problem, worn by the person standing in
   front of it. */
export const ERR_STAFF = "Staff only. If that's wrong, hail Shoreside.";
export const ERR_LAND = "That didn't land. Try again.";

/* True when the message tells us nothing about the pass. Everything else —
   an outstanding waiver, a sailing that has already gone — is a real answer
   and belongs on screen as written. */
export function isUnanswered(message?: string): boolean {
  return message === ERR_STAFF || message === ERR_LAND;
}
