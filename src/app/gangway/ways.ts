/* The ways aboard, and the two dials they share. Read by the page (which
   provider buttons to show), the actions (which providers to accept) and the
   You page (the password floor). */
export const PROVIDERS = ["google", "apple"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_LABEL: Record<Provider, string> = { google: "Google", apple: "Apple" };

/* Which providers the owner has switched on — the keys live in Supabase, the
   switch lives here so a button never points at a provider with no keys. */
export function enabledProviders(): Provider[] {
  const raw = process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Provider => (PROVIDERS as readonly string[]).includes(s));
}

export const PASSWORD_MIN = 10;
