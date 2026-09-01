import { FAMILY_LABEL } from "@/lib/brand";
import type { VoyageRow } from "@/lib/supabase/types";

/* iCalendar plumbing — RFC 5545 to the letter the calendars actually read:
   CRLF endings, escaped text, UTC stamps, 75-octet folding. */

const PRODID = "-//UNHINGED SOCIAL//Signal//EN";
const DEFAULT_HOURS = 3;

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function stamp(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/* Fold on octets, not characters — em dashes are three bytes each. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  const decoder = new TextDecoder();
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    /* Never split a UTF-8 sequence — back off past continuation bytes. */
    while (end > start + 1 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    out.push(decoder.decode(bytes.slice(start, end)));
    start = end;
    limit = 74;
  }
  return out.join("\r\n ");
}

export type CalendarEvent = {
  uid: string;
  start: string;
  end: string;
  summary: string;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  alarm?: string | null;
  /* A calendar strikes a cancelled event and greys a tentative one; hardcoding
     CONFIRMED published a called-off sailing as going ahead. */
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
};

/* A calendar client greys a tentative event and strikes a cancelled one. */
export function icsStatus(status: string | null | undefined): "CONFIRMED" | "TENTATIVE" | "CANCELLED" {
  if (status === "cancelled") return "CANCELLED";
  if (status === "weather_hold") return "TENTATIVE";
  return "CONFIRMED";
}

export function voyageWindow(voyage: Pick<VoyageRow, "starts_at" | "ends_at">): {
  start: string;
  end: string;
} {
  const start = new Date(voyage.starts_at);
  const end = voyage.ends_at
    ? new Date(voyage.ends_at)
    : new Date(start.getTime() + DEFAULT_HOURS * 60 * 60 * 1000);
  return { start: stamp(start), end: stamp(end) };
}

export function voyageSummary(voyage: Pick<VoyageRow, "title" | "class">): string {
  return `${voyage.title} — ${FAMILY_LABEL[voyage.class] ?? "Sea Day"}`;
}

export function voyageLocation(
  voyage: Pick<VoyageRow, "coordinates" | "muster">
): string | null {
  return [voyage.muster, voyage.coordinates].filter(Boolean).join(" · ") || null;
}

export function buildCalendar(name: string, events: CalendarEvent[]): string {
  const now = stamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:UTC",
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${event.start}`,
      `DTEND:${event.end}`,
      `SUMMARY:${escapeText(event.summary)}`
    );
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push(
      `STATUS:${event.status ?? "CONFIRMED"}`,
      "TRANSP:OPAQUE",
      /* A day's warning — the same margin a weather hold is called on. */
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT24H",
      `DESCRIPTION:${escapeText(event.alarm ?? event.summary)}`,
      "END:VALARM",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function icsResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
