"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* Too many sections for one undifferentiated row, so the nav is grouped: the
   episode itself, the people, the evening as it runs, the money, then the
   instruments. Hairlines mark the seams; labels stay one word wherever they
   can. */
const GROUPS = [
  [
    ["/bridge", "Applications"],
    ["/bridge/gangway", "Gangway"],
    ["/bridge/manifests", "Manifests"],
    /* The route segment is legacy plumbing, like the table it reads; the tab
       says what the console is for. */
    ["/bridge/episodes", "Episodes"],
    ["/bridge/itinerary", "Itinerary"],
    ["/bridge/composition", "Composition"],
    ["/bridge/program", "Program"],
  ],
  [
    ["/bridge/members", "Members"],
    ["/bridge/vetting", "Vetting"],
    ["/bridge/questions", "Questions"],
    ["/bridge/polls", "Polls"],
    ["/bridge/shoreside", "Shoreside"],
    ["/bridge/moderation", "Moderation"],
    ["/bridge/media", "Media"],
    ["/bridge/crew", "Crew"],
    ["/bridge/regattas", "Regattas"],
  ],
  [
    ["/bridge/radar", "Radar"],
    ["/bridge/tonight", "Tonight"],
    ["/bridge/envelopes", "Envelopes"],
    ["/bridge/elements", "Elements"],
  ],
  [
    ["/bridge/orders", "Orders"],
    ["/bridge/galley", "Galley"],
    ["/bridge/codes", "Codes"],
    ["/bridge/documents", "Documents"],
  ],
  [
    ["/bridge/plans", "Plans"],
    ["/bridge/pnl", "P&L"],
    ["/bridge/tax", "Tax"],
    ["/bridge/fleet", "Fleet"],
    ["/bridge/broadcast", "Broadcast"],
    ["/bridge/letters", "Letters"],
    ["/bridge/reports", "Reports"],
    ["/bridge/referrals", "Referrals"],
    ["/bridge/sponsors", "Sponsors"],
    ["/bridge/proposals", "Proposals"],
    ["/bridge/automations", "Automations"],
    ["/bridge/keys", "Keys"],
  ],
] as const;

/* What each group is about, for the rail's headings. The strip has no room for
   them and says it with hairlines instead. */
const GROUP_LABELS = ["The episode", "The people", "The evening", "The money", "Instruments"] as const;

function isCurrent(pathname: string, href: string) {
  if (href === "/bridge") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/* `hidden` names consoles a setting has closed (the keys console until a
   partner needs one); the layout reads the setting and the page answers 404
   on the same key, so a tab never points at a door that is shut. */

/* The strip scrolls and the current tab may be anywhere in it — an operator
   on Keys, the last link of the last group, arrived at a nav scrolled to
   Applications with no sign their own section was on it. Bring the current
   link into view on mount and on every move. block:"nearest" so the page
   itself never scrolls: this must not fight the sticky header or steal the
   reader's place in a long table. The rail is tall rather than wide and gets
   the same treatment for the same reason. */
function useCurrentIntoView(pathname: string) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
      inline: "center",
      block: "nearest",
    });
  }, [pathname]);
  return ref;
}

export function HmTabs({ hidden = [] }: { hidden?: readonly string[] }) {
  const pathname = usePathname();
  const strip = useCurrentIntoView(pathname);
  return (
    <nav className="hm-tabs" aria-label="Bridge sections">
      <div className="hm-tabs__in" ref={strip}>
        {GROUPS.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 ? <span className="hm-tabs__sep" aria-hidden="true" /> : null}
            {group.filter(([href]) => !hidden.includes(href)).map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={isCurrent(pathname, href) ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </React.Fragment>
        ))}
      </div>
    </nav>
  );
}

/* The same five groups as a left rail, for a wide screen. Forty-odd links in
   one scrolling row hid most of the console; a rail shows every group at once
   with its name over it. The strip stays for anything narrower than 1280px —
   the stylesheet shows one and hides the other, never both. */
export function HmRail({ hidden = [] }: { hidden?: readonly string[] }) {
  const pathname = usePathname();
  const rail = useCurrentIntoView(pathname);
  return (
    <nav className="hm-rail" aria-label="Bridge sections">
      <div className="hm-rail__in" ref={rail}>
        {GROUPS.map((group, gi) => (
          <div className="hm-rail__group" key={gi}>
            <span className="hm-rail__label">{GROUP_LABELS[gi]}</span>
            {group.filter(([href]) => !hidden.includes(href)).map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={isCurrent(pathname, href) ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

/* Ship's clock — mono line, minute resolution. Renders empty on the server
   and fills on mount so hydration stays quiet. */
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function clockLine(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")} · ${hh}:${mm}`;
}

export function HmClock() {
  const [line, setLine] = React.useState("");
  React.useEffect(() => {
    const tick = () => setLine(clockLine(new Date()));
    tick();
    const h = setInterval(tick, 30_000);
    return () => clearInterval(h);
  }, []);
  return (
    <span className="hm-mono hm-top__clock" suppressHydrationWarning>
      {line}
    </span>
  );
}
