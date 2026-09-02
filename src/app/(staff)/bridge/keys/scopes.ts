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
