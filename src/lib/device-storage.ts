/* What this app leaves on a device, and what happens to it at sign-out.

   The gangway caches its roster so it keeps working past the breakwater. That
   cache holds, per pass: member name, member number, vessel, guest names and
   the LIVE BOARDING CODE — the credential the gangway matches on. Nothing ever
   removed it. Sign-out cleared Cache Storage and stopped there, so a crew
   phone that was signed out, handed on or resold kept every name and code for
   every voyage it had ever opened, with no expiry and unbounded growth. That
   is the exact threat the service worker's PRIVATE list was written to close,
   left open one storage API along. */

export const GANGWAY_QUEUE_KEY = "un-gangway-queue";
export const GANGWAY_ROSTER_PREFIX = "un-gangway-roster:";
export const GALLEY_QUEUE_KEY = "un-galley-queue";

/* The Syrius-era names. A storage key is not copy, but it is also not free to
   rename: whatever is already under the old key stays on the device until
   something goes and gets it.

   Two different reasons, both of which bite:

   ROSTERS hold member names, member numbers and LIVE BOARDING CODES, and
   clearCachedRosters at sign-out is the only thing that removes them. Renaming
   the prefix without clearing the old one would strand that data on a handed-on
   crew phone for ever — reopening precisely the hole the comment above says was
   left open one storage API along.

   QUEUES are the only record that somebody walked aboard, or asked for
   something at the galley. Renaming without carrying them over would discard
   unsent work at the moment of a deploy, silently. */
/* THREE generations, not two. Keys were `lyre-*`, then `syrius-*`, now `un-*`,
   and naming only the middle one left a Lyre-era phone invisible to every
   function here: unflushedCount returned 0 while unsent check-ins sat on the
   device, so the sign-out dialog never appeared and an operator was told it was
   safe to end a session that held the only record a person walked aboard. Its
   rosters — names, member numbers, boarding codes — survived sign-out for the
   same reason, and because literalCode maps LS- onto the current prefix those
   stranded codes still open the gangway today. The leak is live, not
   historical.

   The gangway acknowledges three brand eras of codes. Device storage now
   acknowledges the same three. */
const LEGACY_QUEUE_KEYS = {
  gangway: ["syrius-gangway-queue", "lyre-gangway-queue"],
  galley: ["syrius-galley-queue", "lyre-galley-queue"],
} as const;
const LEGACY_ROSTER_PREFIXES = ["syrius-gangway-roster:", "lyre-gangway-roster:"] as const;

/* Move anything left under the old names, once, before either key is read.
   Appends rather than overwrites: a device that has already written under the
   new name must not lose those entries to a stale legacy blob. */
export function adoptLegacyDeviceStorage(): void {
  try {
    for (const [legacy, current] of [
      ...LEGACY_QUEUE_KEYS.gangway.map((k) => [k, GANGWAY_QUEUE_KEY] as const),
      ...LEGACY_QUEUE_KEYS.galley.map((k) => [k, GALLEY_QUEUE_KEY] as const),
    ]) {
      const raw = localStorage.getItem(legacy);
      if (raw === null) continue;
      const old = JSON.parse(raw);
      if (Array.isArray(old) && old.length) {
        const rawNow = localStorage.getItem(current);
        const now = rawNow ? JSON.parse(rawNow) : [];
        localStorage.setItem(current, JSON.stringify((Array.isArray(now) ? now : []).concat(old)));
      }
      localStorage.removeItem(legacy);
    }
    /* Rosters rebuild from the server, so they are dropped rather than moved —
       but they ARE dropped, because nothing else would ever remove them. */
    for (const key of Object.keys(localStorage)) {
      if (LEGACY_ROSTER_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
    }
  } catch {
    /* storage blocked or a malformed blob — never let this stop a page loading */
  }
}

/* Rosters are pure copies of server data and are rebuilt on the next load, so
   they go without ceremony. */
export function clearCachedRosters(): number {
  let removed = 0;
  try {
    for (const key of Object.keys(localStorage)) {
      /* Both names. A phone that has not loaded since the rename still holds
         boarding codes under the old prefix, and sign-out is what removes
         them. */
      if (key.startsWith(GANGWAY_ROSTER_PREFIX) || LEGACY_ROSTER_PREFIXES.some((p) => key.startsWith(p))) {
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
    for (const key of [
      GANGWAY_QUEUE_KEY,
      GALLEY_QUEUE_KEY,
      /* Counted too: a device that has not yet run the adoption still has its
         unsent stamps under the old name, and reporting zero would tell an
         operator it was safe to end the session. */
      ...LEGACY_QUEUE_KEYS.gangway,
      ...LEGACY_QUEUE_KEYS.galley,
    ]) {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) n += parsed.length;
    }
  } catch {
    /* unreadable is not the same as non-empty; say nothing rather than guess */
  }
  return n;
}
