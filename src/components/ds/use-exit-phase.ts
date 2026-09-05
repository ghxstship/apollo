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
export interface UseExitPhaseOptions {
  /** How long to hold the surface if `animationend` never arrives. */
  safetyMs?: number;
  /** The exit has finished. Fires exactly once per exit. */
  onClosed?: () => void;
  /* The element that goes `aria-hidden` for the exit. Give it, and focus is
     dropped out of that subtree in the same commit that raises the flag.

     Five overlays set `aria-hidden={closing}` on a subtree that still held
     the control just pressed — Escape from the filter panel, the site menu's
     ×, a sort pick, the Toast's ×, the search slate's close. For one whole
     --dur-exit a reader's focus sat inside a subtree it had been told to
     ignore, which is the aria-hidden violation with the worst failure mode:
     most readers say nothing at all and the reader is simply left pointing at
     nothing. Then the node unmounted and focus fell to <body>.

     useModal restores the opener only when focus has fallen through to
     nowhere, so it stepped over this every time — the focused element was
     still there, inside the hidden subtree, when the cleanup ran. Blurring
     here puts focus on the body BEFORE that cleanup (a layout effect runs
     ahead of every passive one in the same commit), so useModal finds nothing
     holding focus and hands it back to the opener, exactly as it does on
     Escape.

     Dialog solved this for itself with a private copy of the effect below.
     One hook, one blur, and the other four cannot forget. A surface with no
     opener to return to — the Toast — still gains the important half: focus
     is out of the hidden subtree rather than stranded in it. */
  ref?: React.RefObject<HTMLElement | null>;
}

export function useExitPhase(
  open: boolean,
  { safetyMs = 400, onClosed, ref }: UseExitPhaseOptions = {}
) {
  const [prevOpen, setPrevOpen] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  /* A surface that left of its OWN accord — a toast whose clock ran out, or
     whose × was pressed — is gone while the prop still says open, because the
     prop is the caller's opinion and `onClosed` is what changes it. Without
     this latch the toast reappears the instant its exit ends. `gone` also
     keeps the eventual open→false from replaying an exit that already ran.

     THE CONTRACT THIS PUTS ON THE CALLER, stated because it is the one way to
     hold this hook wrong: `close()` latches the surface gone, and only `open`
     going false and then true again unlatches it. So `onClosed` MUST be the
     thing that changes the caller's mind — unmount the surface, or set its
     open state false. A caller that passes `onClose={() => {}}` and leaves
     `open` at true has a toast that plays its exit once, latches, and never
     renders again: no error, no warning, and nothing on the screen. Every call
     site in this repo resets state in `onClosed`, so the trap is unsprung
     today; it is written down here because the next one will not have read
     this file. (`open` is untouched by the latch — it is the caller's opinion
     and stays theirs.) */
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
  /* Focus out of the subtree that is about to be told it does not exist. A
     LAYOUT effect, so it lands in the same commit that set `closing` and
     ahead of useModal's passive cleanup — see `ref` above. */
  React.useLayoutEffect(() => {
    if (!closing || !ref) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && ref.current?.contains(active)) active.blur();
  }, [closing, ref]);
  /* Start the exit from inside rather than from a prop: a toast's own clock
     reaching its deadline, or its × being pressed. */
  const close = React.useCallback(() => setClosing(true), []);
  return { present: (open && !gone) || closing, closing, onAnimationEnd, close };
}
