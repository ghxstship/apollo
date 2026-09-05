"use client";

import Link from "next/link";
import React from "react";
import { Badge, Button, FilterPills, ListToolbar, Tag } from "@/components/ds";
import { PLACE } from "@/lib/brand";
import { useFilterParams } from "@/lib/use-filter-params";
import { StandingControl } from "./standing-control";

export interface ManifestItem {
  id: string;
  slug: string;
  title: string;
  cls: "sea" | "shore" | "sky";
  /** The series' own name — "Sandbar Social" — or Special when the episode
      belongs to no series. Never a filing-system phrase. */
  seriesLabel: string;
  /** The series' slug, or null when the episode belongs to none. The label
      above falls back to the setting, so it cannot stand in for this. */
  seriesSlug: string | null;
  /** "7 HRS", or empty when the episode has no stated end. */
  hours: string;
  status: string;
  date: string;
  time: string;
  distance: string | null;
  price: string;
  /** The number behind the formatted price, so the sort can order on it. */
  priceCents: number;
  passesLeft: number | null;
  seatsWord: string;
  /** "ON SALE OCT 12 · 18:00" while the drop hour is still ahead; null once open. */
  onSale: string | null;
  blurb: string | null;
  week: string;
  fleet: string | null;
  deposit: string | null;
  harborId: string | null;
  cityLabel: string | null;
  seasonId: string | null;
  seasonLabel: string | null;
  /** Title of the series this episode belongs to, when it belongs to one. */
  series: string | null;
  monthKey: string;
  startsMs: number;
}

/* Where it happens. The second axis, beside this one, is which series it
   belongs to — the calendar's most even division, and the one a reader is
   most likely to be following. */
const FILTERS: Array<{ id: string; label: string }> = [
  { id: "sea", label: "Afloat" },
  { id: "shore", label: "Ashore" },
];

/* When, which is the control every event app leads with and this one did not
   have. The thirteen month pills that used to stand here were a fixed axis
   where the reader wanted a window.

   Each pick writes real dates into the URL, not the name of a period, so a link
   sent in September still means September when it is opened in November. The
   name rides along in `when` only so the pill knows to light up — reading it
   back is free of date arithmetic, which is what keeps the server and the
   browser rendering the same thing. */
const RANGES: Array<{ id: string; label: string }> = [
  { id: "month", label: "This month" },
  { id: "quarter", label: "Next three" },
  { id: "season", label: "Rest of season" },
];

const DEFAULTS = {
  setting: "all",
  series: "all",
  city: "all",
  season: "all",
  when: "all",
  from: "",
  to: "",
  sort: "soonest",
};

/* Sort is not a filter — it cannot empty a list — so Clear all leaves it alone
   and it never counts towards the number on the Filters button. */
const FILTER_KEYS = ["setting", "series", "city", "season", "when", "from", "to"] as const;

/* Sort is a menu now, not a pill row — one value out of N, almost always the
   default, which is not worth a line of the page.

   Which also means it costs nothing to offer more than two. A listing this
   size has real questions at both ends of every axis: what is soonest, what is
   cheapest, and — the one a reader of a scarce calendar actually asks — what is
   nearly gone. */
