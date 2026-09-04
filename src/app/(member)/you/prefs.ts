/* The notification-preference vocabulary, shared by the form and the action
   that saves it. Not in actions.ts because a "use server" module may export
   only async functions.

   Categories are the keys the database fan-out reads off notification_prefs;
   channels live under prefs.channels. Both lists are the whole vocabulary —
   the action drops anything else on the wire. */
export const PREF_CATEGORIES = ["weather", "berths", "threads", "radar", "dues", "fathoms", "digest"] as const;
export const PREF_CHANNELS = ["push", "email", "sms"] as const;
export type PrefCategory = (typeof PREF_CATEGORIES)[number];
export type PrefChannel = (typeof PREF_CHANNELS)[number];

export type NotificationPrefs = {
  categories: Record<PrefCategory, boolean>;
  channels: Record<PrefChannel, boolean>;
};

/* Every key missing from the stored object reads TRUE at every reader — the
   column default and every trigger coalesce it true — so the screen must say
   the same thing the fan-out does. */
export function readPrefs(raw: unknown): NotificationPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ch = (o.channels && typeof o.channels === "object" ? o.channels : {}) as Record<string, unknown>;
  const bool = (v: unknown) => (typeof v === "boolean" ? v : true);
  const categories = {} as Record<PrefCategory, boolean>;
  for (const c of PREF_CATEGORIES) categories[c] = bool(o[c]);
  const channels = {} as Record<PrefChannel, boolean>;
  for (const c of PREF_CHANNELS) channels[c] = bool(ch[c]);
  return { categories, channels };
}
