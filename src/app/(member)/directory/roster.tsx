"use client";

import React from "react";
import Link from "next/link";
import { Avatar, Button, FilterPills, Input, ListToolbar, StateBlock, Tag } from "@/components/ds";
import { PLACE } from "@/lib/brand";
import { useDebouncedParam, useFilterParams } from "@/lib/use-filter-params";

export type DirectoryMember = {
  id: string;
  name: string;
  handle: string | null;
  tone: "ink" | "sea" | "gold" | "sand";
  harborId: string;
  harborName: string;
  cityCode: string;
  league: number;
  leagueName: string;
  passes: number;
  joined: string;
  /** The date behind the printed one, so the sort can order on it. */
  joinedMs: number;
  interests: string[];
  shared: number;
  self: boolean;
};

export type CityOption = { id: string; name: string };

const LEAGUES = [1, 2, 3, 4, 5];

const DEFAULTS = { q: "", city: "all", league: "all", sort: "name" };

/* The roster arrived in whatever order the query returned it, which is not an
   order — it is the absence of one. Four questions a member actually asks of a
   roster, and the default is the one that makes it a directory. */
const SORTS = [
  { id: "name", label: "Name A – Z" },
  { id: "newest", label: "Newest aboard" },
  { id: "longest", label: "Longest aboard" },
  { id: "passes", label: "Most passes" },
];

function RowBody({ m }: { m: DirectoryMember }) {
  return (
    <>
      <Avatar name={m.name} tone={m.tone} />
      <div className="dir-row__body">
        <div className="dir-row__name">
          <b>{m.name}</b>
          {m.handle ? <span>@{m.handle}</span> : null}
        </div>
        <div className="dir-row__where">
          {m.harborName}
          {m.cityCode ? <span className="dir-row__code">{m.cityCode}</span> : null}
          <span className="dir-row__dot">·</span>
          {m.leagueName}
        </div>
        <div className="mbr-mono dir-row__data">
          {m.passes} {m.passes === 1 ? "pass" : "passes"} · joined {m.joined}
        </div>
        {m.interests.length ? (
          <div className="dir-row__tags">
            {m.interests.map((i) => (
              <Tag key={i}>{i}</Tag>
            ))}
          </div>
        ) : null}
      </div>
      <div className="dir-row__aff mbr-mono">
        {m.self ? <span>this is you</span> : null}
        {!m.self && m.shared > 0 ? <span>sailed together ×{m.shared}</span> : null}
      </div>
    </>
  );
}

