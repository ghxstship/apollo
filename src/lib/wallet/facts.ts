import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { moduleTables } from "@/lib/module-tables";
import { TIER_LABEL } from "@/lib/format";
import { memberNumber } from "@/lib/membership";

/* What a wallet pass says about a member, read once and handed to both
   platforms, so the Apple pass and the Google pass cannot describe the same
   person two ways.

   Works with either client. The member's own route holds their session client
   and RLS scopes every read; the PassKit web service holds the service-role
   client because a device carries no cookie. Both are SupabaseClient<Database>,
   and the wallet tables — which the shared type file has never heard of — are
   reached through moduleTables(), the seam the other in-flight modules use. */

export type CardFacts = {
  profileId: string;
  name: string;
  /* Bare digits, the way the card face sets them — never the retired prefix. */
  memberNo: string;
  planLabel: string;
  city: string;
  standing: "active" | "paused" | "departed";
};

/* The shapes of the two tables the SQL in docs/WALLET.md creates. Declared
   here, beside the code that reads them, until they move into types.ts. */
export type WalletTokenRow = {
  token: string;
  profile_id: string;
  issued_at: string;
  revoked_at: string | null;
  touched_at: string;
};

export type WalletRegistrationRow = {
  device_id: string;
  pass_type: string;
  serial: string;
  push_token: string;
  created_at: string;
};

type Client = SupabaseClient<Database>;

export async function readCardFacts(supabase: Client, profileId: string): Promise<CardFacts | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, member_no, tier, home_city, status, plan_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return null;

  const [plan, city] = await Promise.all([
    profile.plan_id
      ? supabase.from("membership_plans").select("label").eq("id", profile.plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    profile.home_city
      ? supabase.from("cities").select("name").eq("id", profile.home_city).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    profileId: profile.id,
    name: profile.full_name?.trim() || "A member",
    memberNo: memberNumber(profile.member_no),
    /* The plan's own label where one is set; the tier's where it is not. Never
       an invented product name. */
    planLabel: plan.data?.label ?? TIER_LABEL[profile.tier] ?? "Regional",
    city: city.data?.name ?? "",
    standing: profile.status,
  };
}

/* PostgREST answers a table or function the schema has never been told about
   with its own codes, and Postgres with its own; both mean the same thing here:
   the SQL in docs/WALLET.md has not been applied on this database yet. */
export function ledgerNotOpen(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "PGRST202" || code === "PGRST205" || code === "42P01" || code === "42883") return true;
  return /could not find the (table|function)|does not exist/i.test(error.message ?? "");
}

export type WalletTokenResult =
  | { token: WalletTokenRow }
  | { notOpen: true }
  | { error: { code?: string | null; message?: string | null } };

/* The member's own durable wallet token — the one that is live now, or a
   fresh one if none is. issue_wallet_token() is SECURITY DEFINER and scoped
   to auth.uid(), so the caller's session is the whole of the authorisation. */
export async function issueWalletToken(supabase: Client): Promise<WalletTokenResult> {
  const { data, error } = await moduleTables(supabase).rpc("issue_wallet_token");
  if (error) return ledgerNotOpen(error) ? { notOpen: true } : { error };
  const row = (Array.isArray(data) ? data[0] : data) as WalletTokenRow | undefined;
  if (!row?.token) return { error: { message: "no token returned" } };
  return { token: row };
}

/* The live token for a serial, read by the web service with the service-role
   client after the ApplePass authentication token has been checked. */
export async function liveWalletToken(admin: Client, profileId: string): Promise<WalletTokenResult> {
  const { data, error } = await moduleTables(admin)
    .from("wallet_tokens")
    .select("token, profile_id, issued_at, revoked_at, touched_at")
    .eq("profile_id", profileId)
    .is("revoked_at", null)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return ledgerNotOpen(error) ? { notOpen: true } : { error };
  if (!data) return { error: { message: "no live token" } };
  return { token: data as WalletTokenRow };
}
