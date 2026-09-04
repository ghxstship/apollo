import type { Metadata } from "next";
import Link from "next/link";
import { SUB_CLASSES } from "@/lib/brand";
import { SectionHeader } from "@/components/site/section-header";
import { TaglineMark } from "@/components/site/logo";
import { countWord, guestAllowanceLabel, guestLine, listWords } from "@/components/site/plan-copy";
import { readPublicPlans, type PublicPlan } from "@/components/site/plans-data";
import { price } from "@/lib/format";
import { stripeEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { ApplyForm } from "./apply-form";
import { JoinControl } from "./join-control";

/* Casting, not Membership: the nav, the footer and this title each named the
   same page differently. Casting is the show's word and the page's own
   eyebrow already used it.

   The description used to be a literal — "Access, Regional, National, Global
   and Guest … three duration tiers" — and it outlived the plans it named by
   two days. Model C has five named plans with a monthly credit and a guest
   allowance each, and the names, the count and the allowance are columns. The
   description is built from them now, the same way the grid is. */
export async function generateMetadata(): Promise<Metadata> {
  const plans = await readPublicPlans();
  const names = plans.map((p) => p.label);
  const description = [
    names.length > 0 ? `${capitalise(countWord(names.length))} ways aboard — ${listWords(names)}.` : "Ways aboard.",
    "Paid plans carry a monthly credit against passes.",
    guestLine(plans),
    "Membership is by invitation or application.",
  ].join(" ");
  return {
    alternates: { canonical: "/membership" },
    title: "Casting",
    description,
  };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* What the plan_type still says under Model C: the geography a plan books.
   It is an axis on the plan, not the plan's name — the name is the label. */
const REACH: Record<PublicPlan["plan_type"], string> = {
  access: "Any open episode, at its listed price",
  regional: "Books your home city",
  national: "Books every US city",
  global: "Books every city",
  guest: "One episode, member-sponsored",
};

const KNOTS: Array<[string, string]> = [
  ["10 KN / NM", "Every nautical mile under sail banks ten knots to your ledger."],
  ["40 KN / shore night", "A night ashore counts. Long tables, records, the golden hour."],
  ["250 KN / referral", "When someone you sent comes aboard, the ledger remembers."],
];

export default async function MembershipPage() {
  const supabase = await createClient();
  const [plans, { data: auth }, { data: questions }] = await Promise.all([
    /* Unpublish on the Bridge and the plan leaves this page. It was a badge
       with nothing behind it until 2026-09-04. */
    readPublicPlans(supabase),
    supabase.auth.getUser(),
    /* The application's own questions, set on the Bridge and readable from
       the shore. Position order; inactive ones never render. */
    supabase
      .from("application_questions")
      .select("key, prompt, kind, options, required, position")
      .eq("active", true)
      .order("position", { ascending: true }),
  ]);

  /* Signed-in members can take a standing from the grid itself; everyone else
     keeps the application flow below it. */
  const user = auth?.user ?? null;
  const { data: profile } = user
    ? await supabase.from("profiles").select("plan_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const duesOpen = Boolean(user) && stripeEnabled();
  const heldPlanId = profile?.plan_id ?? null;

  const paid = plans.filter((p) => p.price_cents > 0);
  const guests = guestLine(plans);

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">Casting</span>
        <h1>{plans.length > 0 ? `${capitalise(countWord(plans.length))} ways aboard.` : "Ways aboard."}</h1>
        <p className="ws-phead__tag"><TaglineMark /></p>
        {/* Was "Geography sets which cities you can book; the tier sets how
            long an episode may run." That described a grid the plans no
            longer form. What a paid plan carries now is a credit, a guest
            allowance and a head start, and each is a column below. */}
        <p className="ws-phead__sub">
          Membership is by invitation or application.
          {paid.length > 0
            ? " Every paid plan carries a monthly credit against passes and a head start on the manifest. "
            : " "}
          {guests} Dues keep passes few.
        </p>
      </div>

      <div className="ws-plans">
        <div className="ws-plans__row ws-plans__row--head">
          <div></div>
          <div className="ws-plans__th">Dues</div>
          <div className="ws-plans__th">Credit</div>
          <div className="ws-plans__th">Carries</div>
        </div>
        {plans.map((p) => {
          const paidPlan = p.price_cents > 0;
          const ceiling = p.class_ceiling ? SUB_CLASSES[p.class_ceiling] : null;
          return (
            <div className="ws-plans__row" key={p.id}>
              <div className="ws-plans__label">
                <b>{p.label}</b>
                <span>{REACH[p.plan_type]}</span>
              </div>

              {/* Access has no dues and no credit — platform account, passes
                  bought à la carte at each episode's listed price. One cell
                  spans the row. */}
              {!paidPlan ? (
                <div className="ws-plans__cell ws-plans__cell--span">
                  <span className="ws-plans__price">Complimentary</span>
                  <span className="ws-plans__ev">
                    Passes à la carte — priced per episode, no dues
                  </span>
                  <span className="ws-plans__note">
                    {[
                      "BOOK ANY OPEN EPISODE AT ITS LISTED PRICE",
                      p.early_days > 0 ? `PASSES OPEN TO YOU ${p.early_days} DAYS AHEAD` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              ) : (
                <>
                  <div className="ws-plans__cell">
                    <span className="ws-plans__tier">Dues</span>
                    <span className="ws-plans__price">{price(p.price_cents)} / mo</span>
                    {p.annual_price_cents ? (
                      <span className="ws-plans__ev">
                        or {price(p.annual_price_cents)} a year
                      </span>
                    ) : null}
                    <span className="ws-plans__note">CANCEL ANYTIME · UNUSED MONTHS CREDIT FORWARD</span>
                    {duesOpen ? (
                      <JoinControl
                        planId={p.id}
                        action={p.id === heldPlanId ? "current" : heldPlanId ? "switch" : "join"}
                      />
                    ) : null}
                  </div>
                  <div className="ws-plans__cell">
                    <span className="ws-plans__tier">Credit</span>
                    {/* Model C moved the value from a pass allowance to a
                        monthly credit. The credit IS the product, so the
                        credit is what the card says. */}
                    {p.monthly_credit_cents > 0 ? (
                      <>
                        <span className="ws-plans__price">{price(p.monthly_credit_cents)} / mo</span>
                        <span className="ws-plans__ev">of passes, every month</span>
                        <span className="ws-plans__note">
                          SPEND IT ON ANY EPISODE · UNSPENT CREDIT CLEARS ON THE 1ST
                        </span>
                      </>
                    ) : p.events_per_month > 0 ? (
                      <span className="ws-plans__ev">
                        {p.events_per_month} {p.events_per_month === 1 ? "episode" : "episodes"} / mo
                      </span>
                    ) : (
                      <span className="ws-plans__dash">—</span>
                    )}
                  </div>
                  <div className="ws-plans__cell">
                    <span className="ws-plans__tier">Carries</span>
                    <span className="ws-plans__price">{guestAllowanceLabel(p.guest_allowance)}</span>
                    <span className="ws-plans__ev">
                      {p.early_days > 0
                        ? `Passes open to you ${p.early_days} days ahead`
                        : "Passes open to you on the public hour"}
                    </span>
                    {ceiling ? (
                      <span className="ws-plans__note">
                        EPISODES {ceiling.label.toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {plans.length === 0 ? (
          <div className="ws-plans__row">
            <div className="ws-plans__label">
              <span>No plan is published yet. The application below still stands.</span>
            </div>
          </div>
        ) : null}
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
        <ApplyForm questions={questions ?? []} />
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", marginTop: 20 }}>
          Applied already? <Link href="/apply-status">Read where you stand</Link> — four
          stages, no silence.
        </p>
      </div>
    </div>
  );
}
