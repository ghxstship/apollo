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
  berthsLeft: number | null;
  seatsWord: string;
  blurb: string | null;
}

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "sea", label: "Sea Day" },
  { id: "shore", label: "Port Day" },
  { id: "sky", label: "Overnight" },
];

export function VoyageManifest({ items }: { items: ManifestItem[] }) {
  const [cls, setCls] = React.useState("all");
  const list = items.filter((v) => cls === "all" || v.cls === cls);

  return (
    <>
      <div className="ws-vfilters">
        {FILTERS.map((f) => (
          <Tag key={f.id} active={cls === f.id} onClick={() => setCls(f.id)}>
            {f.label}
          </Tag>
        ))}
      </div>
      <div style={{ padding: "32px 0 96px" }}>
        {list.map((v) => (
          <Link
            key={v.id}
            href={`/voyages/${v.slug}`}
            style={{ color: "inherit", textDecoration: "none", display: "block" }}
          >
            <div className="ws-vrow">
              <div className="ws-vrow__date">
                <b>{v.date}</b>
                {v.time}
              </div>
              <div>
                <span className="ls-eyebrow ws-vrow__eyebrow">
                  {v.clsLabel} · {v.kindLabel}
                </span>
                <div className="ws-vrow__title">
                  {v.title}
                  {v.status === "weather_hold" ? <Badge tone="clay">Weather hold</Badge> : null}
                  {v.berthsLeft === 0 ? <Badge tone="clay">Full</Badge> : null}
                </div>
                <div className="ws-vrow__meta">
                  {v.coordinates ? <span>{v.coordinates}</span> : null}
                  {v.distance ? <span>· {v.distance}</span> : null}
                  {v.berthsLeft != null && v.berthsLeft > 0 ? (
                    <span>
                      · {v.berthsLeft} {v.seatsWord} left
                    </span>
                  ) : null}
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
        ))}
        {list.length === 0 ? (
          <p style={{ padding: "48px 0", color: "var(--text-3)" }}>
            Nothing under that flag this season. Loosen the filters.
          </p>
        ) : null}
      </div>
    </>
  );
}
