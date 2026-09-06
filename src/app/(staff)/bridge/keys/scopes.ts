/* Plain module, not an actions file — a "use server" module may only export
   async functions, and both the form and the guard need these lists. */
export const SCOPES = ["read:members", "read:episodes", "read:passes", "write:passes"] as const;

export const HOOK_EVENTS = [
  "pass.confirmed",
  "pass.cancelled",
  "episode.scheduled",
  "episode.weather_hold",
  "episode.completed",
  "member.joined",
  "dues.failed",
] as const;

/* How long a key runs. Four lengths and a deliberate fifth choice.

   The set is a UI vocabulary and lives in code; WHICH of them opens selected
   is a dial the owner turns — club_settings.api_key_days, read by the page.
   Ninety is what it holds today.

   "No end" is not removed, because a partner integration that must not break
   on a Tuesday is a real thing to want. It is no longer free: a key cut with
   no end carries a sentence saying why, kept on the row, and the database
   refuses one without it. */
export const KEY_DAYS = [30, 90, 180, 365] as const;
export type KeyDays = (typeof KEY_DAYS)[number];

/* The fallback when club_settings has not been read or holds something the
   console does not offer. */
export const KEY_DAYS_FALLBACK = 90;

/* A reason short enough to be a shrug is not a reason. Long enough to name the
   integration and who to ask, short enough for a table cell. */
export const NO_END_REASON_MIN = 12;
export const NO_END_REASON_MAX = 240;
