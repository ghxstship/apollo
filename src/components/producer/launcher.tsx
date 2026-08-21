"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ds";
import { SURFACES } from "@/lib/brand";
import { ProducerPanel } from "./panel";
import "./producer.css";

/* the Producer never boards the brand-kit page. */
export function ProducerLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  if (pathname === "/brand" || pathname.startsWith("/brand/")) return null;

  if (open) return <ProducerPanel onClose={() => setOpen(false)} />;
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
