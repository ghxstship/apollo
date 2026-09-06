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
   Counted rather than stored, so nothing about this needs a column, and
   enforced again under a lock by the cap_wallet_registrations trigger — change
   one and change the other.

   The other half is the sweep: a registration unheard from for
   wallet_registration_stale_days (180) is deleted by the nightly retention
   run, so the ceiling is not slowly filled by phones that were traded in
   without ever sending their DELETE. A device that comes back registers
   again. */
const MAX_DEVICES_PER_PASS = 6;

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
  if ((count ?? 0) >= MAX_DEVICES_PER_PASS) return "tooManyDevices";

  const { error } = await db.insert(row);
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
     failing the phone's poll over it would be worse. */
  await moduleTables(admin)
    .from("wallet_registrations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("device_id", deviceId)
    .eq("pass_type", passType);

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
