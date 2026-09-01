"use client";

import Link from "next/link";
import React from "react";
import { Badge, Tag } from "@/components/ds";

export interface ManifestItem {
  id: string;
  slug: string;
  title: string;
  cls: "sea" | "shore" | "sky";
  clsLabel: string;
  kindLabel: string;
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
  duration: string | null;
  week: string;
  fleet: string | null;
  deposit: string | null;
  harborId: string | null;
  harborLabel: string | null;
  seasonId: string | null;
  seasonLabel: string | null;
  /** Title of the series this sailing belongs to, when it belongs to one. */
  series: string | null;
  monthKey: string;
  startsMs: number;
}

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "sea", label: "Sea Day" },
  { id: "shore", label: "Port Day" },
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
     Items arrive soonest-first, so the options read in sailing order. */
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

  /* Legacy sky-class rows read as Port Day. */
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

  return (
    <>
      <div className="ws-vcontrols">
        <div className="ws-vfilters">
          <span className="ws-vfilters__label">Class</span>
          {FILTERS.map((f) => (
            <Tag key={f.id} active={cls === f.id} onClick={() => setCls(f.id)}>
              {f.label}
            </Tag>
          ))}
        </div>
        {harborOptions.length > 1 ? (
          <div className="ws-vfilters">
            <span className="ws-vfilters__label">Harbor</span>
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
        <div className="ws-vfilters">
          <span className="ws-vfilters__label">Sort</span>
          <Tag active={sort === "soonest"} onClick={() => setSort("soonest")}>
            Soonest
          </Tag>
          <Tag active={sort === "furthest"} onClick={() => setSort("furthest")}>
            Furthest out
          </Tag>
        </div>
      </div>
      <div style={{ padding: "32px 0 96px" }}>
        {list.map((v) => {
          const meta = [
            v.coordinates,
            v.distance,
            v.duration,
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
              href={`/charters/${v.slug}`}
              style={{ color: "inherit", textDecoration: "none", display: "block" }}
            >
              <div className="ws-vrow">
                <div className="ws-vrow__date">
                  <b>{v.date}</b>
                  {v.time}
                </div>
                <div>
                  <span className="ls-eyebrow ws-vrow__eyebrow">
                    {v.clsLabel}
                    {v.kindLabel ? ` · ${v.kindLabel}` : ""}
                  </span>
                  <div className="ws-vrow__title">
                    {v.title}
                    {v.status === "weather_hold" ? <Badge tone="caution">Weather hold</Badge> : null}
                    {v.passesLeft === 0 && !v.onSale ? <Badge tone="caution">Full</Badge> : null}
                    {v.onSale ? <Badge tone="outline">Not yet on sale</Badge> : null}
                    {/* A quiet mark that this sailing runs in a series. */}
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
        {list.length === 0 ? (
          <p style={{ padding: "48px 0", color: "var(--text-3)" }}>
            Nothing under that flag this season. Loosen the filters.
          </p>
        ) : null}
      </div>
    </>
  );
}
