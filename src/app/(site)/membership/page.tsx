import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ds";
import { SUB_CLASSES } from "@/lib/brand";
import { SectionHeader } from "@/components/site/section-header";
import { TaglineMark } from "@/components/site/logo";
import { price } from "@/lib/format";
import { stripeEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { ApplyForm } from "./apply-form";
import { JoinControl } from "./join-control";

export const metadata: Metadata = {
  alternates: { canonical: "/membership" },
  /* Casting, not Membership: the nav, the footer and this title each named the
     same page differently. Casting is the show's word and the page's own
     eyebrow already used it.

     The description also said the five plans come "each in three class tiers",
     which was wrong twice over. Access carries no tiers at all — it is the
     platform account, passes bought at each episode's listed price — and the
     three tiers stopped being classes when the taxonomy split in two: they are
     durations, and the grid has printed their hours since. */
  title: "Casting",
  description:
    "Five ways aboard — Access, Regional, National, Global and Guest. Four carry three duration tiers: up to 4 hours, up to 8 hours, any length. Membership is by invitation or application.",
};

type Plan = Tables<"membership_plans">;

/* Row order and prose for the plan grid. Prices, allowances, and class
   ceilings render live from membership_plans — nothing hardcoded here. */
const PLAN_TYPES: Array<{ type: Plan["plan_type"]; name: string; blurb: string }> = [
  { type: "access", name: "Access", blurb: "The platform, no dues" },
  { type: "regional", name: "Regional", blurb: "Your home city" },
  { type: "national", name: "National", blurb: "All US cities" },
  { type: "global", name: "Global", blurb: "Every city worldwide" },
  { type: "guest", name: "Guest", blurb: "One episode, member-sponsored" },
];

/* The class tiers are numbered and named by their ceiling in hours. The ladder
   words are gone from the page entirely: the hours were always beside them and
   were always the fact a member was reading. The key still prices the plan and
   gates the ceiling — it just does not print. The cell's own note keeps the
   precise range, which is the half of the old string that was doing the work. */
const TIER_HEADS: Array<[string, string]> = [
  ["I", SUB_CLASSES.passage.label],
  ["II", SUB_CLASSES.expedition.label],
  ["III", SUB_CLASSES.odyssey.label],
];

const KNOTS: Array<[string, string]> = [
  ["10 KN / NM", "Every nautical mile under sail banks ten knots to your ledger."],
  ["40 KN / shore night", "A night ashore counts. Long tables, records, the golden hour."],
  ["250 KN / referral", "When someone you sent comes aboard, the ledger remembers."],
];

export default async function MembershipPage() {
  const supabase = await createClient();
  const [{ data: plans }, { data: auth }] = await Promise.all([
    supabase
      .from("membership_plans")
      .select("*")
      .eq("active", true)
      .order("tier", { ascending: true }),
    supabase.auth.getUser(),
  ]);

  /* Signed-in members can take a standing from the grid itself; everyone else
     keeps the application flow below it. */
  const user = auth?.user ?? null;
  const { data: profile } = user
    ? await supabase.from("profiles").select("plan_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const duesOpen = Boolean(user) && stripeEnabled();
  const heldPlanId = profile?.plan_id ?? null;

  const byCell = new Map<string, Plan>();
  for (const p of plans ?? []) byCell.set(`${p.plan_type}-${p.tier}`, p);

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">Casting</span>
        <h1>Five ways aboard.</h1>
        <p className="ws-phead__tag"><TaglineMark /></p>
        {/* Was "Geography sets where you sail; the class tier sets how far."
            Wrong on both halves: the tier is a duration ceiling, not a class,
            and it sets how LONG rather than how far — and most of the season
            does not sail anywhere. */}
        <p className="ws-phead__sub">
          Membership is by invitation or application. Geography sets which
          cities you can book; the tier sets how long an episode may run. Dues
          keep passes few.
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
              {type === "global" ? <Badge tone="gold">Most aboard</Badge> : null}
              <span>{blurb}</span>
            </div>
            {/* Access has no tiers — platform account, passes bought à la
                carte at each episode's listed price. One cell spans the row. */}
            {type === "access" ? (
              <div className="ws-plans__cell ws-plans__cell--span">
                <span className="ws-plans__price">Complimentary</span>
                <span className="ws-plans__ev">
                  Passes à la carte — priced per episode, no membership required
                </span>
                <span className="ws-plans__note">
                  BOOK ANY OPEN EPISODE AT ITS LISTED PRICE
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
                      {/* Model C moved the value from a pass allowance to a
                          monthly credit, set events_per_month to 0 on every
                          plan, and left this branch reading the old column — so
                          the page described Deck, Cabin, Owner and Founding,
                          up to a thousand dollars a month, as "Waitlist + one
                          invitation ashore". Four paying tiers, one line, and
                          the line belonged to a tier that pays nothing.

                          The credit IS the product now, so the credit is what
                          the card says. events_per_month is still read as the
                          fallback because a plan may yet be written the old
                          way; it is no longer the first question asked. */}
                      <span className="ws-plans__ev">
                        {p.monthly_credit_cents > 0
                          ? `${price(p.monthly_credit_cents)} of passes every month`
                          : p.events_per_month > 0
                            ? `${p.events_per_month} ${p.events_per_month === 1 ? "episode" : "episodes"} / mo`
                            : "Waitlist + one invitation ashore"}
                      </span>
                      {p.monthly_credit_cents > 0 ? (
                        <span className="ws-plans__note">
                          SPEND IT ON ANY EPISODE · UNSPENT CREDIT CLEARS ON THE 1ST
                        </span>
                      ) : null}
                      {p.class_ceiling && SUB_CLASSES[p.class_ceiling] ? (
                        <span className="ws-plans__note">
                          {SUB_CLASSES[p.class_ceiling].note}
                        </span>
                      ) : null}
                      {duesOpen && p.price_cents > 0 ? (
                        <JoinControl
                          planId={p.id}
                          action={
                            p.id === heldPlanId ? "current" : heldPlanId ? "switch" : "join"
                          }
                        />
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
          one night ashore as a guest usually settles it.
        </p>
        <ApplyForm />
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", marginTop: 20 }}>
          Applied already? <Link href="/apply-status">Read where you stand</Link> — four
          stages, no silence.
        </p>
      </div>
    </div>
  );
}
