import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { moduleTables } from "@/lib/module-tables";
import { ledgerNotOpen, type WalletRegistrationRow } from "./facts";

/* wallet_registrations — which devices hold which pass.

   Written only by the PassKit web service, which runs with the service-role
   client after checking the pass's own authentication token; read by
   notifyWalletUpdate() to know whom to push. A device that unregisters is
   deleted, not flagged: a row here means a phone is listening, and nothing
   else. The SQL for the table is in docs/WALLET.md. */

type Client = SupabaseClient<Database>;

export type RegistrationOutcome = "created" | "exists" | "notOpen" | "error" | "tooManyDevices";

/* How many devices one pass may be listening on.

   A registration is authorized by the pass's own token, which the pass's
   holder has — so the holder could POST under an unlimited number of invented
   device identifiers for their own serial, and every one of them is a row and
   an extra APNs push on every notifyWalletUpdate(), which the Stripe webhook
   fires on every subscription event. Self-inflicted, and unbounded, which is
   the part worth fixing.

   THIS IS A HYGIENE CONTROL, NOT AN ANTI-SHARING ONE. Nothing here stops a
   member handing their pass to someone else, and it was never meant to: the
   boarding code is the credential and the gangway is the control — a second
   person presenting the same code is refused at the dock, by a person, whether
   the pass came off one phone or six. What the cap does is bound the fan-out
   and keep one member's row count from being a number nobody chose.

   Six, by the owner's ruling of 2026-09-06, for a real number of two or three:
   phone, watch, iPad, a second phone mid-upgrade, and headroom for a device
   that reinstalls under a new identifier without ever sending the DELETE.
   Counted rather than stored, so nothing about this needs a column.

   THE NUMBER IS NOT HERE. It was, and it was also written into
   cap_wallet_registrations as `cap int := 6` — two literals in two languages
   with a comment in each telling the reader to change the other, which is the
   arrangement that has never once survived a change. It now lives in
   club_settings under wallet_devices_per_pass, the club's idiom for a figure
   two places need, and the trigger and this function each read it. Turning the
   dial moves both without a deploy.

   The constant below is the fallback and nothing more: what to allow when the
   RPC cannot answer — the settings row struck, the function unreachable, an
   older database replayed. Six, the same figure the trigger falls back to, so
   a missing setting cannot make the two disagree. The trigger is the authority
   either way; it counts under an advisory lock, which this cannot.

   The other half is the sweep: a registration unheard from for
   wallet_registration_stale_days (180) is deleted by the nightly retention
   run, so the ceiling is not slowly filled by phones that were traded in
   without ever sending their DELETE. A device that comes back registers
   again. */
const DEVICES_PER_PASS_FALLBACK = 6;

/* How stale a registration's last_seen_at must be before a poll rewrites it.
   See serialsForDevice() for why an hour, and why it must stay well under
   wallet_registration_stale_days. */
const STAMP_EVERY_MS = 60 * 60 * 1000;

/* The dial, read once per registration. Read here rather than memoised for the
   life of the process: a device registers once, so this is a round trip on the
   rarest path the service has, and a cached ceiling would go on refusing a
   member for as long as an instance lived after the Bridge raised it. */
async function devicesPerPass(admin: Client): Promise<number> {
  const { data } = await admin.rpc("club_setting", { p_key: "wallet_devices_per_pass" });
  return typeof data === "number" && data > 0 ? data : DEVICES_PER_PASS_FALLBACK;
}

export async function registerDevice(
  admin: Client,
  row: Omit<WalletRegistrationRow, "created_at" | "last_seen_at">
): Promise<RegistrationOutcome> {
  const db = moduleTables(admin).from("wallet_registrations");
  const { data: existing, error: readError } = await db
    .select("device_id")
    .eq("device_id", row.device_id)
    .eq("pass_type", row.pass_type)
    .eq("serial", row.serial)
    .maybeSingle();
  if (readError) return ledgerNotOpen(readError) ? "notOpen" : "error";
  if (existing) {
    /* Same device, same pass, a fresh push token — keep the newest, and
       stamp it: a device that re-registers has just been heard from, which is
       the whole of what the staleness sweep reads. */
    await db
      .update({ push_token: row.push_token, last_seen_at: new Date().toISOString() })
      .eq("device_id", row.device_id).eq("pass_type", row.pass_type).eq("serial", row.serial);
    return "exists";
  }
  /* Counted only on the path that adds one. A device that is already
     registered is refreshing its push token above and has already been let
     through — a member at the ceiling must not lose the devices they have. */
  const { count, error: countError } = await db
    .select("device_id", { count: "exact", head: true })
    .eq("pass_type", row.pass_type)
    .eq("serial", row.serial);
  if (countError) return ledgerNotOpen(countError) ? "notOpen" : "error";
  if ((count ?? 0) >= (await devicesPerPass(admin))) return "tooManyDevices";

  const { error } = await db.insert(row);
  /* 53400 is cap_wallet_registrations refusing, which is the same refusal the
     count above makes and the only one that is authoritative: it counts under
     an advisory lock, so two devices registering in the same instant meet it
     and not the read. Mapped rather than left to fall through, because a
     ceiling reached is a sentence the phone can show and DID_NOT_LAND is not.
     Reached only in a race, or if the count and the trigger ever read
     different numbers — which is now the same setting twice, so they should
     not, and this is what happens if they do. */
  if (error?.code === "53400") return "tooManyDevices";
  if (error) return ledgerNotOpen(error) ? "notOpen" : "error";
  return "created";
}

