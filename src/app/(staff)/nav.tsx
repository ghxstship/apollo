"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* Too many sections for one undifferentiated row, so the nav is grouped: the
   sailing itself, the people, the evening as it runs, the money, then the
   instruments. Hairlines mark the seams; labels stay one word wherever they
   can. */
const GROUPS = [
  [
    ["/bridge", "Applications"],
    ["/bridge/gangway", "Gangway"],
    ["/bridge/manifests", "Manifests"],
    ["/bridge/voyages", "Voyages"],
    ["/bridge/itinerary", "Itinerary"],
    ["/bridge/composition", "Composition"],
    ["/bridge/program", "Program"],
  ],
  [
    ["/bridge/members", "Members"],
    ["/bridge/vetting", "Vetting"],
    ["/bridge/shoreside", "Shoreside"],
    ["/bridge/moderation", "Moderation"],
    ["/bridge/media", "Media"],
    ["/bridge/crew", "Crew"],
    ["/bridge/regattas", "Regattas"],
  ],
  [
    ["/bridge/radar", "Radar"],
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
    ["/bridge/reports", "Reports"],
    ["/bridge/referrals", "Referrals"],
    ["/bridge/sponsors", "Sponsors"],
    ["/bridge/proposals", "Proposals"],
    ["/bridge/automations", "Automations"],
    ["/bridge/keys", "Keys"],
  ],
] as const;

function isCurrent(pathname: string, href: string) {
  if (href === "/bridge") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function HmTabs() {
  const pathname = usePathname();
  return (
    <nav className="hm-tabs" aria-label="Bridge sections">
      <div className="hm-tabs__in">
        {GROUPS.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 ? <span className="hm-tabs__sep" aria-hidden="true" /> : null}
            {group.map(([href, label]) => (
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
