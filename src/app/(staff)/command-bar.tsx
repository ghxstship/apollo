"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchField } from "@/components/ds";
import { searchBridge, type BridgeHit } from "./search";

const KIND_LABEL: Record<string, string> = {
  member: "Member",
  episode: "Episode",
  code: "Code",
  application: "Application",
  crew: "Crew",
};

/* One box for the whole console. Forty sections each had their own list and
   their own search, so a name on the phone meant Members, then Manifests, then
   Codes. Type two characters and the Bridge answers across all of them; Enter
   opens the first, ⌘K (Ctrl+K) brings the box up from anywhere.

   The arrows walk the list without leaving the field — a combobox, so focus
   stays on the input and aria-activedescendant names the row Enter will open.
   Enter with nothing walked opens the first hit, as it always did. */
export function CommandBar() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  /* The last answer, with the question it answered; "busy" is the question
     having moved on since. State is set only from the answer's callback. */
  const [answer, setAnswer] = React.useState<{ q: string; hits: BridgeHit[] }>({ q: "", hits: [] });
  const [open, setOpen] = React.useState(false);
  /* -1 is "nothing walked": Enter takes the first hit, no row is marked. */
  const [active, setActive] = React.useState(-1);
  const input = React.useRef<HTMLInputElement>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const seq = React.useRef(0);
  const needle = q.trim();
  const hits = needle.length >= 2 && answer.q === needle ? answer.hits : [];
  const busy = needle.length >= 2 && answer.q !== needle;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (needle.length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const found = await searchBridge(needle);
      if (mine !== seq.current) return;
      setAnswer({ q: needle, hits: found });
      /* A new answer resets the walk — the row that was third is not the row
         that is third now. */
      setActive(-1);
    }, 220);
    return () => clearTimeout(t);
  }, [needle]);

  /* Keep the walked row in view inside the scrolling list. */
  React.useEffect(() => {
    if (active < 0) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const show = open && needle.length >= 2;
  const optionId = (i: number) => `hm-cmd-opt-${i}`;

  return (
    <div className="hm-cmd" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <SearchField
        ref={input}
        label="Search the Bridge"
        placeholder="Search the Bridge · ⌘K"
        role="combobox"
        aria-expanded={show}
        aria-controls="hm-cmd-list"
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 && hits[active] ? optionId(active) : undefined}
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(-1); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); return; }
          if (!hits.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % hits.length); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setActive((i) => (i <= 0 ? hits.length - 1 : i - 1)); return; }
          if (e.key === "Home" && show) { e.preventDefault(); setActive(0); return; }
          if (e.key === "End" && show) { e.preventDefault(); setActive(hits.length - 1); return; }
          if (e.key === "Enter") {
            const hit = hits[active >= 0 ? active : 0];
            if (hit) { setOpen(false); router.push(hit.href); }
          }
        }}
      />
      {show ? (
        <div className="hm-cmd__list" id="hm-cmd-list" role="listbox" ref={list}>
          {hits.length === 0 ? (
            <div className="hm-cmd__empty">{busy ? "Looking…" : "Nothing by that name."}</div>
          ) : (
            hits.map((h, i) => (
              <Link
                key={`${h.kind}:${h.id}`}
                href={h.href}
                id={optionId(i)}
                data-index={i}
                className="hm-cmd__item"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => setOpen(false)}
              >
                <span className="hm-cmd__kind">{KIND_LABEL[h.kind] ?? h.kind}</span>
                <span className="hm-cmd__title">{h.title}</span>
                <span className="hm-cmd__sub">{h.subtitle}</span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
