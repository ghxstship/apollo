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
   values and this map in the same change.

   The five newer kinds (pass, dues, thread, crew, radar) arrived with
   notifications.href on 2026-09-04; the legacy keys stay beside them for the
   rows already written. */
export const KIND_ICON: Record<string, string> = {
  word: "Radio",
  manifest: "Ticket",
  weather: "Wind",
  fathoms: "Droplets",
  pass: "Ticket",
  dues: "Receipt",
  thread: "MessageCircle",
  crew: "Users",
  radar: "Radar",
};

/* Where a notice goes when tapped. The column is set by the writer, and the
   database derives it from the kind when the writer set none — this is the
   same table, for rows written before the column existed (which are null and
   were never touched by the insert trigger). Kept in the same order as
   a_notice_has_somewhere_to_go() so the two cannot be compared and found to
   disagree. */
const HREF_BY_KIND: Record<string, string> = {
  manifest: "/passes",
  pass: "/passes",
  weather: "/passes",
  crew: "/passes",
  fathoms: "/you#you-knots",
  dues: "/account",
  thread: "/threads",
  radar: "/radar",
};

export function noticeHref(kind: string, href: string | null | undefined): string {
  if (href && href.startsWith("/")) return href;
  return HREF_BY_KIND[kind] ?? "/inbox";
}
