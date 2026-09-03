"use client";

import { useSearchParams } from "next/navigation";
import React from "react";

/* The filter state of every list in the app.

   One hook so that /episodes, /directory, /shop, /open-deck and /log cannot
   drift into five dialects again. Before this, each of them held its filters in
   useState — which meant a narrowed view could not be linked, bookmarked, or
   forwarded, and the five surfaces disagreed about what a control even was.

   THE URL IS THE STATE. There is no second copy in React state to fall out of
   sync with it, and no effect syncing the two. Reads come straight off
   useSearchParams; writes go through the native history API, which Next
   documents as integrating with the router — so useSearchParams re-renders
   without the RSC round trip that router.replace would cost. That distinction
   is the whole reason a pill still feels instant: every one of these lists is
   already fully in memory, so a filter must never go back to the server.

   replaceState rather than pushState is deliberate. A Back button that walks
   four pill clicks backwards before it leaves the page is not what Back means
   to anyone, and pushState would make one history entry per click. */

/** Key to its default value. A key sitting at its default leaves no trace in
    the URL, so /episodes stays /episodes until something is actually chosen. */
export type FilterDefaults = Record<string, string>;

export type FilterState<T extends FilterDefaults> = {
  /** Current values, defaults filled in. Never undefined. */
  values: { [K in keyof T]: string };
  /** Write one key. Writing the default removes it from the URL. */
  set: (key: keyof T & string, value: string) => void;
  /** Write several at once — one history entry, one re-render. */
  setMany: (patch: Partial<Record<keyof T & string, string>>) => void;
  /** Back to defaults. Pass keys to reset only those. */
  clear: (keys?: Array<keyof T & string>) => void;
  /** How many keys are off their default — the number on the Filter button. */
  activeCount: number;
  /** Which keys are off their default, in the order they were declared. */
  activeKeys: Array<keyof T & string>;
};

export function useFilterParams<T extends FilterDefaults>(defaults: T): FilterState<T> {
  const params = useSearchParams();

  const keys = Object.keys(defaults) as Array<keyof T & string>;

  const values = {} as { [K in keyof T]: string };
  for (const key of keys) {
    values[key as keyof T] = params.get(key) ?? defaults[key];
  }

  const write = React.useCallback(
    (patch: Partial<Record<string, string>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === defaults[key]) next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    },
    /* defaults is an object literal at every call site, so it is a new identity
       on every render and cannot go in here — the values it holds are constants
       declared beside the component. params is the one thing that really
       changes, and it is what the closure must not go stale on. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params]
  );

  const set = React.useCallback(
    (key: keyof T & string, value: string) => write({ [key]: value }),
    [write]
  );

  const setMany = React.useCallback(
    (patch: Partial<Record<keyof T & string, string>>) => write(patch),
    [write]
  );

  const clear = React.useCallback(
    (only?: Array<keyof T & string>) => {
      const patch: Record<string, string> = {};
      for (const key of only ?? keys) patch[key] = defaults[key];
      write(patch);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [write]
  );

  const activeKeys = keys.filter((key) => values[key as keyof T] !== defaults[key]);

  return { values, set, setMany, clear, activeCount: activeKeys.length, activeKeys };
}

/* A text field is the one control that must not write on every keystroke.

   The field keeps its own value so typing stays immediate; the URL catches up
   after a pause, which is when a link is worth minting. Seeded from the URL
   once, in the initialiser rather than an effect — the compiler refuses
   setState during render for good reason, and there is nothing to sync back:
   with replaceState there is no history to walk that could change the query
   underneath a field the reader is actively typing into. */
export function useDebouncedParam(
  value: string,
  commit: (next: string) => void,
  delay = 350
): [string, (next: string) => void] {
  const [draft, setDraft] = React.useState(value);
  const commitRef = React.useRef(commit);
  React.useEffect(() => {
    commitRef.current = commit;
  });

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChange = React.useCallback(
    (next: string) => {
      setDraft(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => commitRef.current(next), delay);
    },
    [delay]
  );

  /* A pending write must not outlive the field it came from. */
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return [draft, onChange];
}
