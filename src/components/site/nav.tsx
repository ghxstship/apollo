"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { IconButton, ThemeToggle, Icon } from "@/components/ds";
import { LockupHorizontal } from "./logo";
import { LinkButton } from "./link-button";

const LINKS: Array<[string, string]> = [
  ["/voyages", "Voyages"],
  ["/membership", "Membership"],
  ["/lore", "LORE"],
  ["/gallery", "Gallery"],
  ["/crew", "Crew wanted"],
];

const COORDS = "33.9803° N — 118.4517° W";

export function SiteNav() {
  const pathname = usePathname();
  // The menu is "open for this path" — navigating anywhere closes it without
  // needing an effect.
  const [openPath, setOpenPath] = React.useState<string | null>(null);
  const open = openPath === pathname;
  const close = () => setOpenPath(null);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPath(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isOn = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="ws-nav">
      <div className="ls-container ws-nav__in">
        <Link href="/" className="ws-nav__logo" aria-label="LYRE SOCIAL — home">
          <LockupHorizontal height={34} />
        </Link>
        <div className="ws-nav__links">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={"ws-nav__link" + (isOn(href) ? " ws-nav__link--on" : "")}
            >
              {label}
            </Link>
          ))}
        </div>
        <span className="ws-nav__coords">{COORDS}</span>
        <div className="ws-nav__end">
          <ThemeToggle />
          <span className="ws-nav__cta">
            <LinkButton href="/gangway" variant="outline" size="sm" inverse>
              Come aboard
            </LinkButton>
          </span>
          <span className="ws-nav__burger">
            <IconButton
              label="Open menu"
              variant="ghost"
              inverse
              onClick={() => setOpenPath(pathname)}
            >
              <Icon name="Menu" size={20} />
            </IconButton>
          </span>
        </div>
      </div>
      {open ? (
        <div className="ws-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="ws-menu__top">
            <Link href="/" className="ws-nav__logo" aria-label="LYRE SOCIAL — home" onClick={close}>
              <LockupHorizontal height={30} />
            </Link>
            <IconButton label="Close menu" variant="ghost" inverse onClick={close}>
              <Icon name="X" size={20} />
            </IconButton>
          </div>
          <div className="ws-menu__links">
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} onClick={close}>
                {label}
              </Link>
            ))}
          </div>
          <div className="ws-menu__base">
            <LinkButton href="/gangway" variant="outline" size="md" inverse fullWidth>
              Come aboard
            </LinkButton>
            <span className="ws-menu__coords">{COORDS} · Est. MMXXIV</span>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
