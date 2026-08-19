"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";
import { HOOK_EVENTS, SCOPES } from "./scopes";

function done(): ActionResult {
  revalidatePath("/bridge/keys");
  return {};
}

/* The key is shown once and never again — we keep a SHA-256 of it and the
   first eight characters, which is enough to recognise a key in a log and
   useless for signing anything. */
export async function createApiKey(
  label: string,
  scopes: string[]
): Promise<{ error?: string; key?: string; prefix?: string }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const name = label.trim();
  if (!name) return { error: "Name the key so you know what it opens." };
  const picked = scopes.filter((s) => (SCOPES as readonly string[]).includes(s));
  if (!picked.length) return { error: "A key with no scope opens nothing." };

  const key = `lyre_${randomBytes(24).toString("base64url")}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, 8);

  const { error } = await supabase.from("api_keys").insert({
    label: name,
    key_hash: keyHash,
    prefix,
    scopes: picked,
    revoked: false,
    created_by: staffId,
  });
  if (error) return { error: ERR_LAND };

  revalidatePath("/bridge/keys");
  return { key, prefix };
}

export async function revokeApiKey(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("api_keys").update({ revoked: true }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}

export async function createWebhook(url: string, events: string[]): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const target = url.trim();
  if (!/^https:\/\/\S+$/.test(target)) return { error: "The destination has to be an https URL." };
  const picked = events.filter((e) => (HOOK_EVENTS as readonly string[]).includes(e));
  if (!picked.length) return { error: "Choose at least one event to send." };

  const { error } = await supabase.from("webhooks").insert({
    url: target,
    events: picked,
    secret: `whsec_${randomBytes(24).toString("hex")}`,
    active: true,
  });
  if (error) return { error: ERR_LAND };
  return done();
}

export async function setWebhookActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("webhooks").update({ active }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}
