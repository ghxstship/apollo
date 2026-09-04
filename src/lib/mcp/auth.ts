import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";
import type { SCOPES } from "@/app/(staff)/bridge/keys/scopes";

/* Who is calling, by API key.

   The keys console (bridge/keys/actions.ts) mints `un_` + 24 random bytes,
   shows it once, and keeps only a SHA-256 hex of it and the first eight
   characters. So verification is the same hash, looked up by equality: no
   secret is compared in this process, and a key that was never minted hashes
   to a row that does not exist. The lookup runs on the service role because
   api_keys is staff-only under RLS and the caller has no session at all — it
   is the ONE service-role read this endpoint makes before a key is known to be
   good, and it reads a hash column by a hash. */

export type ApiKey = Tables<"api_keys">;
export type Scope = (typeof SCOPES)[number];
/* The service-role client the tools run on, once the key is good. */
export type Admin = ReturnType<typeof createAdminClient>;

export type KeyVerdict =
  | { ok: true; key: ApiKey; admin: Admin }
  | { ok: false; status: 401; message: string };

const BEARER = /^Bearer\s+(\S+)$/i;

/* A minted key is a short lowercase prefix (`un_` today; the console minted
   another under the retired name) plus 32 base64url characters. Anything
   shaped otherwise is refused before it is hashed, so the database is not
   asked about noise. */
const KEY_SHAPE = /^[a-z]{2,4}_[A-Za-z0-9_-]{20,64}$/;

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function verifyKey(request: Request): Promise<KeyVerdict> {
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(BEARER);
  if (!m) {
    return { ok: false, status: 401, message: "No key presented. Send it as Authorization: Bearer <key>." };
  }
  const raw = m[1];
  if (!KEY_SHAPE.test(raw)) {
    return { ok: false, status: 401, message: "That key does not open anything here." };
  }

  const admin = createAdminClient();
  const { data: key, error } = await admin
    .from("api_keys")
    .select("*")
    .eq("key_hash", hashKey(raw))
    .maybeSingle();

  if (error) {
    /* The database could not answer; that is not the caller's key. Said as a
       401 anyway, because the alternative is telling an unknown caller about
       the club's database. */
    return { ok: false, status: 401, message: "The keys could not be read just now. Try again shortly." };
  }
  if (!key) return { ok: false, status: 401, message: "That key does not open anything here." };
  if (key.revoked) return { ok: false, status: 401, message: "That key has been revoked. Ask the Bridge for a new one." };

  /* Last used, best effort — a failed stamp must not fail the call. */
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

  return { ok: true, key, admin };
}

export function hasScope(key: ApiKey, scope: Scope): boolean {
  return (key.scopes ?? []).includes(scope);
}
