"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { memberMark, memberNumberFilter, memberNumberTail } from "@/lib/membership";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

export type LookupResult = {
  error?: string;
  member?: { id: string; name: string; memberNo: string; tier: string };
};

export async function lookupMember(memberNo: string): Promise<LookupResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const code = memberNo.trim().toUpperCase();
  if (!code) return { error: "Key the number first." };
    /* The tail is the member number; the letters in front are whatever the club
       was called when the card was printed. Both worktrees were wrong about
       where the prefix lives, because one rewrote profiles.member_no in the
       shared database after the other had decided not to. Matching the tail
       makes the question stop mattering. */
    const tail = memberNumberTail(code);
    if (!tail) return { error: "No member under that number." };
    const { data: profile, error: lookupError } = await supabase
      .from("profiles")
      .select("id, full_name, member_no, tier")
      .or(memberNumberFilter(tail))
      .maybeSingle();
    /* maybeSingle() does NOT throw when more than one row matches — it returns
       data:null with PGRST116. Discarding that meant two members sharing a tail
       rendered as "No member under that number", the sentence that means THIS
       PERSON IS NOT A MEMBER, and the operator would turn away somebody who is
       one. Unreachable today (member_no is unique and every number carries one
       prefix) and reachable the moment a second prefix or a bare number is
       written — which is precisely what matching on the tail exists to
       tolerate. */
    if (lookupError?.code === "PGRST116")
      return { error: "More than one member matches that number — key the full number." };
    if (lookupError) return { error: ERR_LAND };
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
