"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ds";
import { SURFACES } from "@/lib/brand";
import { AuroraPanel } from "./panel";
import "./aurora.css";

/* Aurora never boards the brand-kit page. */
export function AuroraLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  if (pathname === "/brand" || pathname.startsWith("/brand/")) return null;

  if (open) return <AuroraPanel onClose={() => setOpen(false)} />;
  return (
    <button
      type="button"
      className="pr-fab"
      onClick={() => setOpen(true)}
      aria-label={`Open the ${SURFACES.agent} assistant`}
    >
      <span>
        <Icon name="Compass" size={15} />
        {SURFACES.agent}
      </span>
    </button>
  );
}
