"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { eveningBefore } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { voiceWith } from "@/lib/errors";

export type RsvpResult = { error?: string; full?: boolean };

type Supa = Awaited<ReturnType<typeof createClient>>;

async function member() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, userId: null as string | null };
  return { supabase, userId: user.id as string | null };
}

/* The database guards speak in brand voice already ("the manifest is full —
   join the waitlist"), and this file used to surface any message verbatim on
   that assumption. Guards do speak; RLS does not. A member on hold got "New
   row violates row-level security policy for table \"rsvps\"." on the one
   screen they use most, along with the table's name. voice() is the shared
   launderer that already knew what to say — this file simply was not calling
   it. It still passes a real guard message through untouched. */
/* Now async, because voice() ASSERTS a hold from an RLS refusal and this file
   has seventeen callers that reach the member on the screen they use most.
   rsvps' UPDATE policy is `profile_id = auth.uid()` with `is_active()` only in
   the WITH CHECK, so a member the club held AFTER they booked cannot change
   guests, pick a cabin, hand the pass on or set auto-claim — and was told only
   that "the club's records don't allow that just now", which is the confidently
   vague line lib/errors.ts was written to eliminate. voiceWith asks whether the
   membership is actually on hold before saying so. A real guard message still
   passes through untouched. */
async function guardMessage(
  supabase: Supa,
  raw: string | null | undefined,
  code?: string | null
): Promise<string> {
  return voiceWith(supabase, { message: raw, code });
}

function isFullMessage(raw: string | null | undefined): boolean {
  return (raw ?? "").toLowerCase().includes("full");
}

function done(): RsvpResult {
  revalidatePath("/manifest");
  revalidatePath("/home");
  revalidatePath("/live");
  return {};
}

function clampGuests(guests: number): number {
  return Math.max(0, Math.min(2, Math.round(guests)));
}

/* Names as the manifest reads them — trimmed, sized to the guest count. */
function cleanNames(names: string[], count: number): string[] {
  return names
    .slice(0, count)
    .map((n) => n.trim())
    .filter(Boolean);
}

/* Attach add-ons to an rsvp: one rsvp_addons row plus one account_ledger
   'addon' charge each (the triggers do not cover these). Already-attached
   add-ons are skipped. Returns a raw error message, or null on success. */
async function attachAddons(
  supabase: Supa,
  _userId: string,
  _voyageId: string,
  rsvpId: string,
  addonIds: string[],
  qty: number
): Promise<string | null> {
  /* Priced and charged in one definer. The member used to insert both the line
     and its charge, which meant they could write their own folio — and a single
     one-cent row of their own made the aboard trigger believe the pass was
     already paid for. */
  const { error } = await supabase.rpc("attach_addons", {
    p_rsvp: rsvpId,
    p_addons: addonIds,
    p_qty: qty,
  });
  return error ? error.message : null;
}

export async function setRsvpStatus(
  voyageId: string,
  status: "aboard" | "waitlist" | "not_going"
): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("rsvps")
    .upsert(
      { voyage_id: voyageId, profile_id: userId, status },
      { onConflict: "voyage_id,profile_id" }
    );
  if (error) return { error: await guardMessage(supabase, error.message, error.code), full: isFullMessage(error.message) };
  return done();
}

/* Review & confirm on a priced voyage: the pass (house charge posts by
   trigger) with guest names on the rsvp, then any chosen add-ons. A code,
   if one was applied, is re-checked here — never trusted from the client. */
/* Passes over this line may be drawn in goes rather than in one. */
const SPLIT_FLOOR_CENTS = 20000;

/* Split it: the trigger has already posted the full charge, so the remainder
   comes straight back as a credit and rides on an installment_plans row until
   it is drawn. Both writes are shoreside — RLS keeps members off those tables
   — so the option only appears when the service-role key is set. Returns a
   raw error message, or null when there is nothing to do. */
