import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Progress, StateBlock, Table } from "@/components/ds";
import { TIER_LABEL, logDate, price, logDateYear } from "@/lib/format";
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

  const [subRes, invoicesRes, cardsRes, accountRes, accountBalRes, installmentsRes, erasureRes] =
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
  const ending = subscription?.cancel_at_period_end || status === "canceled";
  const periodEnd = subscription?.current_period_end ?? null;

  return (
    <div>
      <span className="mbr-eyebrow">Account</span>
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        Dues and receipts.
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-2)", marginTop: 8, maxWidth: "52ch" }}>
        What the club draws, when it draws it, and the card it draws on. Change
        anything here and it takes at the next turn of the period.
      </p>
      {!processorLive ? (
        <p className="mbr-mono" style={{ marginTop: 10 }}>
          Dues are settled with Shoreside until the processor is live.
        </p>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
          Your standing
        </span>
        {subscription && plan ? (
          <div className="ptl-panel">
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{plan.label}</div>
              {status ? (
                <Badge tone={STATUS_TONE[status] ?? "outline"}>
                  {STATUS_LABEL[status] ?? status}
                </Badge>
              ) : null}
            </div>
            <p className="mbr-mono" style={{ marginTop: 10 }}>
              {TIER_LABEL[profile?.tier ?? "regional"].toUpperCase()} ·{" "}
              {subscription.interval === "year" ? "ANNUAL" : "MONTHLY"} ·{" "}
              {price(
                subscription.interval === "year"
                  ? plan.annual_price_cents ?? plan.price_cents * 10
                  : plan.price_cents
              ).toUpperCase()}
            </p>
            {periodEnd ? (
              <p className="mbr-mono" style={{ marginTop: 6 }}>
                {ending ? "ENDS" : "RENEWS"} {logDateYear(periodEnd, zone)}
              </p>
            ) : null}
            {status === "past_due" ? (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--text-2)", marginTop: 12, maxWidth: "48ch" }}>
                The card was declined. Put a good one on file and the standing
                holds — nothing else changes.
              </p>
            ) : null}
          </div>
        ) : (
          <StateBlock
            status="empty"
            icon="Receipt"
            bare
            title="No dues running."
            detail="Take a standing on the membership page and the ledger starts here."
            action={
              <Link href="/membership" className="ls-btn ls-btn--outline ls-btn--sm">
                See the standings
              </Link>
            }
          />
        )}
      </section>

      {plan && plan.price_cents > 0 && processorLive ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
            Change the standing
          </span>
          <div className="ptl-panel">
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", maxWidth: "48ch" }}>
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
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
          Card on file
        </span>
        <div className="ptl-panel">
          {card ? (
            <p className="mbr-mono" style={{ fontSize: 12 }}>
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
            <div style={{ marginTop: 14 }}>
              <ManageBillingButton />
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>
              Cards are taken at the gangway or by invoice — Shoreside posts them.
            </p>
          )}
        </div>
      </section>

      <section className="mbr-sec">
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
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
          <div className="ptl-panel" style={{ padding: "8px 20px 12px" }}>
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
                  render: (r) => r.status.toUpperCase(),
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
                        style={{ fontSize: "var(--text-xs)", color: "var(--text-link)" }}
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
          <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
            Split draws
          </span>
          <div className="ptl-panel">
            {installments.map((p, i) => (
              <div
                key={p.id}
                style={{
                  paddingTop: i === 0 ? 0 : 16,
                  marginTop: i === 0 ? 0 : 16,
                  borderTop: i === 0 ? undefined : "1px solid var(--line-faint)",
                }}
              >
                <Progress
                  label={`${p.paid_count} of ${p.installments} drawn`}
                  detail={money(p.total_cents)}
                  value={(p.paid_count / p.installments) * 100}
                />
                <p className="mbr-mono" style={{ marginTop: 8 }}>
                  {p.status === "active" && p.next_charge_at
                    ? `NEXT DRAW ${logDateYear(p.next_charge_at, zone)}`
                    : p.status.toUpperCase()}
                </p>
              </div>
            ))}
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 14 }}>
              Draws post to the account statement below. No interest, ever.
            </p>
          </div>
        </section>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
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
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
          Your record
        </span>
        <div className="ptl-panel">
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", maxWidth: "48ch" }}>
            Everything the club holds in your name — the papers, the passes, both
            ledgers, the word — as one JSON file. Boarding codes and the
            processor&rsquo;s references stay with the club.
          </p>
          <div style={{ marginTop: 14 }}>
            <ExportDataButton memberNo={profile?.member_no ?? null} />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 12 }}>
            Erasure runs {erasureDays} days after departure. The ledger keeps its
            figures; your name comes off them.
          </p>
        </div>
      </section>

      {joined === "1" ? <JoinedNotice /> : null}
    </div>
  );
}
