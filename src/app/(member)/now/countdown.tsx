"use client";

import React from "react";

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

/* Mono countdown to the next departure — D · HH:MM:SS. */
export function Countdown({ target }: { target: string }) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick);
    const t = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, []);

  if (now === null) {
    return <span className="ls-mono-data">—</span>;
  }

  const diff = Math.max(0, new Date(target).getTime() - now);
  const s = Math.floor(diff / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  return (
    <span className="ls-mono-data" style={{ fontSize: 22, letterSpacing: ".08em" }}>
      {days > 0 ? `${days}D · ` : ""}
      {pad(hours)}:{pad(mins)}:{pad(secs)}
    </span>
  );
}