async function splitIntoDraws(
  supabase: Supa,
  userId: string,
  voyageId: string,
  rsvpId: string,
  draws: number
): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "Split draws open when the processor is live.";
  }
  let n = Math.max(2, Math.min(4, Math.round(draws)));

  /* The expedition discipline the field runs on: a multi-day passage settles
     its balance by ninety days out, so the boat is paid for before the
     provisioning is. Draws step monthly (the database owns that cadence), so
     the count is clamped to what fits between next month and T−90 — and when
     nothing fits, the split is refused with the reason, not shrunk silently.
     Day sailings keep the old rule; T−90 is expedition economics. */
  const { data: vRow } = await supabase
    .from("voyages")
    .select("starts_at, sub_class")
    .eq("id", voyageId)
    .maybeSingle();
  if (vRow && (vRow.sub_class === "expedition" || vRow.sub_class === "odyssey")) {
    const settleBy = Date.parse(vRow.starts_at) - 90 * 86400_000;
    const monthsUntil = Math.floor((settleBy - Date.now()) / (30.44 * 86400_000));
    const maxDraws = 1 + Math.max(0, monthsUntil);
    if (maxDraws < 2) {
      return "The balance for a passage settles by ninety days out — this one is inside that window, so it settles now.";
    }
    n = Math.min(n, maxDraws);
  }

  /* Already split — a second confirm must not draw it twice. This read is the
     fast path and the courteous one; it is NOT the guard. Two tabs confirming
     at once both read "no plan" and both wrote, and the member was then drawn
     double the agreed slice every month until both plans completed. The guard
     is a partial unique index on rsvp_id where status = 'active', and the
     23505 handling below is what makes the second writer stand down. */
  const { data: standing } = await supabase
    .from("installment_plans")
    .select("id")
    .eq("rsvp_id", rsvpId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (standing) return null;

  const { data: charges } = await supabase
    .from("account_ledger")
    .select("delta_cents")
    .eq("rsvp_id", rsvpId)
    .lt("delta_cents", 0);
  const total = -(charges ?? []).reduce((sum, r) => sum + r.delta_cents, 0);
  if (total <= SPLIT_FLOOR_CENTS) return null;

  const perDraw = Math.floor(total / n);
  const down = total - perDraw * (n - 1);
  const admin = createAdminClient();

  const { error: creditError } = await admin.from("account_ledger").insert({
    profile_id: userId,
    delta_cents: total - down,
    kind: "credit",
    memo: `Split into ${n} draws — ${n - 1} × $${(perDraw / 100).toFixed(2)} to come`,
    voyage_id: voyageId,
    rsvp_id: rsvpId,
  });
  /* Somebody else split this pass between our read and our write. Nothing more
     to do, and nothing to apologise for — the split they asked for exists. */
  if (creditError) return creditError.code === "23505" ? null : creditError.message;

  /* "Monthly" means the same date next month, and the last day of the month
     where that date does not exist. `setMonth(getMonth() + 1)` does neither: a
     pass split on Jan 31 draws next on MAR 3, skipping February entirely. The
     database step uses `+ interval '1 month'`, which clamps correctly; this
     matches it rather than inventing a second cadence. */
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const lastOfNextMonth = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  const next = new Date(Date.UTC(y, m + 1, Math.min(d, lastOfNextMonth)));
  const { error: planError } = await admin.from("installment_plans").insert({
    profile_id: userId,
    rsvp_id: rsvpId,
    total_cents: total,
    down_payment_cents: down,
    installments: n,
    paid_count: 1,
    next_charge_at: next.toISOString(),
    status: "active",
  });
  if (planError) return planError.code === "23505" ? null : planError.message;
  return null;
}

export async function confirmBerth(
  voyageId: string,
  addonIds: string[],
  guests: number,
  guestNames: string[],
  promoCode?: string | null,
  split?: number | null
): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };

  /* The code is validated here so a bad one is refused in the brand's voice
     rather than silently ignored; the PRICE it implies is the trigger's to
     compute, from the club's own code table. */
  let promo: PromoOk | null = null;
  if (promoCode && promoCode.trim()) {
    const checked = await validatePromo(supabase, promoCode, voyageId);
    if ("reason" in checked) return { error: checked.reason };
    promo = checked;
  }

  const clamped = clampGuests(guests);
  const { error } = await supabase
    .from("rsvps")
    .upsert(
      {
        voyage_id: voyageId,
        profile_id: userId,
        status: "aboard",
        guests: clamped,
        guest_names: cleanNames(guestNames, clamped),
        /* The trigger prices the pass, promo included — the row no longer
           carries an exemption a member could have written themselves. */
        ...(promo ? { promo_code: promo.code } : {}),
      },
      { onConflict: "voyage_id,profile_id" }
    );
  if (error) return { error: await guardMessage(supabase, error.message, error.code), full: isFullMessage(error.message) };

  if (promo || addonIds.length > 0 || split) {
    const { data: rsvp } = await supabase
      .from("rsvps")
      .select("id, guests")
      .eq("voyage_id", voyageId)
      .eq("profile_id", userId)
      .maybeSingle();

    if (rsvp && addonIds.length > 0) {
      const failed = await attachAddons(
        supabase,
        userId,
        voyageId,
        rsvp.id,
        addonIds,
        1 + (rsvp.guests ?? 0)
      );
      if (failed) return { error: await guardMessage(supabase, failed) };
    }
    /* Last, so the split is drawn against every charge on the pass. */
    if (rsvp && split) {
      const failed = await splitIntoDraws(supabase, userId, voyageId, rsvp.id, split);
      if (failed) return { error: await guardMessage(supabase, failed) };
    }
  }

  revalidatePath("/account");
  revalidatePath("/portal");
  return done();
}

