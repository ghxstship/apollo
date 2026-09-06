import type { Metadata } from "next";
import { Badge, LinkButton, Progress, StateBlock, Table } from "@/components/ds";
import { logDate, price, logDateYear } from "@/lib/format";
import { stripeEnabled } from "@/lib/stripe";
import { subscriptionToShow } from "@/lib/dues";
import { getMember } from "../data";
import { JoinedNotice, ManageBillingButton, StandingControls } from "./billing-client";
import { AccountStatement, STATEMENT_MAX } from "./statement";
import { ExportDataButton } from "./export-data";

export const metadata: Metadata = { title: "Account" };

/* The billing room — what the club draws, what it drew, and the card it draws
   on. Dues themselves are Stripe's; this page only reads what the webhook
   wrote and hands the member off when they want to change something. */

type InvoiceRow = {
  id: string;
  created_at: string;
  number: string | null;
  amount_cents: number;
  status: string;
  hosted_url: string | null;
  [key: string]: unknown;
};

type AccountRow = {
  id: string;
  created_at: string;
  kind: string;
  memo: string | null;
  delta_cents: number;
  [key: string]: unknown;
};

const STATUS_TONE: Record<string, "positive" | "caution" | "outline"> = {
  active: "positive",
  trialing: "positive",
  past_due: "caution",
  paused: "outline",
  canceled: "outline",
  incomplete: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Running",
  trialing: "On trial",
  past_due: "Did not clear",
  paused: "Paused",
  canceled: "Closed",
  incomplete: "Not yet started",
};

/* 'unknown' is the club's word for an invoice status Stripe has not been read
   for yet — the webhook stores it so the invoice still reaches this page, and
   writes the real word to app_errors for somebody to decide about. That word is
   written for an engineer, and this table is read by a member: UNKNOWN on a
   receipt reads as the club having lost track of their money. Pending is true
   while nobody has decided — the invoice exists, its outcome is not settled
   here — and it is calm. The stored value is untouched; only the label moves. */
/* What a member reads on their own receipt.
   The stored value is the processor's word, because that is the truth the
   Bridge and the errors panel need. What a member needs is a word about their
   own account, and four of the processor's five are written for a ledger
   rather than a person — "uncollectible" in particular is a thing said about a
   debt, not to the person who owes it. Anything unmapped falls through to the
   stored word, so a status nobody has thought about still shows something
   true rather than nothing. */
const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Not yet issued",
  open: "Due",
  paid: "Paid",
  void: "Cancelled",
  uncollectible: "Written off",
  unknown: "Pending",
};

