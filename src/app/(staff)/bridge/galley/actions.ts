"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { memberMark, memberNumberCandidates } from "@/lib/membership";
import { staffContext, ERR_STAFF, type ActionResult } from "../../staff";

export type LookupResult = {
  error?: string;
  member?: { id: string; name: string; memberNo: string; tier: string };
};

export async function lookupMember(memberNo: string): Promise<LookupResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const code = memberNo.trim().toUpperCase();
  if (!code) return { error: "Key the number first." };
  /* The card now reads "Nº 0047" and the column still says the retired prefix
     plus the digits, so what a crew member types no longer matches what is
     stored. Both forms are tried — the bare digits as a suffix match — or the
     till stops finding members the moment the card face changed. */
  const [literal, suffix] = memberNumberCandidates(code);
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, member_no, tier")
    .or(`member_no.ilike.${literal},member_no.ilike.${suffix}`)
    .maybeSingle();
  if (!profile) return { error: "No member under that number." };
  return {
    member: {
      id: profile.id,
      name: profile.full_name ?? "Unnamed",
      memberNo: memberMark(profile.member_no) || code,
      tier: profile.tier,
    },
  };
}

export type TicketLine = { itemId: string; qty: number; priceCents: number };

/* Settle the ticket. 'account' leaves the charge on the member account
   (the ledger trigger writes it); 'till' records the order and offsets the
   charge with a payment — net zero, memo "Paid at the till". */
export async function settleTicket(
  profileId: string,
  lines: TicketLine[],
  tender: "account" | "till",
  /* Minted by the POS per ticket. A double-tap at a bar with a queue behind it
     should not ring twice. */
  idemKey?: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!profileId) return { error: "Attach a member first." };
  const clean = lines.filter((l) => l.qty > 0 && l.itemId);
  if (!clean.length) return { error: "Ring the first item — the order is empty." };

  /* One RPC, one transaction. This used to be three separate writes with the
     CHARGE landing on the first — the ledger trigger fires on the order insert
     — so a failure on the lines left the member charged for an empty ticket,
     and a failure on the till offset left them charged for drinks they had just
     paid cash for. Both told the operator "That didn't land. Try again.", and
     re-ringing charged again.

     The prices go with the line ids and are read from the catalogue inside the
     function; the POS no longer states what anything costs. */
  const { error } = await supabase.rpc("settle_galley_ticket", {
    p_profile: profileId,
    p_lines: clean.map((l) => ({ itemId: l.itemId, qty: l.qty })),
    p_tender: tender,
    ...(idemKey ? { p_idem_key: idemKey } : {}),
  });
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/bridge/galley");
  revalidatePath("/bridge/orders");
  return {};
}
