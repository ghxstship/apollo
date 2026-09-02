"use client";

import Link from "next/link";
import React from "react";
import { Badge, Button, Tag } from "@/components/ds";
import { PLACE } from "@/lib/brand";

export interface ManifestItem {
  id: string;
  slug: string;
  title: string;
  cls: "sea" | "shore" | "sky";
  /** The series' own name — "Sandbar Social" — or Special when the episode
      belongs to no series. Never a filing-system phrase. */
  formatLabel: string;
  /** "7 HRS", or empty when the episode has no stated end. */
  hours: string;
  status: string;
  date: string;
  time: string;
  coordinates: string | null;
  distance: string | null;
  price: string;
  passesLeft: number | null;
  seatsWord: string;
  /** "ON SALE OCT 12 · 18:00" while the drop hour is still ahead; null once open. */
  onSale: string | null;
  blurb: string | null;
  week: string;
  fleet: string | null;
  deposit: string | null;
  harborId: string | null;
  harborLabel: string | null;
  seasonId: string | null;
  seasonLabel: string | null;
  /** Title of the series this episode belongs to, when it belongs to one. */
  series: string | null;
  monthKey: string;
  startsMs: number;
}

/* Where it happens, which is the only axis a reader can filter on usefully —
   the series' own name rides on each row instead. */
const FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "sea", label: "Afloat" },
  { id: "shore", label: "Ashore" },
];

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function monthLabel(key: string, showYear: boolean): string {
  const [year, month] = key.split("-");
  const name = MONTHS[Number(month) - 1] ?? key;
  return showYear ? `${name} ${year.slice(2)}` : name;
}

