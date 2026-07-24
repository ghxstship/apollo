import type { Metadata } from "next";
import { Badge } from "@/components/ds";
import { SectionHeader } from "@/components/site/section-header";
import { TAGLINE } from "@/lib/brand";
import { price } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = {
  title: "Membership",
  description:
    "Five ways aboard — Access, Regional, National, Global, and Guest passes, each in three class tiers. Membership is by invitation or application.",
};

type Plan = Tables<"membership_plans">;

/* Row order and prose for the plan grid. Prices, allowances, and class
   ceilings render live from membership_plans — nothing hardcoded here. */
const PLAN_TYPES: Array<{ type: Plan["plan_type"]; name: string; blurb: string }> = [
  { type: "access", name: "Access", blurb: "The platform, no dues" },
  { type: "regional", name: "Regional", blurb: "Your home harbor" },
  { type: "national", name: "National", blurb: "All US harbors" },
  { type: "global", name: "Global", blurb: "Every harbor worldwide" },
  { type: "guest", name: "Guest", blurb: "One event, member-sponsored" },
];

const TIER_HEADS: Array<[string, string]> = [
  ["I", "Voyage"],
  ["II", "Expedition"],
  ["III", "Odyssey"],
];

const CEILING_NOTE: Record<string, string> = {
  voyage: "Through Voyage · under 4 hrs",
  expedition: "Through Expedition · 4–8 hrs",
  odyssey: "Through Odyssey · over 8 hrs",
};

const KNOTS: Array<[string, string]> = [
  ["10 KN / NM", "Every nautical mile under sail banks ten knots to your ledger."],
  ["40 KN / Port Day", "A day ashore counts. Long tables, records, the golden hour."],
  ["250 KN / referral", "When someone you sent comes aboard, the ledger remembers."],
];

export default async function MembershipPage() {
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("membership_plans")
    .select("*")
    .eq("active", true)
    .order("tier", { ascending: true });

  const byCell = new Map<string, Plan>();
  for (const p of plans ?? []) byCell.set(`${p.plan_type}-${p.tier}`, p);

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">The manifest</span>
        <h1>Five ways aboard.</h1>
        <p className="ws-phead__tag">{TAGLINE}</p>
        <p className="ws-phead__sub">
          Membership is by invitation or application. Geography sets where you
          sail; the class tier sets how far. Dues keep passes few and tables
          long.
        </p>
      </div>

      <div className="ws-plans">
        <div className="ws-plans__row ws-plans__row--head">
          <div></div>
          {TIER_HEADS.map(([n, name]) => (
            <div key={n} className="ws-plans__th">
              {n} · {name}
            </div>
          ))}
        </div>
        {PLAN_TYPES.map(({ type, name, blurb }) => (
          <div className="ws-plans__row" key={type}>
            <div className="ws-plans__label">
              <b>{name}</b>
              {type === "global" ? <Badge tone="brass">Most aboard</Badge> : null}
              <span>{blurb}</span>
            </div>
            {/* Access has no tiers — platform account, passes bought à la
                carte at each event's listed price. One cell spans the row. */}
            {type === "access" ? (
              <div className="ws-plans__cell ws-plans__cell--span">
                <span className="ws-plans__price">Complimentary</span>
                <span className="ws-plans__ev">
                  Passes à la carte — priced per event, no membership required
                </span>
                <span className="ws-plans__note">
                  BOOK ANY OPEN SAILING AT ITS LISTED PRICE
                </span>
              </div>
            ) : null}
            {type !== "access" && TIER_HEADS.map(([n, tierName], i) => {
              const p = byCell.get(`${type}-${i + 1}`);
              return (
                <div className="ws-plans__cell" key={n}>
                  <span className="ws-plans__tier">
                    {n} · {tierName}
                  </span>
                  {p ? (
                    <>
                      <span className="ws-plans__price">
                        {p.price_cents ? `${price(p.price_cents)} / mo` : "Complimentary"}
                      </span>
                      <span className="ws-plans__ev">
                        {p.events_per_month === 0
                          ? "Waitlist + one Port Day invitation"
                          : `${p.events_per_month} ${p.events_per_month === 1 ? "event" : "events"} / mo`}
                      </span>
                      {p.class_ceiling ? (
                        <span className="ws-plans__note">{CEILING_NOTE[p.class_ceiling]}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="ws-plans__dash">—</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="ws-knots">
        <div>
          <span className="ws-knots__n">Knots</span>
          <p>
            The club&rsquo;s ledger runs in knots, not likes — more knots,
            farther water. They never expire while you&rsquo;re aboard, and they
            gift forward if you ever depart.
          </p>
        </div>
        {KNOTS.map(([n, body]) => (
          <div key={n}>
            <span className="ws-knots__n">{n}</span>
            <p>{body}</p>
          </div>
        ))}
        <div>
          <span className="ws-knots__n">Leagues</span>
          <p>Depth comes with tenure — five leagues down.</p>
        </div>
      </div>

      <div className="ws-apply" id="apply">
        <SectionHeader eyebrow="Crew wanted, member first" title="Request invitation." />
        <p style={{ color: "var(--text-2)", maxWidth: "52ch", marginTop: -24 }}>
          A person reads every application. Two member signatures shorten the wait;
          one Port Day as a guest usually settles it.
        </p>
        <ApplyForm />
      </div>
    </div>
  );
}
