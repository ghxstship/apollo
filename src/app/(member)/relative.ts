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
   Droplets stands in for knots (the "fathoms" kind is legacy plumbing). */
export const KIND_ICON: Record<string, string> = {
  word: "Radio",
  manifest: "Ticket",
  weather: "Wind",
  fathoms: "Droplets",
};
