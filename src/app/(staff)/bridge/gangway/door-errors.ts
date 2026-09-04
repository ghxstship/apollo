/* What the gangway says when the person scanning is not allowed to. Plain
   module, not an actions file, so the kiosk screen can recognise it the way
   it recognises ERR_STAFF — as the machine's problem, never the member's.

   ERR_STAFF ("Staff only") was the refusal for every non-staff caller. Since
   the door became a role (door_grants, 2026-09-04) a hired crew member may
   stamp arrivals on one episode for one night, so the honest refusal for a
   caller with no live grant names the grant, not the staff flag. */
export const ERR_DOOR =
  "This door isn't yours tonight — the grant may have run out. If that's wrong, hail Shoreside.";

/* The database's own words when a standby pass is scanned and every seat is
   still taken ("no seat has come free for this standby pass"). Recognised by
   the phrase and re-said in the voice of the door. */
export const STANDBY_REFUSED =
  "No seat has come free for this standby pass yet. Hold them at the gangway — scan again when one does.";

export function isStandbyRefusal(message?: string | null): boolean {
  return /standby pass/i.test(message ?? "");
}
