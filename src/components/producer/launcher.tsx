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
  /* Closing is two steps: the panel plays its exit (pr-out, 120ms) and then
     unmounts, so the corner does not simply blink. */
  const [closing, setClosing] = React.useState(false);
  const fabRef = React.useRef<HTMLButtonElement>(null);
  const wasOpen = React.useRef(false);

  /* The pill unmounts while the panel is up, so useModal's focus-restore has
     nothing to return to. Hand focus back to the new pill ourselves. */
  React.useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      fabRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const settle = React.useCallback(() => {
    setOpen(false);
    setClosing(false);
  }, []);

  /* Belt to the animationend braces: if the exit animation never reports in
     (animations switched off wholesale), the panel still goes. */
  React.useEffect(() => {
    if (!closing) return;
    const t = setTimeout(settle, 240);
    return () => clearTimeout(t);
  }, [closing, settle]);

  if (pathname === "/brand" || pathname.startsWith("/brand/")) return null;

  if (open) return <ProducerPanel onClose={() => setClosing(true)} closing={closing} onClosed={settle} />;
  return (
    <button
      ref={fabRef}
      type="button"
      className="pr-fab"
      onClick={() => setOpen(true)}
      aria-label={`Open ${SURFACES.agent}`}
      aria-haspopup="dialog"
    >
      <span>
        <Icon name="Compass" size={15} />
        {SURFACES.agent}
      </span>
    </button>
  );
}
