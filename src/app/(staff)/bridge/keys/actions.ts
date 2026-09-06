"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";
import { HOOK_EVENTS, KEY_DAYS, NO_END_REASON_MAX, NO_END_REASON_MIN, SCOPES } from "./scopes";
import { asText } from "@/lib/arg";
import { voice } from "@/lib/errors";

/* Neither column is bounded at the database; these keep a pasted paragraph
   out of a label and a URL that a partner's server will never accept out of a
   hook. */
const LABEL_MAX = 80;
const URL_MAX = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done(): ActionResult {
  revalidatePath("/bridge/keys");
  return {};
}

/* How long a key runs, resolved from what the dialog sent.

   `days` is one of the four lengths the console offers, or null for a key with
   no end — and a key with no end has to say why. The sentence is checked here
   and again at the database, where a trigger refuses a null date with no
   reason: this function is not the only way a row can be written, and the rule
   is about the row rather than about this form.

   An end is an instant, counted from now. An operator giving a key that
   already exists a new date is starting its run again from today, which is
   what "another ninety days" means when somebody says it out loud. */
type EndChoice = { error: string } | { expiresAt: string | null; reason: string | null };

function resolveEnd(days: number | null, reason: string): EndChoice {
  if (days === null) {
    const why = asText(reason).trim();
    if (why.length < NO_END_REASON_MIN) {
      return { error: "A key with no end has to say why — name what holds it and who to ask before it is cut off." };
    }
    if (why.length > NO_END_REASON_MAX) {
      return { error: `A reason runs to ${NO_END_REASON_MAX} characters.` };
    }
    return { expiresAt: null, reason: why };
  }
  if (!(KEY_DAYS as readonly number[]).includes(days)) {
    return { error: "Choose one of the lengths on offer." };
  }
  return { expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(), reason: null };
}

/* The key is shown once and never again — we keep a SHA-256 of it and the
   first eight characters, which is enough to recognise a key in a log and
   useless for signing anything. */
export async function createApiKey(
  label: string,
  scopes: string[],
  days: number | null,
  noEndReason: string
): Promise<{ error?: string; key?: string; prefix?: string }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const name = asText(label).trim();
  if (!name) return { error: "Name the key so you know what it opens." };
  if (name.length > LABEL_MAX) return { error: `A key's name runs to ${LABEL_MAX} characters.` };
  const picked = (scopes ?? []).filter((s) => (SCOPES as readonly string[]).includes(s));
  if (!picked.length) return { error: "A key with no scope opens nothing." };
  const end = resolveEnd(days, noEndReason);
  if ("error" in end) return { error: end.error };

  /* `un_`, the club's own mark. This minted `syr_` — the retired name, on a
     credential the operator copies into a partner's config and reads back in
     their logs for the life of the key. Nothing parses the prefix; it is kept
     only so a key can be recognised in a log. */
  const key = `un_${randomBytes(24).toString("base64url")}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, 8);

  const { error } = await supabase.from("api_keys").insert({
    label: name,
    key_hash: keyHash,
    prefix,
    scopes: picked,
    revoked: false,
    created_by: staffId,
    expires_at: end.expiresAt,
    no_expiry_reason: end.reason,
  });
  /* The database has one refusal of its own here — a key with no end and no
     reason — and it is a sentence an operator reads. voice() hands it on and
     flattens anything that is the schema talking to itself. */
  if (error) return { error: voice(error) };

  revalidatePath("/bridge/keys");
  return { key, prefix };
}

/* Set a key's end, or take it away.

   Deliberate in both directions, which is the whole of decision 5's second
   half: the keys that predate the column are NOT backdated and NOT given a
   date by any sweep — the console shows how old they are and flags the ones
   past api_key_stale_days, and an operator decides one at a time. Clearing a
   date needs the same sentence a new key does. */
export async function setApiKeyEnd(
  id: string,
  days: number | null,
  noEndReason: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: "No such key." };
  const end = resolveEnd(days, noEndReason);
  if ("error" in end) return { error: end.error };

  const { error } = await supabase
    .from("api_keys")
    .update({ expires_at: end.expiresAt, no_expiry_reason: end.reason })
    .eq("id", id);
  if (error) return { error: voice(error) };
  return done();
}

export async function revokeApiKey(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: "No such key." };
  const { error } = await supabase.from("api_keys").update({ revoked: true }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}

export async function createWebhook(url: string, events: string[]): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const target = asText(url).trim();
  if (!/^https:\/\/\S+$/.test(target)) return { error: "The destination has to be an https URL." };
  if (target.length > URL_MAX) return { error: `A destination runs to ${URL_MAX.toLocaleString("en-US")} characters.` };
  const picked = (events ?? []).filter((e) => (HOOK_EVENTS as readonly string[]).includes(e));
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
  if (!UUID.test(id)) return { error: "No such hook." };
  const { error } = await supabase.from("webhooks").update({ active }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}