/* Post-purchase add-on upsell — open until 18:00 the night before departure. */
export async function improvePass(voyageId: string, addonIds: string[]): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  if (addonIds.length === 0) return {};

  const { data: voyage } = await supabase
    .from("voyages")
    /* time_zone was not even selected here. "18:00 the night before" is a time
       on a wall in a harbour; this read and wrote the render machine's zone
       instead, so the window it enforced was never the window it promises. On
       an Eastern host it ran ~21 hours long for a Pacific sailing — the galley
       taking orders a day past its provisioning cut — and on a UTC host it
       takes four hours off a morning sailing in an eastern harbour, while the
       refusal text still says "18:00 the night before". */
    .select("starts_at, time_zone")
    .eq("id", voyageId)
    .maybeSingle();
  if (!voyage) return { error: "That voyage is off the manifest." };
  const cutoff = new Date(eveningBefore(voyage.starts_at, voyage.time_zone));
  if (Date.now() >= cutoff.getTime()) {
    return { error: "The add-on window closed at 18:00 the night before." };
  }

  const { data: rsvp } = await supabase
    .from("rsvps")
    .select("id, guests, status")
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (!rsvp || rsvp.status !== "aboard") return { error: "Confirm your pass first." };

  const failed = await attachAddons(
    supabase,
    userId,
    voyageId,
    rsvp.id,
    addonIds,
    1 + (rsvp.guests ?? 0)
  );
  if (failed) return { error: await guardMessage(supabase, failed) };

  revalidatePath("/portal");
  return done();
}

export async function setGuests(
  voyageId: string,
  guests: number,
  guestNames: string[]
): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const clamped = clampGuests(guests);

  /* sync_guest_rows keeps a guest who has already signed — their signature is a
     record and cannot be swept. Dropping the count below that number left the
     member reading "0 guests" while the gangway would still admit someone and
     their stub stayed live. The count cannot go below the guests who signed. */
  const { data: myRsvp } = await supabase
    .from("rsvps")
    .select("id")
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (myRsvp) {
    /* Companions only: a couple's second head is a partner row, not a guest,
       and its signature must not pin the companion count. */
    const { data: signedGuests } = await supabase
      .from("rsvp_guests")
      .select("id, name, signatures!inner(id)")
      .eq("rsvp_id", myRsvp.id)
      .eq("kind", "guest");
    const signedCount = (signedGuests ?? []).length;
    if (clamped < signedCount) {
      const who = (signedGuests ?? []).map((g) => g.name).join(" and ");
      return {
        error: `${who} already signed the waiver, so that guest stays on the pass. Shoreside can take them off.`,
      };
    }
  }

  const { error } = await supabase
    .from("rsvps")
    .update({ guests: clamped, guest_names: cleanNames(guestNames, clamped) })
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId);
  if (error) return { error: await guardMessage(supabase, error.message, error.code) };
  return done();
}

export async function releaseBerth(voyageId: string): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("rsvps")
    .delete()
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId);
  if (error) return { error: await guardMessage(supabase, error.message, error.code) };
  revalidatePath("/portal");
  return done();
}

/* ————————————————————————————————————————————————————————————————
   Ticketing polish — waitlist auto-claim, pass hand-offs, codes, crew.
   ———————————————————————————————————————————————————————————————— */

/* — Waitlist auto-claim — */

export async function setAutoClaim(voyageId: string, on: boolean): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("rsvps")
    .update({ auto_claim: on })
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId);
  if (error) return { error: await guardMessage(supabase, error.message, error.code) };
  return done();
}

/* — Pass transfer, member to member. Never for cash. — */

export async function offerPass(rsvpId: string, toProfile: string): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  if (!toProfile) return { error: "Choose the member taking it." };
  if (toProfile === userId) return { error: "A pass cannot be handed to yourself." };

  /* One live offer per pass — a standing offer is replaced, not stacked. */
  const { data: standing } = await supabase
    .from("pass_transfers")
    .select("id")
    .eq("rsvp_id", rsvpId)
    .eq("from_profile", userId)
    .eq("status", "offered");
  if ((standing ?? []).length > 0) {
    return { error: "That pass is already offered. Withdraw it first." };
  }

  const { error } = await supabase
    .from("pass_transfers")
    .insert({ rsvp_id: rsvpId, from_profile: userId, to_profile: toProfile, status: "offered" });
  if (error) return { error: await guardMessage(supabase, error.message, error.code) };
  return done();
}

export async function withdrawOffer(transferId: string): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("pass_transfers")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", transferId)
    .eq("from_profile", userId)
    .eq("status", "offered");
  if (error) return { error: await guardMessage(supabase, error.message, error.code) };
  return done();
}

