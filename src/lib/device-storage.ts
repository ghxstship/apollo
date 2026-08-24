/* What this app leaves on a device, and what happens to it at sign-out.

   The gangway caches its roster so it keeps working past the breakwater. That
   cache holds, per pass: member name, member number, vessel, guest names and
   the LIVE BOARDING CODE — the credential the gangway matches on. Nothing ever
   removed it. Sign-out cleared Cache Storage and stopped there, so a crew
   phone that was signed out, handed on or resold kept every name and code for
   every voyage it had ever opened, with no expiry and unbounded growth. That
   is the exact threat the service worker's PRIVATE list was written to close,
   left open one storage API along. */

export const GANGWAY_QUEUE_KEY = "syrius-gangway-queue";
export const GANGWAY_ROSTER_PREFIX = "syrius-gangway-roster:";
export const GALLEY_QUEUE_KEY = "syrius-galley-queue";

/* Rosters are pure copies of server data and are rebuilt on the next load, so
   they go without ceremony. */
export function clearCachedRosters(): number {
  let removed = 0;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(GANGWAY_ROSTER_PREFIX)) {
        localStorage.removeItem(key);
        removed++;
      }
    }
  } catch {
    /* storage blocked — nothing to clear */
  }
  return removed;
}

/* The QUEUES are not copies of anything. A queued gangway stamp is the only
   record that a person physically walked aboard, and a queued galley order is
   the only record of something a member asked for. Wiping them at sign-out
   would destroy exactly what the offline path exists to protect, so this
   deliberately does NOT clear them — it reports what is still waiting, and the
   caller asks the operator before ending the session. Keeping a record that
   matters at the cost of a code sitting one more shift on a crew phone is the
   right side of that trade; losing it is not recoverable, and the manifest is
   what an evacuation is read from. */
export function unflushedCount(): number {
  let n = 0;
  try {
    for (const key of [GANGWAY_QUEUE_KEY, GALLEY_QUEUE_KEY]) {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) n += parsed.length;
    }
  } catch {
    /* unreadable is not the same as non-empty; say nothing rather than guess */
  }
  return n;
}