export function DirectoryList({
  members,
  cities,
  total,
}: {
  members: DirectoryMember[];
  cities: CityOption[];
  /* Everyone listed, which may be more than the page has loaded. */
  total?: number;
}) {
  const listed = total ?? members.length;
  const partial = listed > members.length;
  /* The roster's state is the URL, like every other list in the app — so a
     member can send someone "here is everyone in League 4 in Miami" rather
     than describing it. */
  const { values, set, clear, activeKeys } = useFilterParams(DEFAULTS);
  const sort = SORTS.some((s) => s.id === values.sort) ? values.sort : "name";
  /* The one control that must not write on every keystroke: the field keeps
     its own value so typing stays immediate, and the URL catches up after a
     pause, which is when a link is worth minting. */
  const [draft, onQuery] = useDebouncedParam(values.q, (next) => set("q", next));

  const matches = React.useCallback(
    (m: DirectoryMember, f: { q: string; city: string; league: string }) => {
      if (f.city !== "all" && m.harborId !== f.city) return false;
      if (f.league !== "all" && String(m.league) !== f.league) return false;
      const needle = f.q.trim().toLowerCase();
      if (!needle) return true;
      return (
        m.name.toLowerCase().includes(needle) ||
        (m.handle ?? "").toLowerCase().includes(needle) ||
        m.interests.some((i) => i.toLowerCase().includes(needle))
      );
    },
    []
  );

  const current = React.useMemo(
    () => ({ q: values.q, city: values.city, league: values.league }),
    [values.q, values.city, values.league]
  );

  const shown = React.useMemo(() => {
    const rows = members.filter((m) => matches(m, current));
    /* Name is the tiebreak under every order, so equal rows never shuffle. */
    const byName = (a: DirectoryMember, b: DirectoryMember) => a.name.localeCompare(b.name);
    return rows.sort((a, b) => {
      switch (sort) {
        case "newest":
          return b.joinedMs - a.joinedMs || byName(a, b);
        case "longest":
          return a.joinedMs - b.joinedMs || byName(a, b);
        case "passes":
          return b.passes - a.passes || byName(a, b);
        default:
          return byName(a, b);
      }
    });
  }, [members, matches, current, sort]);

  /* How many each pill would leave, with every other axis held where it is. */
  const countWith = React.useCallback(
    (axis: "city" | "league", value: string) =>
      members.filter((m) => matches(m, { ...current, [axis]: value })).length,
    [members, matches, current]
  );

  const chips = [
    values.q
      ? { key: "q", label: "Search", value: values.q }
      : null,
    values.city !== "all"
      ? {
          key: "city",
          label: PLACE.market,
          value: cities.find((h) => h.id === values.city)?.name ?? values.city,
        }
      : null,
    values.league !== "all"
      ? { key: "league", label: "League", value: `League ${values.league}` }
      : null,
  ].filter((c): c is { key: string; label: string; value: string } => c !== null);

  /* The field holds its own draft, so clearing the URL has to clear the field
     with it or the box would still read what the list no longer reflects. */
  /* Sort is not a filter — clearing the filters leaves the order alone. */
  const clearAll = () => {
    onQuery("");
    clear(["q", "city", "league"]);
  };
  const dropChip = (key: string) => {
    if (key === "q") onQuery("");
    else clear([key as "city" | "league"]);
  };

  return (
    <div className="dir">
      <ListToolbar
        search={
          <Input
            label="Search the roster"
            value={draft}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="A name, a handle, an interest"
            aria-label="Search the roster"
          />
        }
        filterCount={(values.city !== "all" ? 1 : 0) + (values.league !== "all" ? 1 : 0)}
        sortValue={sort}
        sortOptions={SORTS}
        onSort={(id) => set("sort", id)}
        resultCount={shown.length}
        resultNoun="member"
        countSuffix={partial ? ` of ${members.length} loaded · ${listed} listed` : ` of ${listed} listed`}
        chips={chips}
        onDropChip={dropChip}
        onClear={clearAll}
        filters={
          <>
            <FilterPills
              label={PLACE.market}
              value={values.city}
              onChange={(next) => set("city", next)}
              allLabel={`All ${PLACE.markets.toLowerCase()}`}
              allCount={countWith("city", "all")}
              options={cities.map((h) => ({ id: h.id, label: h.name, count: countWith("city", h.id) }))}
            />
            <FilterPills
              label="League"
              value={values.league}
              onChange={(next) => set("league", next)}
              allLabel="All leagues"
              allCount={countWith("league", "all")}
              options={LEAGUES.map((n) => ({
                id: String(n),
                label: `League ${n}`,
                count: countWith("league", String(n)),
              }))}
            />
          </>
        }
      />

      {shown.length === 0 ? (
        /* An empty list that tells the reader to clear a filter should hand
           them the control that does it — the manifest's rule, which this
           surface did not carry. */
        <StateBlock
          status="empty"
          icon="Users"
          title="Nobody matches that."
          detail="Widen the search, or clear a filter."
          action={
            activeKeys.length > 0 ? (
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="dir-list">
          {shown.map((m) =>
            m.handle ? (
              <Link key={m.id} href={`/directory/${m.handle}`} className="dir-row">
                <RowBody m={m} />
              </Link>
            ) : (
              <div key={m.id} className="dir-row dir-row--flat">
                <RowBody m={m} />
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