const SORTS = [
  { id: "soonest", label: "Soonest first" },
  { id: "furthest", label: "Furthest out" },
  { id: "price-low", label: "Price: low to high" },
  { id: "price-high", label: "Price: high to low" },
  { id: "scarce", label: "Nearly gone" },
  { id: "az", label: "A – Z" },
];

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function monthLabel(key: string, showYear: boolean): string {
  const [year, month] = key.split("-");
  const name = MONTHS[Number(month) - 1] ?? key;
  /* The full year, not two digits: "SEP 26" under a list of dates read as
     the 26th of September, not September 2026. */
  return showYear ? `${name} ${year}` : name;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* Parsed as a local calendar day rather than through Date.parse, which reads a
   bare YYYY-MM-DD as UTC midnight and drags every boundary west of Greenwich
   into the previous day. */
function dayMs(value: string, end: boolean): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (end) d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/* Sorts a pass count for "nearly gone": one left is the most urgent, none left
   and not-yet-published are both non-answers and sink. */
function scarcity(left: number | null): number {
  if (left === null || left <= 0) return Number.POSITIVE_INFINITY;
  return left;
}

function shortDay(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}

export function EpisodeManifest({
  items,
  standing = null,
  signedIn = false,
}: {
  items: ManifestItem[];
  /* The query string this member's manifest opens with, when they keep one. */
  standing?: string | null;
  signedIn?: boolean;
}) {
  /* The filters ARE the URL — see useFilterParams. Nothing is mirrored into
     React state, so nothing can fall out of step with the address bar, and a
     reader who narrows to one series sends what they were looking at. */
  const { values, set, setMany, clear } = useFilterParams(DEFAULTS);

  /* Enums defined in code are clamped, so a stale or hand-typed link degrades
     to the unfiltered view. Ids that come from the data are not: a series that
     has since been retired should say nothing is under that flag and offer the
     way out, rather than silently showing a calendar nobody asked for. */
  const cls = FILTERS.some((f) => f.id === values.setting) ? values.setting : "all";
  const sort = SORTS.some((s) => s.id === values.sort) ? values.sort : "soonest";
  const fromMs = dayMs(values.from, false);
  const toMs = dayMs(values.to, true);

  /* Controls read the calendar rather than a hardcoded list — a city or a
     series appears only once something is actually running under it. */
  const cityOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of items) {
      if (v.harborId && v.cityLabel && !seen.has(v.harborId)) {
        seen.set(v.harborId, v.cityLabel);
      }
    }
    return Array.from(seen, ([id, label]) => ({ id, label }));
  }, [items]);

  const seasonOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of items) {
      if (v.seasonId && v.seasonLabel && !seen.has(v.seasonId)) {
        seen.set(v.seasonId, v.seasonLabel);
      }
    }
    return Array.from(seen, ([id, label]) => ({ id, label }));
  }, [items]);

  /* Series earns the primary row: this season divides into five runs of roughly
     a dozen episodes each, where Setting divides into two and City, until the
     second market opens, into one. */
  const seriesOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of items) {
      if (v.seriesSlug && !seen.has(v.seriesSlug)) seen.set(v.seriesSlug, v.seriesLabel);
    }
    return Array.from(seen, ([id, label]) => ({ id, label }));
  }, [items]);

  /* One predicate, so a pill's count and the list itself can never disagree
     about what a filter means. Legacy sky-class rows read as ashore. */
  const matches = React.useCallback(
    (
      v: ManifestItem,
      f: { setting: string; series: string; city: string; season: string; fromMs: number | null; toMs: number | null }
    ) =>
      (f.setting === "all" || v.cls === f.setting || (f.setting === "shore" && v.cls === "sky")) &&
      (f.series === "all" || v.seriesSlug === f.series) &&
      (f.city === "all" || v.harborId === f.city) &&
      (f.season === "all" || v.seasonId === f.season) &&
      (f.fromMs === null || v.startsMs >= f.fromMs) &&
      (f.toMs === null || v.startsMs <= f.toMs),
    []
  );

  const current = React.useMemo(
    () => ({ setting: cls, series: values.series, city: values.city, season: values.season, fromMs, toMs }),
    [cls, values.series, values.city, values.season, fromMs, toMs]
  );

  /* A count on a pill is the difference between choosing and guessing, and it
     is what every list in this app was missing. Facet semantics: how many rows
     this value would leave with every OTHER axis held where it is. */
  const countWith = React.useCallback(
    (axis: "setting" | "series" | "city" | "season", value: string) =>
      items.filter((v) => matches(v, { ...current, [axis]: value })).length,
    [items, matches, current]
  );

  const list = React.useMemo(() => {
    const filtered = items.filter((v) => matches(v, current));
    /* Every order falls back to the date, so two episodes at the same price do
       not shuffle between renders — an unstable list under a stable filter
       reads as a bug even when the top of it is right. */
    const byDate = (a: ManifestItem, b: ManifestItem) => a.startsMs - b.startsMs;
    return filtered.sort((a, b) => {
      switch (sort) {
        case "furthest":
          return b.startsMs - a.startsMs;
        case "price-low":
          return a.priceCents - b.priceCents || byDate(a, b);
        case "price-high":
          return b.priceCents - a.priceCents || byDate(a, b);
        case "scarce":
          /* An episode with no published count is not "nearly gone", it is
             unknown, and unknown belongs at the bottom rather than at the top
             of a list whose whole point is urgency. Sold out is not scarce
             either — there is nothing left to hurry for. */
          return (
            scarcity(a.passesLeft) - scarcity(b.passesLeft) || byDate(a, b)
          );
        case "az":
          return a.title.localeCompare(b.title) || byDate(a, b);
        default:
          return byDate(a, b);
      }
    });
  }, [items, matches, current, sort]);

  /* Rows in month order already; the groups are the runs of one month. Fifty
     episodes emitted as one column of identical stripes gave the reader no
     landmark at all — the month is the one the season is filed under. */
  const spansYears = React.useMemo(
    () => new Set(items.map((v) => v.monthKey.slice(0, 4))).size > 1,
    [items]
  );
  /* The month rules are the runs of one month, which is only a landmark while
     the list is IN month order. Under price or A–Z the dates interleave and a
     rule would appear every second row saying nothing — so the grouping stands
     down and the list runs flat. */
  const grouped = sort === "soonest" || sort === "furthest";
  const groups = React.useMemo(() => {
    const out: Array<{ key: string; label: string; rows: ManifestItem[] }> = [];
    if (!grouped) return list.length ? [{ key: "flat", label: "", rows: list }] : [];
    for (const v of list) {
      const last = out[out.length - 1];
      if (last && last.key === v.monthKey) last.rows.push(v);
      else out.push({ key: v.monthKey, label: monthLabel(v.monthKey, spansYears), rows: [v] });
    }
    return out;
  }, [list, spansYears, grouped]);

  /* " · AUG – NOV" — the toolbar prints the number and the noun; the months
     the answer spans are this page's own addition to it. */
  const spanSuffix = React.useMemo(() => {
    if (groups.length === 0 || !grouped) return "";
    const first = groups[0].label;
    const last = groups[groups.length - 1].label;
    return groups.length > 1 ? ` · ${first} – ${last}` : ` · ${first}`;
  }, [groups, grouped]);

  /* Computed in the handler, never during render: a range is relative to today,
     and today is a different value on the server than in the browser. */
  const pickRange = (id: string) => {
    if (values.when === id) {
      setMany({ when: "all", from: "", to: "" });
      return;
    }
    const now = new Date();
    const from = iso(now);
    let to: string;
    if (id === "month") to = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    else if (id === "quarter") to = iso(new Date(now.getFullYear(), now.getMonth() + 3, 0));
    else {
      /* Rest of season is the calendar's own far end, not a guessed horizon. */
      const furthest = items.reduce((max, v) => Math.max(max, v.startsMs), now.getTime());
      to = iso(new Date(furthest));
    }
    setMany({ when: id, from, to });
  };

  /* Only the axes a reader chose, named the way the control named them. */
  const chips = [
    cls !== "all"
      ? { key: "setting", label: "Setting", value: FILTERS.find((f) => f.id === cls)?.label ?? cls }
      : null,
    values.series !== "all"
      ? {
          key: "series",
          label: "Series",
          value: seriesOptions.find((s) => s.id === values.series)?.label ?? values.series,
        }
      : null,
    values.from || values.to
      ? {
          key: "when",
          label: "When",
          value: [values.from && shortDay(values.from), values.to && shortDay(values.to)]
            .filter(Boolean)
            .join(" – "),
        }
      : null,
    values.city !== "all"
      ? {
          key: "city",
          label: PLACE.market,
          value: cityOptions.find((h) => h.id === values.city)?.label ?? values.city,
        }
      : null,
    values.season !== "all"
      ? {
          key: "season",
          label: "Season",
          value: seasonOptions.find((s) => s.id === values.season)?.label ?? values.season,
        }
      : null,
  ].filter((c): c is { key: string; label: string; value: string } => c !== null);

  /* Filters only, in a stable key order so the same view produces the same
     string every time and the control can tell "already saved" from "changed".
     Sort is left out: a standing view is about what a member looks at, not the
     order they look at it in. */
  const currentQs = React.useMemo(() => {
    const qs = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = values[key];
      if (value && value !== DEFAULTS[key]) qs.set(key, value);
    }
    return qs.toString();
  }, [values]);

  const clearFilters = () => clear([...FILTER_KEYS]);
  const dropChip = (key: string) => {
    if (key === "when") setMany({ when: "all", from: "", to: "" });
    else clear([key as (typeof FILTER_KEYS)[number]]);
  };

  /* The number on the button counts AXES, not keys: a date range writes three
     of them (when, from, to) and is one choice a reader made. */
  const filterCount =
    (cls !== "all" ? 1 : 0) +
    (values.series !== "all" ? 1 : 0) +
    (values.from || values.to ? 1 : 0) +
    (values.city !== "all" ? 1 : 0) +
    (values.season !== "all" ? 1 : 0);

  return (
    <>
      {/* One toolbar, the same one every list in this app uses. Setting is in
          the tray with the other axes and not out here in the open — it was
          kept out on the argument that it is the fastest cut anyone makes,
          which is the argument every surface makes about its own favourite
          axis, and five surfaces each winning it is how a six-row header gets
          built. */}
      <ListToolbar
        filterCount={filterCount}
        resultCount={list.length}
        resultNoun="episode"
        countSuffix={spanSuffix}
        sortValue={sort}
        sortOptions={SORTS}
        onSort={(id) => set("sort", id)}
        chips={chips}
        onDropChip={dropChip}
        onClear={clearFilters}
        trailing={
          <StandingControl current={currentQs} standing={standing} signedIn={signedIn} />
        }
        filters={
          <>
            <FilterPills
              label="Setting"
              value={cls}
              onChange={(next) => set("setting", next)}
              allCount={countWith("setting", "all")}
              options={FILTERS.map((f) => ({ ...f, count: countWith("setting", f.id) }))}
            />
            {seriesOptions.length > 1 ? (
              <FilterPills
                label="Series"
                value={values.series}
                onChange={(next) => set("series", next)}
                allCount={countWith("series", "all")}
                options={seriesOptions.map((s) => ({ ...s, count: countWith("series", s.id) }))}
              />
            ) : null}
            {/* When: picks rather than an axis, so they toggle — clicking the
                lit one hands the whole calendar back. */}
            <div className="ls-filters" role="group" aria-label="When">
              <span className="ls-filters__label">When</span>
              <Tag
                active={values.when === "all" && !values.from && !values.to}
                onClick={() => setMany({ when: "all", from: "", to: "" })}
              >
                Any time
              </Tag>
              {RANGES.map((r) => (
                <Tag key={r.id} active={values.when === r.id} onClick={() => pickRange(r.id)}>
                  {r.label}
                </Tag>
              ))}
            </div>
            {cityOptions.length > 1 ? (
              <FilterPills
                label={PLACE.market}
                value={values.city}
                onChange={(next) => set("city", next)}
                allCount={countWith("city", "all")}
                options={cityOptions.map((h) => ({ ...h, count: countWith("city", h.id) }))}
              />
            ) : null}
            {seasonOptions.length > 1 ? (
              <FilterPills
                label="Season"
                value={values.season}
                onChange={(next) => set("season", next)}
                allCount={countWith("season", "all")}
                options={seasonOptions.map((s) => ({ ...s, count: countWith("season", s.id) }))}
              />
            ) : null}
          </>
        }
      />
      <div className="ws-vlist">
        {groups.map((g) => (
          <section key={g.key}>
            {g.label ? <h2 className="ws-vmonth">{g.label}</h2> : null}
            {g.rows.map((v) => {
              /* No position here: coordinates are the venue's, and the
                 address comes with the pass — the episode page holds the same
                 line for anyone not aboard. */
              const meta = [
                v.distance,
                v.week,
                v.fleet,
                /* Before the drop hour the count is not an offer. The hour now
                   stands in the action column where the price would be, so
                   printing it here as well said the same thing twice. */
                v.onSale
                  ? null
                  : v.passesLeft != null && v.passesLeft > 0
                    ? `${v.passesLeft} ${v.seatsWord} left`
                    : null,
                v.deposit,
              ].filter((m): m is string => Boolean(m));
              return (
                <Link
                  key={v.id}
                  href={`/episodes/${v.slug}`}
                  className="ws-vrow__link"
                >
                  <div className="ws-vrow">
                    <div className="ws-vrow__date">
                      <b>{v.date}</b>
                      {v.time}
                    </div>
                    <div>
                      <span className="ls-eyebrow ws-vrow__eyebrow">
                        {v.seriesLabel}
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
                      {/* No price stands beside a door that is not a sale —
                          the detail page's rule, which this row did not carry.
                          price() renders a zero as COMPLIMENTARY, and every
                          episode of Season I is still priced at zero while its
                          sale hour is ahead, so the whole listing advertised a
                          free season. Announced, not on offer: the row says the
                          hour instead. */}
                      {v.status === "live" ? (
                        <span className="ls-live ws-live-label">Underway</span>
                      ) : v.onSale ? (
                        <span className="ws-vrow__price">{v.onSale}</span>
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
