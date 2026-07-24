import type React from "react";

/* Eyebrow-over-title section head, with an optional right-hand aside. */
export function SectionHeader({
  eyebrow,
  title,
  aside,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="ws-shead">
      <div>
        <div className="ls-eyebrow ws-shead__eb">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      {aside ? <div className="ws-shead__aside">{aside}</div> : null}
    </div>
  );
}
