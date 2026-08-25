import { LEDGER_KIND } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Progress, StateBlock, Table } from "@/components/ds";
import { TIER_LABEL, logDate, price, logDateYear } from "@/lib/format";
import { stripeEnabled } from "@/lib/stripe";
import { subscriptionToShow } from "@/lib/dues";
import { getMember } from "../data";
import { SettleCardButton } from "../portal/settle-card";
import { JoinedNotice, ManageBillingButton, StandingControls } from "./billing-client";

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

  const [subRes, invoicesRes, cardsRes, accountRes, accountBalRes, installmentsRes] =
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
      supabase
        .from("account_ledger")
        .select("*")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("account_balance").select("*").eq("profile_id", user.id).maybeSingle(),
      supabase
        .from("installment_plans")
        .select("*")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

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
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>{plan.label}</div>
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
              <p style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 12, maxWidth: "48ch" }}>
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
            <p style={{ fontSize: 13, color: "var(--text-2)", maxWidth: "48ch" }}>
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
                        style={{ fontSize: 12.5, color: "var(--text-link)" }}
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
          <div className="ptl-panel" style={{ padding: "8px 20px 16px" }}>
            <Table<AccountRow>
              columns={[
                {
                  key: "created_at",
                  label: "Date",
                  mono: true,
                  width: 90,
                  render: (r) => logDate(r.created_at, zone),
                },
                { key: "memo", label: "Entry", render: (r) => r.memo ?? (LEDGER_KIND[r.kind] ?? r.kind).toUpperCase() },
                {
                  key: "kind",
                  label: "Kind",
                  mono: true,
                  width: 90,
                  render: (r) => (LEDGER_KIND[r.kind] ?? r.kind).toUpperCase(),
                },
                {
                  key: "delta_cents",
                  label: "Amount",
                  mono: true,
                  render: (r) => (
                    <span style={{ color: r.delta_cents < 0 ? "var(--siren)" : "var(--laurel)" }}>
                      {r.delta_cents < 0 ? "−" : "+"}
                      {money(r.delta_cents)}
                    </span>
                  ),
                },
              ]}
              rows={account}
              rowKey={(r) => r.id}
            />
            <p className="mbr-mono" style={{ marginTop: 12 }}>
              {/* A member $776 in credit was told "SETTLED" — true only in the
                  sense that they owe nothing, and wrong about the money that is
                  theirs. Three states, not two. */}
              {accountBalance < 0
                ? `BALANCE — ${money(accountBalance)} DUE`
                : accountBalance > 0
                  ? `BALANCE — ${money(accountBalance)} IN CREDIT`
                  : "BALANCE — SETTLED"}
            </p>
            {accountBalance < 0 && processorLive ? (
              <div style={{ marginTop: 12 }}>
                <SettleCardButton amountLabel={money(accountBalance)} />
              </div>
            ) : accountBalance < 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
                Settled at the gangway or by invoice — Shoreside posts payments.
              </p>
            ) : null}
          </div>
        )}
      </section>

      {joined === "1" ? <JoinedNotice /> : null}
    </div>
  );
}