/* The RPC reassigns the pass, clears the code, squares both accounts and
   posts the Word. Nothing to notify from here. */
export async function acceptOffer(transferId: string): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase.rpc("accept_pass_transfer", { p_id: transferId });
  if (error) return { error: await guardMessage(supabase, error.message, error.code) };
  revalidatePath("/portal");
  return done();
}

export async function declineOffer(transferId: string): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("pass_transfers")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", transferId)
    .eq("to_profile", userId)
    .eq("status", "offered");
  if (error) return { error: await guardMessage(supabase, error.message, error.code) };
  return done();
}

/* — Codes at checkout — */

export type PromoKind = "percent" | "amount" | "comp";
export type PromoResult =
  | { ok: true; code: string; kind: PromoKind; value: number; passCents: number }
  | { ok: false; reason: string };

type PromoOk = { code: string; kind: PromoKind; value: number };

/* What the pass costs once the code bites. Percent trims the pass price;
   amount takes cents off it; comp takes it to nothing. */
function discountedPass(priceCents: number, kind: PromoKind, value: number): number {
  if (kind === "comp") return 0;
  if (kind === "percent") {
    return Math.max(0, priceCents - Math.round((priceCents * value) / 100));
  }
  return Math.max(0, priceCents - Math.max(0, Math.round(value)));
}

/* Members cannot read promo_codes — only the RPC, which answers on-voice. */
async function validatePromo(
  supabase: Supa,
  rawCode: string,
  voyageId: string
): Promise<PromoOk | { reason: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { reason: "No such code." };
  const { data, error } = await supabase.rpc("check_promo", {
    p_code: code,
    p_voyage: voyageId,
  });
  if (error) return { reason: await guardMessage(supabase, error.message, error.code) };
  const answer = (data ?? {}) as { ok?: boolean; kind?: string; value?: number; reason?: string };
  if (!answer.ok) return { reason: answer.reason ?? "No such code." };
  const kind: PromoKind =
    answer.kind === "percent" || answer.kind === "comp" ? answer.kind : "amount";
  return { code, kind, value: Number(answer.value ?? 0) };
}

export async function applyPromo(rawCode: string, voyageId: string): Promise<PromoResult> {
  const { supabase, userId } = await member();
  if (!userId) return { ok: false, reason: "Sign in first." };
  const checked = await validatePromo(supabase, rawCode, voyageId);
  if ("reason" in checked) return { ok: false, reason: checked.reason };

  const { data: voyage } = await supabase
    .from("voyages")
    .select("price_cents")
    .eq("id", voyageId)
    .maybeSingle();
  if (!voyage) return { ok: false, reason: "That sailing is off the manifest." };

  return {
    ok: true,
    code: checked.code,
    kind: checked.kind,
    value: checked.value,
    passCents: discountedPass(voyage.price_cents, checked.kind, checked.value),
  };
}



/* — Crew forming — */

export async function postCrewRequest(voyageId: string, note: string): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("crew_requests")
    .upsert(
      { voyage_id: voyageId, profile_id: userId, note: note.trim() || null, open: true },
      { onConflict: "voyage_id,profile_id" }
    );
  if (error) return { error: await guardMessage(supabase, error.message, error.code) };
  return done();
}

export async function withdrawCrewRequest(voyageId: string): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("crew_requests")
    .delete()
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId);
  if (error) return { error: await guardMessage(supabase, error.message, error.code) };
  return done();
}

/* Choice of cabin — a named space on your hull, claimed until the flotilla is
   set. The capacity guard at the database refuses a full cabin, so two members
   picking the owner's cabin at once resolves honestly. */
export async function chooseCabin(voyageId: string, cabinId: string | null): Promise<RsvpResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase
    .from("rsvps")
    .update({ cabin_id: cabinId })
    .eq("voyage_id", voyageId)
    .eq("profile_id", user.id)
    .eq("status", "aboard");
  if (error) {
    /* Kept because it is shorter and kinder than the raise, which names the
       cabin's berth count in vocabulary the lexicon retired. Everything else
       the guard says reaches the member as written. */
    if (/spoken for/i.test(error.message)) return { error: "That cabin just went. Pick another." };
    return { error: await guardMessage(supabase, error.message, error.code) };
  }
  revalidatePath("/manifest");
  return {};
}

/* — The bow daybed. The RPC is the whole transaction: it checks the pass is
   the member's own aboard one, holds the two-per-sailing line, prices from
   club_products and posts the folio charge itself. Its refusals arrive in
   brand voice and pass through untouched. — */
export async function claimDaybed(rsvpId: string): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase.rpc("claim_a_daybed", { p_rsvp: rsvpId });
  if (error) return { error: await guardMessage(supabase, error.message, error.code) };
  revalidatePath("/account");
  revalidatePath("/portal");
  return done();
}
