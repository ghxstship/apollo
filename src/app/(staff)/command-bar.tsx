"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
   opens the first, ⌘K (Ctrl+K) brings the box up from anywhere. */
export function CommandBar() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  /* The last answer, with the question it answered; "busy" is the question
     having moved on since. State is set only from the answer's callback. */
  const [answer, setAnswer] = React.useState<{ q: string; hits: BridgeHit[] }>({ q: "", hits: [] });
  const [open, setOpen] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
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
    }, 220);
    return () => clearTimeout(t);
  }, [needle]);

  const show = open && needle.length >= 2;

  return (
    <div className="hm-cmd" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <input
        ref={input}
        className="hm-cmd__input"
        type="search"
        placeholder="Search the Bridge · ⌘K"
        aria-label="Search the Bridge"
        role="combobox"
        aria-expanded={show}
        aria-controls="hm-cmd-list"
        autoComplete="off"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Enter" && hits[0]) { setOpen(false); router.push(hits[0].href); }
        }}
      />
      {show ? (
        <div className="hm-cmd__list" id="hm-cmd-list" role="listbox">
          {hits.length === 0 ? (
            <div className="hm-cmd__empty">{busy ? "Looking…" : "Nothing by that name."}</div>
          ) : (
            hits.map((h) => (
              <Link key={`${h.kind}:${h.id}`} href={h.href} className="hm-cmd__item" role="option" aria-selected={false} onClick={() => setOpen(false)}>
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