export function VoyageManifest({ items }: { items: ManifestItem[] }) {
  const [cls, setCls] = React.useState("all");
  const [harbor, setHarbor] = React.useState("all");
  const [season, setSeason] = React.useState("all");
  const [month, setMonth] = React.useState("all");
  const [sort, setSort] = React.useState<"soonest" | "furthest">("soonest");
  /* The three calendar axes fold away on a narrow screen — see .ws-vdisc.
     Open on every screen the disclosure is not shown on, so the CSS alone
     decides where it applies and nothing is unreachable without JS layout. */
  const [axesOpen, setAxesOpen] = React.useState(false);

  const clearFilters = () => {
    setCls("all");
    setHarbor("all");
    setSeason("all");
    setMonth("all");
  };

  /* Controls read the calendar rather than a hardcoded list — a harbor or a
     month appears only once something is actually sailing from it. */
  const harborOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of items) {
      if (v.harborId && v.harborLabel && !seen.has(v.harborId)) {
        seen.set(v.harborId, v.harborLabel);
      }
    }
    return Array.from(seen, ([id, label]) => ({ id, label }));
  }, [items]);

  /* Seasons the same way: an axis only once the calendar actually spans one.
     Items arrive soonest-first, so the options read in episode order. */
  const seasonOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of items) {
      if (v.seasonId && v.seasonLabel && !seen.has(v.seasonId)) {
        seen.set(v.seasonId, v.seasonLabel);
      }
    }
    return Array.from(seen, ([id, label]) => ({ id, label }));
  }, [items]);

  const monthOptions = React.useMemo(() => {
    const keys = Array.from(new Set(items.map((v) => v.monthKey))).sort();
    const spansYears = new Set(keys.map((k) => k.slice(0, 4))).size > 1;
    return keys.map((key) => ({ id: key, label: monthLabel(key, spansYears) }));
  }, [items]);

  /* Legacy sky-class rows read as ashore. */
  const list = React.useMemo(() => {
    const filtered = items.filter(
      (v) =>
        (cls === "all" || v.cls === cls || (cls === "shore" && v.cls === "sky")) &&
        (harbor === "all" || v.harborId === harbor) &&
        (season === "all" || v.seasonId === season) &&
        (month === "all" || v.monthKey === month)
    );
    return filtered.sort((a, b) =>
      sort === "soonest" ? a.startsMs - b.startsMs : b.startsMs - a.startsMs
    );
  }, [items, cls, harbor, season, month, sort]);

  /* Rows in month order already; the groups are the runs of one month. Fifty
     episodes emitted as one column of identical stripes gave the reader no
     landmark at all — the month is the one the season is filed under. */
  const spansYears = React.useMemo(
    () => new Set(items.map((v) => v.monthKey.slice(0, 4))).size > 1,
    [items]
  );
  const groups = React.useMemo(() => {
    const out: Array<{ key: string; label: string; rows: ManifestItem[] }> = [];
    for (const v of list) {
      const last = out[out.length - 1];
      if (last && last.key === v.monthKey) last.rows.push(v);
      else out.push({ key: v.monthKey, label: monthLabel(v.monthKey, spansYears), rows: [v] });
    }
    return out;
  }, [list, spansYears]);

  /* "12 episodes · AUG – NOV" — what the controls above just did, in a line. */
  const countLine = React.useMemo(() => {
    if (groups.length === 0) return "No episodes";
    const first = groups[0].label;
    const last = groups[groups.length - 1].label;
    const span = groups.length > 1 ? `${first} – ${last}` : first;
    return `${list.length} ${list.length === 1 ? "episode" : "episodes"} · ${span}`;
  }, [groups, list.length]);

  /* What the folded axes are holding, when they are folded. */
  const axesSummary =
    [
      harborOptions.find((h) => h.id === harbor)?.label,
      seasonOptions.find((s) => s.id === season)?.label,
      monthOptions.find((m) => m.id === month)?.label,
    ]
      .filter(Boolean)
      .join(" · ") || "All";

  return (
    <>
      <div className="ws-vcontrols">
        <div className="ws-vfilters">
          <span className="ws-vfilters__label">Setting</span>
          {FILTERS.map((f) => (
            <Tag key={f.id} active={cls === f.id} onClick={() => setCls(f.id)}>
              {f.label}
            </Tag>
          ))}
        </div>
        <div className="ws-vdisc">
          <Button
            variant="outline"
            size="sm"
            aria-expanded={axesOpen}
            aria-controls="ws-vsecondary"
            onClick={() => setAxesOpen((o) => !o)}
          >
            Filter
          </Button>
          {axesOpen ? null : <span className="ws-vdisc__sum">{axesSummary}</span>}
        </div>
        <div
          id="ws-vsecondary"
          className={"ws-vsecondary" + (axesOpen ? " ws-vsecondary--open" : "")}
        >
        {harborOptions.length > 1 ? (
          <div className="ws-vfilters">
            <span className="ws-vfilters__label">{PLACE.market}</span>
            <Tag active={harbor === "all"} onClick={() => setHarbor("all")}>
              All
            </Tag>
            {harborOptions.map((h) => (
              <Tag key={h.id} active={harbor === h.id} onClick={() => setHarbor(h.id)}>
                {h.label}
              </Tag>
            ))}
          </div>
        ) : null}
        {seasonOptions.length > 1 ? (
          <div className="ws-vfilters">
            <span className="ws-vfilters__label">Season</span>
            <Tag active={season === "all"} onClick={() => setSeason("all")}>
              All
            </Tag>
            {seasonOptions.map((s) => (
              <Tag key={s.id} active={season === s.id} onClick={() => setSeason(s.id)}>
                {s.label}
              </Tag>
            ))}
          </div>
        ) : null}
        {monthOptions.length > 1 ? (
          <div className="ws-vfilters">
            <span className="ws-vfilters__label">Month</span>
            <Tag active={month === "all"} onClick={() => setMonth("all")}>
              All
            </Tag>
            {monthOptions.map((m) => (
              <Tag key={m.id} active={month === m.id} onClick={() => setMonth(m.id)}>
                {m.label}
              </Tag>
            ))}
          </div>
        ) : null}
        </div>
        <div className="ws-vfilters">
          <span className="ws-vfilters__label">Sort</span>
          <Tag active={sort === "soonest"} onClick={() => setSort("soonest")}>
            Soonest
          </Tag>
          <Tag active={sort === "furthest"} onClick={() => setSort("furthest")}>
            Furthest out
          </Tag>
          <span className="ws-vcount">{countLine}</span>
        </div>
      </div>
      <div className="ws-vlist">
        {groups.map((g) => (
          <section key={g.key}>
            <h2 className="ws-vmonth">{g.label}</h2>
            {g.rows.map((v) => {
              const meta = [
                v.coordinates,
                v.distance,
                v.week,
                v.fleet,
                /* Before the drop hour the count is not an offer — the hour is. */
                v.onSale
                  ? v.onSale
                  : v.passesLeft != null && v.passesLeft > 0
                    ? `${v.passesLeft} ${v.seatsWord} left`
                    : null,
                v.deposit,
              ].filter((m): m is string => Boolean(m));
              return (
                <Link
                  key={v.id}
                  href={`/episodes/${v.slug}`}
                  style={{ color: "inherit", textDecoration: "none", display: "block" }}
                >
                  <div className="ws-vrow">
                    <div className="ws-vrow__date">
                      <b>{v.date}</b>
                      {v.time}
                    </div>
                    <div>
                      <span className="ls-eyebrow ws-vrow__eyebrow">
                        {v.formatLabel}
                        {v.hours ? ` · ${v.hours}` : ""}
                      </span>
                      <div className="ws-vrow__title">
                        {v.title}
                        {v.status === "weather_hold" ? <Badge tone="caution">Weather hold</Badge> : null}
                        {v.passesLeft === 0 && !v.onSale ? <Badge tone="caution">Full</Badge> : null}
                        {v.onSale ? <Badge tone="outline">Not yet on sale</Badge> : null}
                        {/* A quiet mark that this episode runs in a series. */}
                        {v.series ? <Tag>{v.series}</Tag> : null}
                      </div>
                      <div className="ws-vrow__meta">
                        {meta.map((m, i) => (
                          <span key={`${i}-${m}`}>
                            {i > 0 ? "· " : ""}
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="ws-vrow__act">
                      {v.status === "live" ? (
                        <span className="ls-live ws-live-label">Underway</span>
                      ) : (
                        <span className="ws-vrow__price">{v.price}</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        ))}
        {list.length === 0 ? (
          /* The empty branch was a bare paragraph telling the reader to loosen
             filters it gave them no way to loosen. */
          <div className="ws-zero">
            <span className="ws-zero__label">Nothing under that flag</span>
            <p>No episodes under that flag this season. Loosen the filters.</p>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
