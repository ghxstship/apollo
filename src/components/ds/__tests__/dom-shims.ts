/* The two things jsdom does not have that the kit's behaviour depends on.

   This file is FIRST in the `kit` project's setupFiles and imports nothing,
   deliberately: react-dom decides once, at its own import time, which
   animation event name to listen for (see below), so a shim that arrives
   after any module has pulled React in is a shim that does nothing. Keeping
   this file free of imports is what guarantees it runs first.

   Both shims stand in for a browser's answer. Neither is a licence to assert
   on geometry or on animation timing — jsdom still measures nothing and still
   runs no animations. */

/* — CSS animation and transition events —
   jsdom implements no CSS engine, so it exposes neither `AnimationEvent` nor
   `TransitionEvent`. react-dom reads `"AnimationEvent" in window` at import
   time and, finding it absent, falls back to hunting for a vendor-prefixed
   event name — ending up listening for a name nothing will ever dispatch.
   The failure is silent and total: `onAnimationEnd` is never called, and an
   exit-phase test would sit at "still mounted" while appearing to prove the
   opposite. Every closing phase in the kit ends on that handler, so without
   this there is nothing to test.

   Both are defined together so a later transition test does not have to
   rediscover this. */
for (const [name, fields] of [
  ["AnimationEvent", { animationName: "", elapsedTime: 0, pseudoElement: "" }],
  ["TransitionEvent", { propertyName: "", elapsedTime: 0, pseudoElement: "" }],
] as const) {
  if (name in window) continue;
  const Ctor = class extends window.Event {
    constructor(type: string, init: Record<string, unknown> = {}) {
      super(type, init);
      /* Only the animation-specific fields. `bubbles` and its neighbours are
         accessor-only on Event and were already set by super(). */
      for (const [k, v] of Object.entries(fields)) {
        Object.defineProperty(this, k, { configurable: true, value: k in init ? init[k] : v });
      }
    }
  };
  Object.defineProperty(Ctor, "name", { value: name });
  Object.defineProperty(window, name, { configurable: true, writable: true, value: Ctor });
}

/* — offsetParent —
   jsdom does no layout, so `offsetParent` is null for every element, always.
   `useModal`'s focus trap filters its candidates on `el.offsetParent !== null`
   (the standard "is this actually on the screen?" test), which under an
   unpatched jsdom throws away every focusable element in the surface: the trap
   would appear to work while trapping nothing.

   This answers the way a browser would rather than answering yes to
   everything. An element inside a `display:none` or `[hidden]` subtree, or one
   not in the document, reports null; anything else reports its nearest
   positioned ancestor, falling back to <body>. So a test that hides a control
   still sees the trap skip it, which is the behaviour the hook relies on. */
Object.defineProperty(window.HTMLElement.prototype, "offsetParent", {
  configurable: true,
  get(this: HTMLElement): Element | null {
    const hidden = (el: HTMLElement) => el.hasAttribute("hidden") || el.style.display === "none";
    if (!this.isConnected || hidden(this)) return null;
    let found: Element | null = null;
    for (let el = this.parentElement; el; el = el.parentElement) {
      if (hidden(el)) return null;
      const pos = el.style.position;
      if (!found && (el === document.body || (pos && pos !== "static"))) found = el;
      if (el === document.body) break;
    }
    return found;
  },
});
