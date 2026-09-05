"use client";
import React from "react";

/* — reading a client-only fact without a render-then-set —

   "Am I on the client?" and "does this browser have a PushManager?" are the
   same question in two shapes: something the server cannot know, whose answer
   never changes once the client has it. `useSyncExternalStore` answers both
   without the setState-in-an-effect that would render once with the wrong
   answer and once with the right one — the server snapshot is the placeholder
   and the client snapshot is the fact.

   The subscribe function has to be a CONSTANT. Written inline as
   `useSyncExternalStore(() => () => {}, …)` — which is how the Dialog and the
   Toast both wrote it — it is a new function identity on every render, so
   React unsubscribes and resubscribes on every pass of every component that
   holds one. Two files had already hoisted the constant into a module-level
   `NO_SUBSCRIBE` and two had not. This is that constant, hoisted once. */
const NO_SUBSCRIBE = () => () => {};

const ON_CLIENT = () => true;
const ON_SERVER = () => false;

/** True once the client has taken over, false in the server render and in the
    hydration pass that must match it. What a portal needs before it can reach
    for `document.body`. */
export function useMounted(): boolean {
  return React.useSyncExternalStore(NO_SUBSCRIBE, ON_CLIENT, ON_SERVER);
}

/** A fact only the browser can state — a capability, a platform, a media
    query's first answer. `read` runs on the client, `serverValue` stands in
    until then. Keep `read` cheap and pure: it is called on every render. */
export function useClientSnapshot<T>(read: () => T, serverValue: T): T {
  return React.useSyncExternalStore(NO_SUBSCRIBE, read, () => serverValue);
}
