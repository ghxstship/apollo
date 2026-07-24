"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, IconButton, Wordmark } from "@/components/ds";

const LINKS = [
  ["/harbor", "Harbor"],
  ["/now", "Now"],
  ["/manifest", "Voyages"],
  ["/wardroom", "Wardroom"],
  ["/portal", "Portal"],
  ["/card", "Card"],
  ["/word", "Word"],
  ["/you", "You"],
] as const;

const TABS = [
  ["/harbor", "Anchor", "Harbor"],
  ["/now", "Navigation", "Now"],
  ["/manifest", "Sailboat", "Voyages"],
  ["/card", "IdCard", "Card"],
  ["/word", "Bell", "Word"],
  ["/you", "User", "You"],
] as const;

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function MemberTopBar({ memberNo }: { memberNo: string | null }) {
  const pathname = usePathname();
  return (
    <header className="mbr-top">
      <div className="mbr-top__in">
        <Link href="/harbor" className="mbr-top__wm" aria-label="Harbor — home">
          <Wordmark size="sm" />
        </Link>
        <nav className="mbr-nav" aria-label="Member navigation">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={isCurrent(pathname, href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mbr-top__meta">
          {memberNo ? <span className="mbr-top__no">{memberNo}</span> : null}
          <form action="/auth/signout" method="post" style={{ display: "inline-flex" }}>
            <IconButton label="Sign out" variant="ghost" size="sm" type="submit">
              <Icon name="LogOut" size={16} />
            </IconButton>
          </form>
        </div>
      </div>
    </header>
  );
}

export function MemberTabBar() {
  const pathname = usePathname();
  return (
    <nav className="mbr-tabbar" aria-label="Member tabs">
      {TABS.map(([href, icon, label]) => (
        <Link
          key={href}
          href={href}
          className="mbr-tab"
          aria-current={isCurrent(pathname, href) ? "page" : undefined}
        >
          <Icon name={icon} size={20} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
