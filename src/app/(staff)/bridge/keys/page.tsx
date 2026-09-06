import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOperator } from "../../data";
import { KeysClient, type HookRow, type KeyRow } from "./keys-client";
import { must } from "../../staff";
import { KEY_DAYS_FALLBACK } from "./scopes";

export const metadata: Metadata = { title: "Keys and hooks" };

/* Behind a setting until a partner needs one (decided 2026-09-02). Nothing
   reads a key and nothing posts a hook, so a console that offers to cut one is
   a promise the hull cannot keep. club_settings.keys_console_enabled = 1 opens
   it — the nav reads the same key, so the tab and the route agree. */
export default async function KeysPage() {
  const { supabase } = await getOperator();

  const { data: enabled } = await supabase.rpc("club_setting", { p_key: "keys_console_enabled" });
  if (!enabled) notFound();

  /* Both dials are the owner's, not the component's: how long a new key runs
     by default, and how old a key with no end has to be before the console
     says so. Read here so the client is handed numbers rather than reaching
     for the database itself. */
  const [defaultDaysRes, staleDaysRes] = await Promise.all([
    supabase.rpc("club_setting", { p_key: "api_key_days" }),
    supabase.rpc("club_setting", { p_key: "api_key_stale_days" }),
  ]);

  const [keysRes, hooksRes, deliveriesRes] = await Promise.all([
    supabase.from("api_keys").select("*").order("created_at", { ascending: false }),
    supabase.from("webhooks").select("*").order("created_at", { ascending: false }),
    supabase
      .from("webhook_deliveries")
      .select("id, webhook_id, event, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  /* Age and the days left are counted here rather than in the browser. Both
     are derived from a clock, and a clock read twice — once on the server and
     once on the client — is a hydration mismatch on a screen whose whole job
     is to be believed about dates. One reading, taken at the request. */
  /* new Date() rather than Date.now(): the compiler's purity rule flags the
     latter by name, and every other server page in this app already reads the
     clock this way. */
  const now = new Date().getTime();
  const daysBetween = (from: number, to: number) => Math.floor((to - from) / 86_400_000);

  const keys: KeyRow[] = (must(keysRes)).map((k) => ({
    id: k.id,
    label: k.label,
    prefix: k.prefix,
    scopes: k.scopes ?? [],
    revoked: k.revoked,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
    expiresAt: k.expires_at,
    noEndReason: k.no_expiry_reason,
    ageDays: Math.max(0, daysBetween(Date.parse(k.created_at), now)),
    endsInDays: k.expires_at === null ? null : daysBetween(now, Date.parse(k.expires_at)),
  }));

  /* Last ten per hook — enough to see a pattern, short enough to read. */
  const byHook = new Map<string, HookRow["deliveries"]>();
  for (const d of must(deliveriesRes)) {
    const list = byHook.get(d.webhook_id) ?? [];
    if (list.length >= 10) continue;
    list.push({
      id: d.id,
      event: d.event,
      status: d.status,
      error: d.error,
      createdAt: d.created_at,
    });
    byHook.set(d.webhook_id, list);
  }

  const hooks: HookRow[] = (must(hooksRes)).map((h) => ({
    id: h.id,
    url: h.url,
    events: h.events ?? [],
    active: h.active,
    createdAt: h.created_at,
    deliveries: byHook.get(h.id) ?? [],
  }));

  return (
    <div>
      <span className="hm-eyebrow">Keys and hooks</span>
      <h1 className="hm-h1">What we let through the hull.</h1>
      <p className="ls-lede">
        Keys for reading the club from outside; hooks for telling another system what happened. Both
        are scoped narrowly and both can be shut off from here.
      </p>
      <p className="hm-note">
        Not yet connected. Keys and hooks are recorded here, but nothing reads a
        key and nothing posts a hook — issue one only to hold a place, never to
        a partner expecting it to work.
      </p>
      <KeysClient
        keys={keys}
        hooks={hooks}
        defaultDays={typeof defaultDaysRes.data === "number" ? defaultDaysRes.data : KEY_DAYS_FALLBACK}
        staleDays={typeof staleDaysRes.data === "number" ? staleDaysRes.data : 90}
      />
    </div>
  );
}
