import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { logDateTime, price } from "@/lib/format";
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
  const { supabase } = await getOperator();

  const LEDGER_SHOWN = 120;
  const [ledgerRes, shopRes, membersRes, ledgerCount] = await Promise.all([
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
  const noOf = (id: string) => byId.get(id)?.member_no ?? "—";

  const entries: LedgerRow[] = ledger.map((l) => ({
    id: l.id,
    member: nameOf(l.profile_id),
    memberNo: noOf(l.profile_id),
    kind: l.kind,
    memo: l.memo ?? "",
    amount: signedAmount(l.delta_cents),
    deltaCents: l.delta_cents,
    created: logDateTime(l.created_at, CLUB_ZONE),
  }));

  const shopOrders: ShopOrderRow[] = shop.map((o) => ({
    id: o.id,
    shortId: `#${o.id.slice(0, 8).toUpperCase()}`,
    member: nameOf(o.profile_id),
    total: price(o.total_cents),
    status: o.status,
    created: logDateTime(o.created_at, CLUB_ZONE),
  }));

  const members: MemberOption[] = memberRows.map((m) => ({
    value: m.id,
    label: `${m.full_name ?? "Unnamed"}${m.member_no ? ` · ${m.member_no}` : ""}`,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Orders &amp; refunds</span>
      <h1 className="hm-h1">The ship&apos;s record.</h1>
      <p className="hm-lede">
        Charges, payments and refunds on the member accounts — newest first, logged with a
        name.
      </p>
      <span className="hm-count">
        {ledgerTotal > LEDGER_SHOWN
          ? `NEWEST ${LEDGER_SHOWN} OF ${ledgerTotal} ENTRIES`
          : `${ledgerTotal} ${ledgerTotal === 1 ? "ENTRY" : "ENTRIES"}`}
      </span>
      <OrdersClient entries={entries} shopOrders={shopOrders} members={members} />
    </div>
  );
}
