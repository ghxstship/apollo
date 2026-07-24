import type { Metadata } from "next";
import Link from "next/link";
import { StateBlock } from "@/components/ds";
import { logDateTime, logTime } from "@/lib/format";
import { getMember, type Voyage } from "../data";
import { Countdown } from "./countdown";

export const metadata: Metadata = { title: "Now" };

function legTime(startIso: string, offsetMinutes: number): string {
  return logTime(new Date(new Date(startIso).getTime() + offsetMinutes * 60000).toISOString());
}

export default async function NowPage() {
  const { supabase } = await getMember();
  const nowIso = new Date().toISOString();

  const [liveRes, nextRes] = await Promise.all([
    supabase
      .from("voyages")
      .select("*")
      .eq("status", "live")
      .order("starts_at", { ascending: true })
      .limit(1),
    supabase
      .from("voyages")
      .select("*")
      .eq("status", "scheduled")
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(1),
  ]);

  const live: Voyage | null = liveRes.data?.[0] ?? null;
  const next: Voyage | null = nextRes.data?.[0] ?? null;

  if (!live) {
    return (
      <div className="ls-fade">
        <span className="mbr-eyebrow">Underway</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          Now.
        </h1>
        <div className="mbr-sec">
          <StateBlock
            status="empty"
            icon="Navigation"
            title="Nothing underway."
            detail={
              next
                ? `Next departure: ${next.title} · ${logDateTime(next.starts_at)}.`
                : "The manifest holds the next departure."
            }
            action={
              next ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                  <Countdown target={next.starts_at} />
                  <Link href="/manifest" className="ls-btn ls-btn--outline ls-btn--sm">
                    View the manifest
                  </Link>
                </div>
              ) : (
                <Link href="/manifest" className="ls-btn ls-btn--outline ls-btn--sm">
                  View the manifest
                </Link>
              )
            }
          />
        </div>
      </div>
    );
  }

  const boards = legTime(live.starts_at, -30);
  const castOff = logTime(live.starts_at);
  const swimStop = legTime(live.starts_at, 240);
  const goldenHour = legTime(live.starts_at, 600);

  return (
    <div className="ls-fade">
      <div className="now-hero">
        <span
          className="ls-live"
          style={{
            font: "600 9px var(--font-sans)",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "var(--neon-cyan)",
          }}
        >
          Underway · {live.title}
        </span>
        <h1>Rail down, all well.</h1>
        <div className="now-cond">
          <span>WIND 12 KN SW</span>
          <span>SWELL 2 FT</span>
          <span>HDG 214°</span>
          <span>7.8 KN</span>
          {live.coordinates ? <span>{live.coordinates}</span> : null}
        </div>
      </div>
      <div className="now-seam"></div>

      <div className="now-tl ls-rise">
        <div className="done">
          <span className="t">{boards}</span>
          <span className="dot"><i></i></span>
          <div>
            <b>Boards</b>
            <p>Muster at the gangway. Waivers clear, coffee below deck.</p>
          </div>
        </div>
        <div className="here">
          <span className="t">{castOff}</span>
          <span className="dot"><i></i></span>
          <div>
            <b className="ls-live">Underway</b>
            <p>Open water. Watch two on deck; helm open to first-timers.</p>
          </div>
        </div>
        <div>
          <span className="t">{swimStop}</span>
          <span className="dot"><i></i></span>
          <div>
            <b>Swim stop</b>
            <p>If the water agrees. Ladder aft, buddy up.</p>
          </div>
        </div>
        <div>
          <span className="t">{goldenHour}</span>
          <span className="dot"><i></i></span>
          <div>
            <b>Golden hour</b>
            <p>The long light home. Back before it goes.</p>
          </div>
        </div>
      </div>

      <div className="now-panel ls-rise-1">
        <h3>Find your way</h3>
        <div className="now-way">
          <div>
            <b>The head</b>
            <span>BELOW, FORWARD, MIND THE STEP</span>
          </div>
          <div>
            <b>Life vests</b>
            <span>COCKPIT LOCKER, STARBOARD</span>
          </div>
          <div>
            <b>Dry bags</b>
            <span>UNDER THE NAV TABLE</span>
          </div>
          <div>
            <b>The skipper</b>
            <span>AT THE HELM · JUST ASK</span>
          </div>
        </div>
      </div>
    </div>
  );
}
