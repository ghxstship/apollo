"use client";

import React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ds";
import { SURFACES } from "@/lib/brand";
import "./producer.css";

/* The pill's face, in one place, because two things now draw it: the control
   itself, and the picture of the control that holds the corner while the lazy
   boundary resolves. */
function FabFace() {
  return (
    <span>
      <Icon name="Compass" size={16} />
      {SURFACES.agent}
    </span>
  );
}

/* The panel is four hundred and seventy lines, and it drags its seven server
   actions, the money and log-date formatters and half the kit in behind it.
   It was a static import, so every signed-in member downloaded and parsed the
   whole of it on every route in order to render a pill in the corner — a
   payload none of them asked for and most of them never open.

   It arrives when it is asked for now. `ssr: false` because the panel cannot
   exist before a tap, so there is nothing for the server to render into.

   `loading` is not decoration. `dynamic` compiles to a `<Suspense>`, and with
   no fallback its fallback is `null`; React.lazy's initializer resolves on a
   MICROTASK even when the module is already sitting in the registry, so the
   very first mount always suspends for a frame. The pill has unmounted by
   then, so a null fallback is an empty corner — brief, but it is the one
   frame the eye is watching, and it reads as the control having been lost.
   The fallback is the pill's own shape, inert, standing exactly where the
   pill stood until the panel takes the corner from it. */
const ProducerPanel = dynamic(() => import("./panel").then((m) => m.ProducerPanel), {
  ssr: false,
  loading: () => (
    <div className="pr-fab pr-fab--ghost" aria-hidden="true">
      <FabFace />
    </div>
  ),
});

/* Fetching the chunk and rendering it are two different moments, and the gap
   between them is the whole hazard of a lazy boundary: if `open` flips before
   the module lands, next/dynamic renders its fallback and the panel is not
   there yet — so the request is made first and the state flips on arrival.
   One promise, shared between the warm-up on hover and the tap, so a member
   who does both makes one request.

   It never rejects. Two of its three call sites are fire-and-forget — a hover
   and a focus — and a promise nobody caught is an unhandled rejection the
   moment a chunk fetch fails on a bad connection. The failure is handled
   here, where the retry state lives: the shared promise is cleared so the
   next hover or tap is a fresh attempt, and the caller is told whether the
   panel can be mounted rather than being handed something to catch. */
let panelChunk: Promise<boolean> | null = null;
let panelReady = false;
function warmPanel(): Promise<boolean> {
  panelChunk ??= import("./panel").then(
    () => {
      panelReady = true;
      return true;
    },
    () => {
      panelChunk = null;
      return false;
    }
  );
  return panelChunk;
}

/* the Producer never boards the brand-kit page. */
export function ProducerLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  /* Closing is two steps: the panel plays its exit (pr-out, 120ms) and then
     unmounts, so the corner does not simply blink. */
  const [closing, setClosing] = React.useState(false);
  /* The tap landed and the chunk has not. The pill stays where it is and says
     so, rather than vanishing into an empty corner. */
  const [fetching, setFetching] = React.useState(false);
  const fabRef = React.useRef<HTMLButtonElement>(null);
  const wasOpen = React.useRef(false);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

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

  /* Held in a useCallback deliberately, and not as compiler noise: the safety
     timer below lists it as a dependency, so a fresh identity each render
     would restart the 240ms countdown on every render that lands inside the
     exit. */
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

  const openPanel = () => {
    /* `panelReady` no longer skips the wait — the wait is one microtask on a
       warm chunk and the pill holds the corner through it, which is the whole
       point. It skips the BUSY FLAG: announcing a fetch that is already done
       toggles aria-busy on and off inside a single frame for no reason. */
    if (!panelReady) setFetching(true);
    void warmPanel().then((ready) => {
      if (!alive.current) return;
      setFetching(false);
      /* A chunk that will not load leaves the pill exactly as it was, so the
         next tap is a fresh attempt rather than a dead control. */
      if (ready) setOpen(true);
    });
  };

  if (pathname === "/brand" || pathname.startsWith("/brand/")) return null;

  if (open) return <ProducerPanel onClose={() => setClosing(true)} closing={closing} onClosed={settle} />;
  return (
    /* ds-exempt: the launcher is a fixed floating pill — a lava ring around a carbon label, positioned against the viewport and the tab bar — which no Button variant draws; dressing a Button as it would mean unpicking every ls-btn face rule from producer.css */
    <button
      ref={fabRef}
      type="button"
      className="pr-fab"
      onClick={openPanel}
      onPointerEnter={() => void warmPanel()}
      onFocus={() => void warmPanel()}
      aria-label={`Open ${SURFACES.agent}`}
      aria-haspopup="dialog"
      aria-busy={fetching || undefined}
    >
      <FabFace />
    </button>
  );
}
