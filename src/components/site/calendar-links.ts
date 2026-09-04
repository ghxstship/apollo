/* Quick-add links for the two web calendars beside the .ics — built from the
   episode's own window and title, on the city, never the venue: the address
   comes with the pass, and a calendar link is copied around. The three-hour
   default for an episode with no stated end is the .ics route's own
   (src/app/api/calendar/ics.ts DEFAULT_HOURS), so the two agree. */

const DEFAULT_HOURS = 3;

export interface CalendarWindow {
  title: string;
  startsAt: string;
  endsAt: string | null;
  location?: string | null;
  details?: string | null;
}

function windowOf(w: CalendarWindow): { start: Date; end: Date } {
  const start = new Date(w.startsAt);
  const end = w.endsAt ? new Date(w.endsAt) : new Date(start.getTime() + DEFAULT_HOURS * 60 * 60 * 1000);
  return { start, end };
}

/* 20260912T230000Z — Google's compact UTC stamp. */
function compact(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

export function googleCalendarUrl(w: CalendarWindow): string {
  const { start, end } = windowOf(w);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: w.title,
    dates: `${compact(start)}/${compact(end)}`,
  });
  if (w.details) params.set("details", w.details);
  if (w.location) params.set("location", w.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(w: CalendarWindow): string {
  const { start, end } = windowOf(w);
  const params = new URLSearchParams({
    rru: "addevent",
    path: "/calendar/action/compose",
    subject: w.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });
  if (w.details) params.set("body", w.details);
  if (w.location) params.set("location", w.location);
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}
