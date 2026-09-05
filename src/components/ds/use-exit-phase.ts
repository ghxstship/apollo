"use client";
import React from "react";

/* — useExitPhase —
   A surface that unmounts the frame `open` goes false cannot leave: it is
   simply gone, and the eye is told a thing happened but never told it stopped.
   Dialog solved this first and Toast copied it; this is that solution, named,
   so the filter panel, the sort menu, the search slate and the site menu do
   not each grow their own copy of it (and drift, the way the four button
   components drifted).

     const { present, closing, onAnimationEnd } = useExitPhase(open);
     ...
     {present ? (
       <div
         className={"x" + (closing ? " x--out" : "")}
         aria-hidden={closing || undefined}
         onAnimationEnd={onAnimationEnd}
       >…</div>
     ) : null}

   `present` is "still on the page" — true while open, and true for one exit
   after. `closing` is the exit itself: put the --out class behind it, and stop
   honouring dismissals while it runs.

   The prop change is caught DURING RENDER (React's "adjust state from props"
   form) rather than in an effect, so the closing frame is the very next one and
   never a frame late — a closing phase that starts in an effect shows one frame
   of the surface at rest before the exit begins.

   The safety timer covers an animationend that never fires: a tab hidden
   mid-exit, an animation the cascade removed, a browser that drops the event.
   Without it the surface would stay mounted forever. Under
   prefers-reduced-motion base.css collapses the animation to .01ms and
   animationend fires at once, so the exit costs a reader nothing. */
export function useExitPhase(
  open: boolean,
  { safetyMs = 400, onClosed }: { safetyMs?: number; onClosed?: () => void } = {}
) {
  const [prevOpen, setPrevOpen] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  /* A surface that left of its OWN accord — a toast whose clock ran out, or
     whose × was pressed — is gone while the prop still says open, because the
     prop is the caller's opinion and `onClosed` is what changes it. Without
     this latch the toast reappears the instant its exit ends. `gone` also
     keeps the eventual open→false from replaying an exit that already ran. */
  const [gone, setGone] = React.useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setClosing(!open && !gone);
    if (open) setGone(false);
  }
  /* Held in a ref so a caller passing a fresh arrow each render does not
     restart the safety countdown mid-exit. */
  const closedRef = React.useRef(onClosed);
  React.useEffect(() => { closedRef.current = onClosed; }, [onClosed]);
  /* One place the phase ends, so `onClosed` fires exactly once whether the
     animation reported itself or the safety timer had to. */
  const finish = React.useCallback(() => {
    setClosing(false);
    setGone(true);
    closedRef.current?.();
  }, []);
  React.useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(finish, safetyMs);
    return () => window.clearTimeout(t);
  }, [closing, safetyMs, finish]);
  /* Only the animating element's own end, not one bubbling from a child: the
     panels animate their contents too, and a child finishing first would end
     the phase early and cut the parent's exit off. */
  const onAnimationEnd = React.useCallback((e: React.AnimationEvent) => {
    if (e.target === e.currentTarget) finish();
  }, [finish]);
  /* Start the exit from inside rather than from a prop: a toast's own clock
     reaching its deadline, or its × being pressed. */
  const close = React.useCallback(() => setClosing(true), []);
  return { present: (open && !gone) || closing, closing, onAnimationEnd, close };
}
