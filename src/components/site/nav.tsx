"use client";

import { ANCHOR, EST_YEAR_ROMAN } from "@/lib/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { IconButton, ThemeToggle, Icon } from "@/components/ds";
import { LockupHorizontal } from "./logo";
import { LinkButton } from "./link-button";
import { useModal } from "@/components/ds/use-modal";

const LINKS: Array<[string, string]> = [
  /* One name per destination. The public listing is Episodes in the nav, the
     footer and its own page title; the written record is the Log. "Manifest"
     is not a name for either — a manifest is the boarding list for a single
     episode, which is a member surface, not a season listing.

     /membership was Casting here and Membership in the footer and the page
     title — one destination under two names, which teaches a reader they are
     two places. Casting is the show's word, so Casting is the name everywhere;
     the page's own eyebrow already read it. */
  ["/episodes", "Episodes"],
  ["/series", "Series"],
  ["/the-show", "The show"],
  ["/membership", "Casting"],
  ["/log", "The Log"],
  ["/gallery", "Gallery"],
  ["/crew", "Crew wanted"],
];

/* The home port. This read 33.98°N 118.45°W — Marina del Rey — for a club
   whose anchor episode leaves Miami; the one factual datum in the chrome was
   the wrong coast. Haulover Inlet, per the operations spec's own example. */
const COORDS = "25.9007° N — 80.1206° W";

export function SiteNav() {
  const pathname = usePathname();
  // The menu is "open for this path" — navigating anywhere closes it without
  // needing an effect.
  const [openPath, setOpenPath] = React.useState<string | null>(null);
  const open = openPath === pathname;
  const close = () => setOpenPath(null);

  /* Escape and the scroll lock were already here; focus was not. The panel
     said aria-modal while focus stayed on the burger behind it, Tab walked
     straight out into the page under the veil, and closing left focus nowhere. */
  const menuRef = useModal(open, close);

  const isOn = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="ws-nav">
      <div className="ls-container ws-nav__in">
        <Link href="/" className="ws-nav__logo" aria-label={`${ANCHOR} — home`}>
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
        <div className="ws-menu" role="dialog" aria-modal="true" aria-label="Menu" ref={menuRef} tabIndex={-1}>
          <div className="ws-menu__top">
            <Link href="/" className="ws-nav__logo" aria-label={`${ANCHOR} — home`} onClick={close}>
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
            <span className="ws-menu__coords">{COORDS} · Est. {EST_YEAR_ROMAN}</span>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
