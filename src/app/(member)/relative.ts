/* Mono-caps relative timestamps for feed rows — "12 MIN AGO", "2D AGO". */
export function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "JUST NOW";
  if (m < 60) return `${m} MIN AGO`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}H AGO`;
  const d = Math.floor(h / 24);
  return `${d}D AGO`;
}

/* Icon per notification kind. "Waves" is missing from this Lucide set —
   Droplets stands in for knots.

   The keys are notifications.kind as the DATABASE writes it, not display copy:
   twenty-eight triggers insert 'manifest' and twelve insert 'fathoms', and a
   key renamed here alone would stop matching and silently fall back to Radio
   for every one of them. Both are retired words and both are invisible to the
   gates, which grep rendered text and strip attributes before they look — so
   they are the last hand-typed retired lexicon and they cannot be retired from
   this file. Retiring them is a migration, and it has to move the column
   values and this map in the same change. */
export const KIND_ICON: Record<string, string> = {
  word: "Radio",
  manifest: "Ticket",
  weather: "Wind",
  fathoms: "Droplets",
};
