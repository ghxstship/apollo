"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ds";
import { PurserPanel } from "./panel";
import "./purser.css";

/* The Purser never boards the brand-kit page. */
export function PurserLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  if (pathname === "/brand" || pathname.startsWith("/brand/")) return null;

  if (open) return <PurserPanel onClose={() => setOpen(false)} />;
  return (
    <button
      type="button"
      className="pr-fab"
      onClick={() => setOpen(true)}
      aria-label="Open the Purser assistant"
    >
      <span>
        <Icon name="Compass" size={15} />
        The Purser
      </span>
    </button>
  );
}
