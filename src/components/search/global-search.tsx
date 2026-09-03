"use client";

import { useRouter } from "next/navigation";
import React from "react";
import { createPortal } from "react-dom";
import { Icon, IconButton } from "@/components/ds";
import { useModal } from "@/components/ds/use-modal";

type Hit = { id: string; title: string; meta: string | null; href: string };
type Section = { kind: string; label: string; items: Hit[] };

/* The one field, and it finds everything.

   A slate rather than a search engine: ink ground, mono section rules, arrow
   keys, and a full sheet on a phone. It opens on ⌘K, on / from anywhere that is
   not already a text field, and on the affordance in the chrome.

   Results arrive GROUPED and the groups keep a fixed order, Yours first. That
   is the whole privacy answer: the boundary between a member's own things and
   the public catalogue is structure — a section heading — rather than a badge
   or a mode, so an episode called Sandbar Social and the pass you hold for it
   never sit in one undifferentiated list. What comes back at all is decided by
   row-level security on the server, so this component never has to be careful.

   The keyboard model is flat: sections are visual, the selection walks every
   hit in order regardless of which section it is in, because that is what the
   arrow keys mean to the hand using them. */
export function GlobalSearch({ inverse = false }: { inverse?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [sections, setSections] = React.useState<Section[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const boxRef = useModal(open, () => setOpen(false));
  const inputRef = React.useRef<HTMLInputElement>(null);

  /* One flat list behind the visual grouping — what the arrow keys walk. */
  const flat = React.useMemo(() => sections.flatMap((s) => s.items), [sections]);

  /* ⌘K from anywhere, and a bare / the way every reading surface has meant it
     since before the web — but never while the caret is already in a field, or
     the shortcut eats the letter someone is typing. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* Debounced, aborted on the next keystroke, and the response is dropped if a
     newer one has already been asked for — otherwise a slow answer to "sa"
     lands on top of the answer to "sandbar". */
  React.useEffect(() => {
    const needle = q.trim();
    /* Every setState below happens inside the timer, never in the effect body:
       the compiler refuses a synchronous one and is right to — the short-needle
       case does not need to clear anything, because the render already shows
       the hint rather than the results whenever the needle is this short, so a
       stale section list is unreachable rather than merely unused. */
    if (!open || needle.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, {
          signal: ctl.signal,
        });
        const body = (await res.json()) as { sections: Section[] };
        setSections(body.sections ?? []);
        setCursor(0);
      } catch {
        /* An abort is the normal path, not a failure worth reporting. */
      } finally {
        setBusy(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open]);

  /* The slate exists to be typed into, so the caret goes to the field and not
     to the box around it. Declared after useModal deliberately: that hook
     focuses the dialog container on open, and the later effect wins. Focusing
     an element is a DOM call rather than a setState, so nothing cascades. */
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      setQ("");
      setSections([]);
      router.push(href);
    },
    [router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (flat.length === 0 ? 0 : (c + 1) % flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (flat.length === 0 ? 0 : (c - 1 + flat.length) % flat.length));
    } else if (e.key === "Enter" && flat[cursor]) {
      e.preventDefault();
      go(flat[cursor].href);
    }
  };

  const slate = (
    <div className="gs-veil" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div
        className="gs"
        role="dialog"
        aria-modal="true"
        aria-label="Search [un]"
        ref={boxRef}
        tabIndex={-1}
      >
        <div className="gs__field">
          <Icon name="Search" size={17} />
          <input
            ref={inputRef}
            type="text"
            className="gs__input"
            placeholder="Episodes, members, the Log, the Shop…"
            aria-label="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <IconButton size="sm" variant="ghost" label="Close search" onClick={() => setOpen(false)}>
            <Icon name="X" size={15} />
          </IconButton>
        </div>

        <div className="gs__body">
          {q.trim().length < 2 ? (
            <p className="gs__hint">
              Type two letters. Everything the club knows about is in here — the
              season, the roster, the Log, the Shop, and whatever is yours.
            </p>
          ) : busy && sections.length === 0 ? (
            <p className="gs__hint">Looking…</p>
          ) : sections.length === 0 ? (
            <p className="gs__hint">Nothing by that name.</p>
          ) : (
            sections.map((s) => (
              <section key={s.kind} className="gs__sec">
                <span className="gs__seclabel">{s.label}</span>
                {s.items.map((hit) => {
                  const i = flat.findIndex((f) => f.id === hit.id);
                  return (
                    <button
                      key={hit.id}
                      type="button"
                      className={"gs__hit" + (i === cursor ? " gs__hit--on" : "")}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(hit.href)}
                    >
                      <span className="gs__hitt">{hit.title}</span>
                      {hit.meta ? <span className="gs__hitm">{hit.meta}</span> : null}
                    </button>
                  );
                })}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <IconButton
        label="Search"
        variant="ghost"
        size="sm"
        inverse={inverse}
        onClick={() => setOpen(true)}
      >
        <Icon name="Search" size={18} />
      </IconButton>
      {open ? createPortal(slate, document.body) : null}
    </>
  );
}
