"use client";

import React from "react";
import Link from "next/link";
import { Avatar, Input, StateBlock, Tag } from "@/components/ds";
import { PLACE } from "@/lib/brand";

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
  interests: string[];
  shared: number;
  self: boolean;
};

export type CityOption = { id: string; name: string };

const LEAGUES = [1, 2, 3, 4, 5];

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
  const [query, setQuery] = React.useState("");
  const [city, setCity] = React.useState("all");
  const [league, setLeague] = React.useState("all");

  const shown = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter((m) => {
      if (city !== "all" && m.harborId !== city) return false;
      if (league !== "all" && String(m.league) !== league) return false;
      if (!needle) return true;
      return (
        m.name.toLowerCase().includes(needle) ||
        (m.handle ?? "").toLowerCase().includes(needle) ||
        m.interests.some((i) => i.toLowerCase().includes(needle))
      );
    });
  }, [members, query, city, league]);

  return (
    <div className="dir">
      <Input
        label="Search the roster"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="A name, a handle, an interest"
        aria-label="Search the roster"
      />

      <div className="dir-filters" role="group" aria-label={`Filter by ${PLACE.market}`}>
        <Tag active={city === "all"} onClick={() => setCity("all")}>
          All {PLACE.markets.toLowerCase()}
        </Tag>
        {cities.map((h) => (
          <Tag key={h.id} active={city === h.id} onClick={() => setCity(h.id)}>
            {h.name}
          </Tag>
        ))}
      </div>

      <div className="dir-filters" role="group" aria-label="Filter by League">
        <Tag active={league === "all"} onClick={() => setLeague("all")}>
          All leagues
        </Tag>
        {LEAGUES.map((n) => (
          <Tag key={n} active={league === String(n)} onClick={() => setLeague(String(n))}>
            League {n}
          </Tag>
        ))}
      </div>

      <p className="mbr-mono dir-count">
        {partial
          ? `${shown.length} of ${members.length} loaded · ${listed} listed`
          : `${shown.length} of ${listed} listed`}
      </p>

      {shown.length === 0 ? (
        <StateBlock
          status="empty"
          icon="Users"
          title="Nobody matches that."
          detail="Widen the search, or clear a filter."
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
