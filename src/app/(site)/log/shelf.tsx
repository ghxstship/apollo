"use client";

import Link from "next/link";
import React from "react";
import { Badge, Button, FilterPills, ListToolbar } from "@/components/ds";
import { useFilterParams } from "@/lib/use-filter-params";

export type LogEntry = {
  id: string;
  slug: string;
  title: string;
  dek: string | null;
  tag: string | null;
  /** Already formatted for the reader — the server owns the club's zone. */
  dateLabel: string;
  year: string;
  yearRoman: string;
  /** The date behind the printed one, so the sort can order on it. */
  publishedMs: number;
};

/* Newest first is what an archive means; the other two are the questions a
   reader with a specific dispatch in mind actually has. */
const SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "az", label: "A – Z" },
];

/* A shelf, not a search box.

   Under about thirty entries a field is worse than nothing: it asks the reader
   to guess a word that may not be in the corpus and answers with an empty state
   on a page whose actual answer is three inches further down. The Log is also
   editorial — the running order is itself a statement, and a field on top
   quietly announces that this is a database.

   What it gets instead is the same vocabulary every other list now speaks: one
   axis as pills with counts, the state in the URL, the year as a sticky spine.
   The Log is reachable by name from the global field from the day that ships,
   so the capability is not missing — it simply does not get a redundant box of
   its own. Past roughly fifty entries, adding one here is a one-component
   change, because the state and the axis are already underneath it. */
export function LogShelf({ entries }: { entries: LogEntry[] }) {
  const { values, set, clear } = useFilterParams({ tag: "all", sort: "newest" });
  const sort = SORTS.some((s) => s.id === values.sort) ? values.sort : "newest";

  const tagOptions = React.useMemo(() => {
    const seen = new Map<string, number>();
    for (const e of entries) {
      if (e.tag) seen.set(e.tag, (seen.get(e.tag) ?? 0) + 1);
    }
    return Array.from(seen, ([id, count]) => ({ id, label: id, count }));
  }, [entries]);

  const shown = React.useMemo(() => {
    const rows = values.tag === "all" ? entries : entries.filter((e) => e.tag === values.tag);
    return [...rows].sort((a, b) => {
      if (sort === "oldest") return a.publishedMs - b.publishedMs;
      if (sort === "az") return a.title.localeCompare(b.title) || b.publishedMs - a.publishedMs;
      return b.publishedMs - a.publishedMs;
    });
  }, [entries, values.tag, sort]);

  /* The year rules are the runs of one year, which is only a landmark while
     the list is in date order — under A–Z the years interleave and a rule every
     second row would say nothing. */
  const dated = sort !== "az";
  const groups = React.useMemo(() => {
    const out: Array<{ key: string; label: string; rows: LogEntry[] }> = [];
    if (!dated) return shown.length ? [{ key: "flat", label: "", rows: shown }] : [];
    for (const e of shown) {
      const last = out[out.length - 1];
      if (last && last.key === e.year) last.rows.push(e);
      else out.push({ key: e.year, label: e.yearRoman, rows: [e] });
    }
    return out;
  }, [shown, dated]);

  const chips =
    values.tag === "all" ? [] : [{ key: "tag", label: "Filed under", value: values.tag }];

  return (
    <div className="dp-list">
      {tagOptions.length > 1 ? (
        <ListToolbar
          filterCount={values.tag === "all" ? 0 : 1}
          sortValue={sort}
          sortOptions={SORTS}
          onSort={(id) => set("sort", id)}
          resultCount={shown.length}
          resultNoun="dispatch"
          resultNounPlural="dispatches"
          chips={chips}
          onDropChip={() => clear(["tag"])}
          onClear={() => clear(["tag"])}
          filters={
            <FilterPills
              label="Filed under"
              value={values.tag}
              onChange={(next) => set("tag", next)}
              allCount={entries.length}
              options={tagOptions}
            />
          }
        />
      ) : null}

      {/* An empty log used to render the masthead, the standfirst and then the
          grey mailto footnote with nothing between them — which reads as a page
          that failed rather than a season that has not been written yet. */}
      {entries.length === 0 ? (
        <div className="ws-dp-row ws-dp-row--flat">
          <div className="ws-dp-row__t">Nothing filed yet.</div>
          <p className="ws-dp-row__dek">
            The log opens with the first episode of the season. What the cameras
            keep is written up here, credited by name.
          </p>
        </div>
      ) : null}

      {entries.length > 0 && shown.length === 0 ? (
        <div className="ws-zero">
          <span className="ws-zero__label">Nothing filed under that</span>
          <p>No dispatches carry that mark yet. The rest of the Log is still there.</p>
          <Button variant="outline" size="sm" onClick={() => clear(["tag"])}>
            Show everything
          </Button>
        </div>
      ) : null}

      {groups.map((g) => (
        <section key={g.key}>
          {g.label ? <h2 className="dp-year">{g.label}</h2> : null}
          {g.rows.map((p) => (
            <Link key={p.id} href={`/log/${p.slug}`} className="dp-link">
              <div className="ws-dp-row">
                <span className="ws-dp-row__d">{p.dateLabel}</span>
                <div>
                  <div className="ws-dp-row__t">{p.title}</div>
                  {p.dek ? <p className="ws-dp-row__dek">{p.dek}</p> : null}
                </div>
                {p.tag ? <Badge tone="outline">{p.tag}</Badge> : null}
              </div>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