export async function unregisterDevice(
  admin: Client,
  key: Pick<WalletRegistrationRow, "device_id" | "pass_type" | "serial">
): Promise<"deleted" | "notOpen" | "error"> {
  const { error } = await moduleTables(admin)
    .from("wallet_registrations")
    .delete()
    .eq("device_id", key.device_id)
    .eq("pass_type", key.pass_type)
    .eq("serial", key.serial);
  if (error) return ledgerNotOpen(error) ? "notOpen" : "error";
  return "deleted";
}

/* Every serial a device holds for a pass type, with the moment the newest of
   them last changed — the shape `GET devices/…/registrations/{passType}`
   answers with. `since` narrows to passes touched after that instant. */
export async function serialsForDevice(
  admin: Client,
  deviceId: string,
  passType: string,
  since: string | null
): Promise<{ serials: string[]; lastUpdated: string | null } | "notOpen" | "error"> {
  const { data: regs, error } = await moduleTables(admin)
    .from("wallet_registrations")
    .select("serial")
    .eq("device_id", deviceId)
    .eq("pass_type", passType);
  if (error) return ledgerNotOpen(error) ? "notOpen" : "error";
  const serials = (regs ?? []).map((r) => (r as { serial: string }).serial);
  if (!serials.length) return { serials: [], lastUpdated: null };

  /* The device just asked, which is the only regular sign of life a wallet
     registration gives: Apple's own client polls this route and carries no
     Authorization header, so nothing else on the service hears from a phone
     that is merely holding a pass. Stamped best effort — a failed stamp makes
     a row look staler than it is, which the sweep would eventually act on, but
     failing the phone's poll over it would be worse.

     Only when the row has gone quiet for an hour. This was an unconditional
     UPDATE, so every poll from every device rewrote its rows — a dead tuple,
     a WAL record and an index entry on wallet_registrations_last_seen apiece,
     for a column nothing reads at a finer grain than days. The predicate is on
     the server, so a fresh row costs a matched-nothing UPDATE rather than a
     write, and the round trip is the same one either way.

     The interval has to stay far below the staleness the sweep acts on
     (wallet_registration_stale_days, 180) or the throttle would start deciding
     which phones look abandoned. An hour is four orders of magnitude under it:
     a device that is polling at all lands inside the window every time, and a
     device that has stopped is stale on the same day it always was. */
  const stampWhenOlderThan = new Date(Date.now() - STAMP_EVERY_MS).toISOString();
  await moduleTables(admin)
    .from("wallet_registrations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("device_id", deviceId)
    .eq("pass_type", passType)
    .lt("last_seen_at", stampWhenOlderThan);

  let q = moduleTables(admin)
    .from("wallet_tokens")
    .select("profile_id, touched_at")
    .in("profile_id", serials)
    .is("revoked_at", null);
  if (since) q = q.gt("touched_at", since);
  const { data: tokens, error: tokenError } = await q;
  if (tokenError) return ledgerNotOpen(tokenError) ? "notOpen" : "error";

  const rows = (tokens ?? []) as Array<{ profile_id: string; touched_at: string }>;
  const lastUpdated = rows.reduce<string | null>((max, r) => (max && max > r.touched_at ? max : r.touched_at), null);
  return { serials: rows.map((r) => r.profile_id), lastUpdated };
}

export async function pushTokensForSerial(admin: Client, passType: string, serial: string): Promise<string[]> {
  const { data } = await moduleTables(admin)
    .from("wallet_registrations")
    .select("push_token")
    .eq("pass_type", passType)
    .eq("serial", serial);
  return (data ?? []).map((r) => (r as { push_token: string }).push_token);
}

export async function dropPushToken(admin: Client, pushToken: string): Promise<void> {
  await moduleTables(admin).from("wallet_registrations").delete().eq("push_token", pushToken);
}
