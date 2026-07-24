"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/harbormaster", "Applications"],
  ["/harbormaster/manifests", "Manifests"],
  ["/harbormaster/voyages", "Voyages"],
  ["/harbormaster/orders", "Orders"],
  ["/harbormaster/moderation", "Moderation"],
  ["/harbormaster/reports", "Reports"],
  ["/harbormaster/galley", "Galley"],
  ["/harbormaster/crew", "Crew"],
] as const;

function isCurrent(pathname: string, href: string) {
  if (href === "/harbormaster") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function HmTabs() {
  const pathname = usePathname();
  return (
    <nav className="hm-tabs" aria-label="Harbormaster sections">
      <div className="hm-tabs__in">
        {TABS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent(pathname, href) ? "page" : undefined}
          >
            {label}
          </Link>
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
