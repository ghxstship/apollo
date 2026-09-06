import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { logDateTime, price } from "@/lib/format";
import { memberMark } from "@/lib/membership";
import { getOperator } from "../../data";
import { must } from "../../staff";
import {
  OrdersClient,
  type LedgerRow,
  type MemberOption,
  type ShopOrderRow,
} from "./orders-client";

export const metadata: Metadata = { title: "Orders" };

function signedAmount(cents: number): string {
  if (cents === 0) return price(0);
  const abs = price(Math.abs(cents));
  return cents < 0 ? `−${abs}` : `+${abs}`;
}

export default async function OrdersPage() {
  const { supabase, profile } = await getOperator();

  const LEDGER_SHOWN = 120;
  const [ledgerRes, shopRes, membersRes, ledgerCount, ceilingRes, operatorsRes] = await Promise.all([
    supabase
      .from("account_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(LEDGER_SHOWN),
    supabase
      .from("shop_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("profiles")
      .select("id, full_name, member_no")
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    /* The screen showed the newest 120 of what is now 692 rows and called
       itself "every charge, payment, and refund". 573 were unreachable with no
       count and no paging, so an operator looking for last month's charge
       concluded it did not exist. Say what is on screen and what is not. */
    supabase.from("account_ledger").select("id", { count: "exact", head: true }),
    /* The house credit ceiling. Above it a credit takes two operators, so the
       screen has to know the figure to know when to ask for the second one —
       and the ledger asks the same question again when the row is written. */
    supabase.rpc("club_setting", { p_key: "house_credit_max_cents" }),
    /* Who can be that second. Everyone on the Bridge but the person reading
       this screen: a credit is not seconded by the hand that posts it. */
    supabase
      .from("profiles")
      .select("id, full_name, member_no")
      .eq("is_staff", true)
      .neq("id", profile.id)
      .order("full_name", { ascending: true }),
  ]);

  const ledgerTotal = ledgerCount.count ?? 0;

  const ledger = must(ledgerRes);
  const shop = must(shopRes);
  const memberRows = must(membersRes);
  const byId = new Map(memberRows.map((m) => [m.id, m]));

  /* Names for ledger/shop rows whose members are paused or departed. */
  const missing = [
    ...new Set(
      [...ledger.map((l) => l.profile_id), ...shop.map((o) => o.profile_id)].filter(
        (id) => !byId.has(id)
      )
    ),
  ];
  if (missing.length) {
    const { data: extra } = await supabase
      .from("profiles")
      .select("id, full_name, member_no")
      .in("id", missing);
    for (const p of extra ?? []) byId.set(p.id, p);
  }

  const nameOf = (id: string) => byId.get(id)?.full_name ?? "Unknown member";
  const noOf = (id: string) => memberMark(byId.get(id)?.member_no) || "—";

  const entries: LedgerRow[] = ledger.map((l) => ({
    id: l.id,
    member: nameOf(l.profile_id),
    memberNo: noOf(l.profile_id),
    kind: l.kind,
    memo: l.memo ?? "",
    amount: signedAmount(l.delta_cents),
    deltaCents: l.delta_cents,
    created: logDateTime(l.created_at, CLUB_ZONE),
    stripeRef: l.stripe_ref ?? null,
  }));

  const shopOrders: ShopOrderRow[] = shop.map((o) => ({
    id: o.id,
    shortId: `#${o.id.slice(0, 8).toUpperCase()}`,
    member: nameOf(o.profile_id),
    total: price(o.total_cents),
    /* What actually lands on the account — the gross minus the discount, which
       is what charge_shop_order took. The ceiling is measured against this and
       not against the order total. */
    refundCents: Math.max((o.total_cents ?? 0) - (o.discount_cents ?? 0), 0),
    status: o.status,
    created: logDateTime(o.created_at, CLUB_ZONE),
  }));

  const label = (m: { full_name: string | null; member_no: string | null }) =>
    `${m.full_name ?? "Unnamed"}${m.member_no ? ` · ${memberMark(m.member_no)}` : ""}`;

  const members: MemberOption[] = memberRows.map((m) => ({ value: m.id, label: label(m) }));

  const operators: MemberOption[] = must(operatorsRes).map((m) => ({
    value: m.id,
    label: label(m),
  }));

  /* Null when the setting could not be read. The dialog says so rather than
     guessing a ceiling, and the ledger refuses the credit either way. */
  const houseCreditMaxCents =
    typeof ceilingRes.data === "number" ? ceilingRes.data : null;

  return (
    <div>
      <span className="hm-eyebrow">Orders &amp; refunds</span>
      <h1 className="hm-h1">The ship&apos;s record.</h1>
      <p className="ls-lede">
        Charges, payments and refunds on the member accounts — newest first, logged with a
        name.
      </p>
      <span className="hm-count">
        {ledgerTotal > LEDGER_SHOWN
          ? `NEWEST ${LEDGER_SHOWN} OF ${ledgerTotal} ENTRIES`
          : `${ledgerTotal} ${ledgerTotal === 1 ? "ENTRY" : "ENTRIES"}`}
      </span>
      <OrdersClient
        entries={entries}
        shopOrders={shopOrders}
        members={members}
        operators={operators}
        houseCreditMaxCents={houseCreditMaxCents}
      />
    </div>
  );
}
