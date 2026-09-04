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

export type RegistrationOutcome = "created" | "exists" | "notOpen" | "error";

export async function registerDevice(
  admin: Client,
  row: Omit<WalletRegistrationRow, "created_at">
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
    /* Same device, same pass, a fresh push token — keep the newest. */
    await db.update({ push_token: row.push_token }).eq("device_id", row.device_id).eq("pass_type", row.pass_type).eq("serial", row.serial);
    return "exists";
  }
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
