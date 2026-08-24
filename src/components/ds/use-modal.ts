"use client";
import React from "react";

/* Everything a thing that says role="dialog" owes the keyboard: it takes focus
   when it opens, Escape closes it, Tab cannot walk out into the page behind the
   veil, and the opener gets focus back when it goes away.

   Four surfaces declared role="dialog" and none of them did any of it. This is
   one implementation so the fifth one cannot forget again.

   `onClose` is an inline arrow at every call site, so it is held in a ref and
   kept out of the dependency list — with it in, the effect re-ran on every
   parent render and re-called focus(), which took the caret out of the field
   after a single keystroke. */
/* WHAT IS AND IS NOT VERIFIED HERE, so the next person knows what the gate
   stands for. The route audit asserts, in the source, that every file
   declaring role="dialog" imports this hook. That is structural only: it
   proves the hook is WIRED UP, and nothing whatsoever about whether it still
   WORKS. There is no unit or browser test harness in this repo.

   Hand-verified in a real browser on 2026-08-24, against the site's mobile
   menu (the same code path the Dialog, the crate drawer and the Producer
   panel take): focus moves into the surface on open; Tab from the last item
   wraps to the first with the event's default prevented; Shift+Tab from the
   first wraps to the last; Escape closes; body overflow is restored; focus
   returns to the opener.

   NOT verified by anything, by hand or otherwise: that a later edit to this
   file preserves any of the above. A regression here breaks four surfaces at
   once — including the two on the checkout path. */
export function useModal(
  open: boolean,
  onClose?: () => void,
  /* A corner popover that leaves the page usable behind it is NOT modal: it
     must not claim aria-modal, must not lock the page's scroll, and must not
     trap Tab — trapping without modality strands a reader inside a thing they
     were never shut into. Escape, focus-in and focus-restore it still owes. */
  { modal = true }: { modal?: boolean } = {}
) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  React.useEffect(() => {
    closeRef.current = onClose;
  });

  React.useEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    const opener = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        box?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !modal) return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        box?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === box)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    if (modal) document.body.style.overflow = "hidden";
    box?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      if (modal) document.body.style.overflow = prev;
      /* The opener often unmounts with the surface; only reach for it when
         focus has actually fallen through to nowhere. */
      if (opener && (!document.activeElement || document.activeElement === document.body)) {
        opener.focus?.();
      }
    };
  }, [open, modal]);

  return boxRef;
}
