"use client";

import { useRouter } from "next/navigation";
import React from "react";
import { createPortal } from "react-dom";
import { Icon, IconButton, SearchField, Skeleton } from "@/components/ds";
import { useExitPhase } from "@/components/ds/use-exit-phase";
import { useModal } from "@/components/ds/use-modal";
import "./search.css";

type Hit = { id: string; title: string; meta: string | null; href: string };
type Section = { kind: string; label: string; items: Hit[] };

/* Option ids are the hit ids, prefixed so they cannot collide with the page. */
const optId = (id: string) => `gs-opt-${id}`;

/* The one field, and it finds everything.

   A slate rather than a search engine: ink ground, mono section rules, arrow
   keys, and a full sheet on a phone. It opens on ⌘K from anywhere, and on the
   affordance in the chrome — which also takes a bare / while it holds focus.

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
  /* The slate arrived on --dur-enter and then ceased to exist between two
     frames. It leaves the way the Dialog does: the closing phase holds it
     mounted for one --dur-exit with the --out class on the veil, and the
     animationend that ends the phase unmounts it. */
  const { present, closing, onAnimationEnd } = useExitPhase(open);

  /* One flat list behind the visual grouping — what the arrow keys walk, plus
     the id → position map the rows read. The rows used to answer "where am I in
     the flat list?" with a findIndex, which is a linear scan per hit per render
     and so quadratic in the result count on every keystroke. Flattening already
     knows every position; this records them once and each row does a lookup.
     First occurrence wins, exactly as findIndex did. No useMemo: the React
     compiler caches both of these for us. */
  const flat = sections.flatMap((s) => s.items);
  const indexById = new Map<string, number>();
  for (let i = 0; i < flat.length; i += 1) {
    if (!indexById.has(flat[i].id)) indexById.set(flat[i].id, i);
  }

  /* ⌘K from anywhere. It carries a modifier, so it is not a single-character
     shortcut and WCAG 2.1.4 has nothing to say about it.

     A bare / used to open the slate from anywhere on the page, guarded only
     against INPUT/TEXTAREA/contenteditable. That guard covers a caret and
     nothing else. In a screen reader's browse mode / is a quick-nav key —
     the reader owns the keystroke and the page had been eating it — and to
     speech input every dictated word is a stream of characters, so the slate
     opened mid-sentence with no way to turn it off. 2.1.4 wants such a
     shortcut disableable, remappable, or live only while its own control has
     focus. It is the third of those now: / is bound to the search button, not
     to the document, so it works where a hand would expect it and is silent
     everywhere else. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
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

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    setSections([]);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (flat.length === 0 ? 0 : (c + 1) % flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (flat.length === 0 ? 0 : (c - 1 + flat.length) % flat.length));
    } else if (e.key === "Home" && flat.length > 0) {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === "End" && flat.length > 0) {
      e.preventDefault();
      setCursor(flat.length - 1);
    } else if (e.key === "Enter" && flat[cursor]) {
      e.preventDefault();
      go(flat[cursor].href);
    }
  };

  /* The list is a listbox the field drives (combobox pattern): the input keeps
     the caret and names the current hit through aria-activedescendant, so a
     reader hears the selection the arrow keys move without focus leaving the
     field. Tab still walks the hits themselves, so useModal's trap keeps its
     first and last. */
  const listId = React.useId();
  const active = flat[cursor];
  const showList = q.trim().length >= 2 && sections.length > 0;

  /* The cursor may have walked below the fold — bring the hit into view. */
  React.useEffect(() => {
    if (!open || !active) return;
    document.getElementById(optId(active.id))?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const slate = (
    <div
      className={"gs-veil" + (closing ? " gs-veil--out" : "")}
      aria-hidden={closing || undefined}
      onClick={(e) => { if (!closing && e.target === e.currentTarget) setOpen(false); }}
      onAnimationEnd={onAnimationEnd}
    >
      <div
        className="gs"
        role="dialog"
        aria-modal="true"
        aria-label="Search [un]"
        ref={boxRef}
        tabIndex={-1}
      >
        <div className="gs__field">
          <SearchField
            ref={inputRef}
            width="full"
            placeholder="Episodes, members, the Log, the Shop…"
            label="Search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active ? optId(active.id) : undefined}
            spellCheck={false}
            value={q}
            pending={busy}
            onClear={() => { setQ(""); inputRef.current?.focus(); }}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <IconButton size="sm" variant="ghost" label="Close search" onClick={() => setOpen(false)}>
            <Icon name="X" size={16} />
          </IconButton>
        </div>

        <div className="gs__body" id={listId} role="listbox" aria-label="Results" aria-busy={busy || undefined}>
          {q.trim().length < 2 ? (
            <p className="gs__hint">
              Type two letters. Everything the club knows about is in here — the
              season, the roster, the Log, the Shop, and whatever is yours.
            </p>
          ) : busy && sections.length === 0 ? (
            <Skeleton lines={3} height="40px" />
          ) : sections.length === 0 ? (
            <p className="gs__hint" role="status">Nothing by that name.</p>
          ) : (
            sections.map((s) => (
              <section key={s.kind} className="gs__sec" role="group" aria-labelledby={`gs-sec-${s.kind}`}>
                <span className="gs__seclabel" id={`gs-sec-${s.kind}`}>{s.label}</span>
                {s.items.map((hit) => {
                  const i = indexById.get(hit.id) ?? -1;
                  return (
                    /* ds-exempt: a listbox option (role=option) the combobox's aria-activedescendant names — a selectable row, not a command; the kit has no Listbox and a Button here would announce as one */
                    <button
                      key={hit.id}
                      id={optId(hit.id)}
                      type="button"
                      role="option"
                      aria-selected={i === cursor}
                      className={"gs__hit" + (i === cursor ? " gs__hit--on" : "")}
                      onMouseEnter={() => setCursor(i)}
                      onFocus={() => setCursor(i)}
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
        onKeyDown={(e) => {
          if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="Search" size={18} />
      </IconButton>
      {present ? createPortal(slate, document.body) : null}
    </>
  );
}