function money(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string }>;
}) {
  const { supabase, user, profile, zone } = await getMember();
  const { joined } = await searchParams;
  const processorLive = stripeEnabled();

  const [subRes, invoicesRes, cardsRes, accountRes, accountBalRes, installmentsRes, erasureRes, creditRes] =
    await Promise.all([
      /* Was "newest by created_at, any status". A superseded CANCELED row is
         newer than the live one it replaced, so this screen could say "Closed"
         while Pause and Depart moved a different, live subscription. Shared
         reader now — see @/lib/dues. */
      subscriptionToShow(supabase, user.id),
      supabase
        .from("invoices")
        .select("*")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("payment_methods")
        .select("*")
        .eq("profile_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false }),
      /* Bounded. This read had no ceiling, so a member two seasons in rendered
         every house charge ever written — the statement itself shows 24 and
         keeps the rest behind a disclosure, and asking for more than it can
         show is a database dump nobody reads. */
      supabase
        .from("account_ledger")
        .select("*")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(STATEMENT_MAX),
      supabase.from("account_balance").select("*").eq("profile_id", user.id).maybeSingle(),
      supabase
        .from("installment_plans")
        .select("*")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false }),
      /* The club's own figure for how long a departed record stands before
         it is anonymised — read, not retyped, so the line below cannot drift
         from what the nightly job actually does. */
      supabase.rpc("club_setting", { p_key: "departed_erasure_days" }),
      /* This month's unspent plan credit — the thing the dues buy. */
      supabase.rpc("pass_credit_left", {}),
    ]);
  const erasureDays =
    typeof erasureRes.data === "number" && erasureRes.data > 0 ? erasureRes.data : 30;

  const subscription = subRes ?? null;
  const planId = subscription?.plan_id ?? profile?.plan_id ?? null;
  const { data: plan } = planId
    ? await supabase.from("membership_plans").select("*").eq("id", planId).maybeSingle()
    : { data: null };

  const invoices: InvoiceRow[] = (invoicesRes.data ?? []).map((r) => ({ ...r }));
  const card = (cardsRes.data ?? [])[0] ?? null;
  const account: AccountRow[] = (accountRes.data ?? []).map((r) => ({ ...r }));
  const accountBalance = accountBalRes.data?.balance_cents ?? 0;
  const installments = installmentsRes.data ?? [];

  const status = subscription?.status ?? null;
  const creditLeft = typeof creditRes.data === "number" ? creditRes.data : 0;
  const creditMonth = new Date().toLocaleString("en-US", { month: "long", timeZone: zone ?? undefined }).toUpperCase();
  const ending = subscription?.cancel_at_period_end || status === "canceled";
  const periodEnd = subscription?.current_period_end ?? null;
  /* Dues waived by the Bridge until a date still ahead; the plan stands. */
  const nowMs = new Date().getTime();
  const compedUntil =
    profile?.comped_until && Date.parse(profile.comped_until) > nowMs ? profile.comped_until : null;

  return (
    <div>
      {/* Name in the h1, editorial line in the eyebrow — the Portal pattern,
          and the owner rule that a route, its nav label, its title and its
          heading all say the same word. This page had the two swapped, so a
          member who followed a nav item called Account landed on a page whose
          only heading said Dues and receipts. */}
      <span className="mbr-eyebrow">Dues · receipts · the card</span>
      <h1 className="mbr-h1">Account.</h1>
      <p className="ls-lede mbr-sub--sm">
        What the club draws, when it draws it, and the card it draws on. Change
        anything here and it takes at the next turn of the period.
      </p>
      {!processorLive ? (
        <p className="mbr-mono mbr-sub--sm">
          Dues are settled with Shoreside until the processor is live.
        </p>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow mbr-eyebrow--quiet">
          Your standing
        </span>
        {subscription && plan ? (
          <div className="ptl-panel">
            <div className="acc-head">
              <div className="acc-plan">{plan.label}</div>
              {status ? (
                <Badge tone={STATUS_TONE[status] ?? "outline"}>
                  {STATUS_LABEL[status] ?? status}
                </Badge>
              ) : null}
            </div>
            {/* The plan's label is the heading above; the geography tier said
                nothing about what the club draws, so it is off this line. */}
            <p className="mbr-mono mbr-sub--sm">
              {subscription.interval === "year" ? "ANNUAL" : "MONTHLY"} ·{" "}
              {price(
                subscription.interval === "year"
                  ? plan.annual_price_cents ?? plan.price_cents * 10
                  : plan.price_cents
              ).toUpperCase()}
            </p>
            {periodEnd ? (
              <p className="mbr-mono mbr-line">
                {ending ? "ENDS" : "RENEWS"} {logDateYear(periodEnd, zone)}
              </p>
            ) : null}
            {compedUntil ? (
              <p className="mbr-mono mbr-line acc-gold">
                COMPLIMENTARY UNTIL {logDateYear(compedUntil, zone)}
              </p>
            ) : null}
            {plan.monthly_credit_cents > 0 ? (
              <p className="mbr-mono mbr-line">
                {creditLeft > 0 ? price(creditLeft) : "$0"} OF {price(plan.monthly_credit_cents)} CREDIT LEFT ·{" "}
                {creditMonth}
              </p>
            ) : null}
            {status === "past_due" ? (
              <p className="ls-note mbr-note--mid mbr-sub--sm">
                The card was declined. Put a good one on file and the standing
                holds — nothing else changes.
              </p>
            ) : null}
          </div>
        ) : compedUntil ? (
          <div className="ptl-panel">
            <div className="acc-plan">{plan?.label ?? "Membership"}</div>
            <p className="mbr-mono mbr-sub--sm acc-gold">
              COMPLIMENTARY UNTIL {logDateYear(compedUntil, zone)}
            </p>
            <p className="ls-note mbr-note--mid mbr-sub--sm">
              The Bridge has waived your dues until then. Nothing is drawn; the plan stands as it is.
            </p>
          </div>
        ) : (
          <StateBlock
            status="empty"
            icon="Receipt"
            bare
            title="No dues running."
            detail="Take a standing on the membership page and the ledger starts here."
            action={
              <LinkButton href="/membership" variant="outline" size="sm">
                See the standings
              </LinkButton>
            }
          />
        )}
      </section>

      {plan && plan.price_cents > 0 && processorLive ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow mbr-eyebrow--quiet">
            Change the standing
          </span>
          <div className="ptl-panel">
            <p className="ls-lede mbr-sub--sm">
              Pay by the month, or pay by the year and the club keeps two months
              off the bill.
            </p>
            <StandingControls
              planId={plan.id}
              monthlyCents={plan.price_cents}
              annualCents={plan.annual_price_cents ?? plan.price_cents * 10}
              currentInterval={subscription?.interval ?? null}
            />
          </div>
        </section>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow mbr-eyebrow--quiet">
          Card on file
        </span>
        <div className="ptl-panel">
          {card ? (
            <p className="mbr-mono mbr-mono--lg">
              {(card.brand ?? "CARD").toUpperCase()} ···· {card.last4 ?? "····"}
              {card.exp_month && card.exp_year
                ? ` · EXPIRES ${String(card.exp_month).padStart(2, "0")}/${String(
                    card.exp_year
                  ).slice(-2)}`
                : ""}
            </p>
          ) : (
            <p className="mbr-mono">No card on file.</p>
          )}
          {processorLive ? (
            <div className="mbr-sub">
              <ManageBillingButton />
            </div>
          ) : (
            <p className="ls-note mbr-line">
              Cards are taken at the gangway or by invoice — Shoreside posts them.
            </p>
          )}
        </div>
      </section>

      <section className="mbr-sec">
        <span className="mbr-eyebrow mbr-eyebrow--quiet">
          Receipts
        </span>
        {invoices.length === 0 ? (
          <StateBlock
            status="empty"
            icon="Receipt"
            bare
            title="No receipts yet."
            detail="Every draw lands here the moment it clears, with the invoice behind it."
          />
        ) : (
          <div className="ptl-panel acc-panel--table">
            <Table<InvoiceRow>
              columns={[
                {
                  key: "created_at",
                  label: "Date",
                  mono: true,
                  width: 90,
                  render: (r) => logDate(r.created_at, zone),
                },
                { key: "number", label: "Invoice", render: (r) => r.number ?? "—" },
                {
                  key: "amount_cents",
                  label: "Amount",
                  mono: true,
                  render: (r) => price(r.amount_cents),
                },
                {
                  key: "status",
                  label: "Status",
                  mono: true,
                  width: 100,
                  render: (r) =>
                    (INVOICE_STATUS_LABEL[r.status] ?? r.status).toUpperCase(),
                },
                {
                  key: "hosted_url",
                  label: "",
                  width: 90,
                  render: (r) =>
                    r.hosted_url ? (
                      <a
                        href={r.hosted_url}
                        target="_blank"
                        rel="noreferrer"
                        className="acc-receipt"
                      >
                        Receipt
                      </a>
                    ) : (
                      "—"
                    ),
                },
              ]}
              rows={invoices}
              rowKey={(r) => r.id}
            />
          </div>
        )}
      </section>

      {installments.length > 0 ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow mbr-eyebrow--quiet">
            Split draws
          </span>
          <div className="ptl-panel">
            {installments.map((p, i) => (
              <div key={p.id} className={i === 0 ? "acc-draw acc-draw--first" : "acc-draw"}>
                <Progress
                  label={`${p.paid_count} of ${p.installments} drawn`}
                  detail={money(p.total_cents)}
                  value={(p.paid_count / p.installments) * 100}
                />
                <p className="mbr-mono mbr-line">
                  {p.status === "active" && p.next_charge_at
                    ? `NEXT DRAW ${logDateYear(p.next_charge_at, zone)}`
                    : p.status.toUpperCase()}
                </p>
              </div>
            ))}
            <p className="ls-note mbr-sub">
              Draws post to the account statement below. No interest, ever.
            </p>
          </div>
        </section>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow mbr-eyebrow--quiet">
          Account statement
        </span>
        {account.length === 0 ? (
          <StateBlock
            status="empty"
            icon="BookOpen"
            bare
            title="Nothing on the account."
            detail="Passes, deposits, and add-ons post here as house charges."
          />
        ) : (
          <AccountStatement
            rows={account}
            balanceCents={accountBalance}
            zone={zone}
            processorLive={processorLive}
          />
        )}
      </section>

      <section className="mbr-sec">
        <span className="mbr-eyebrow mbr-eyebrow--quiet">
          Your record
        </span>
        <div className="ptl-panel">
          <p className="ls-lede mbr-sub--sm">
            Everything the club holds in your name — the papers, the passes, both
            ledgers, the word — as one JSON file. Boarding codes and the
            processor&rsquo;s references stay with the club.
          </p>
          <div className="mbr-sub">
            <ExportDataButton memberNo={profile?.member_no ?? null} />
          </div>
          <p className="ls-note mbr-sub--sm">
            Erasure runs {erasureDays} days after departure. The ledger keeps its
            figures; your name comes off them.
          </p>
        </div>
      </section>

      {joined === "1" ? <JoinedNotice /> : null}
    </div>
  );
}
