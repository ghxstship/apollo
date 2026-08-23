import type { Metadata } from "next";
import { getOperator } from "../../data";
import { KeysClient, type HookRow, type KeyRow } from "./keys-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Keys and hooks" };

export default async function KeysPage() {
  const { supabase } = await getOperator();

  const [keysRes, hooksRes, deliveriesRes] = await Promise.all([
    supabase.from("api_keys").select("*").order("created_at", { ascending: false }),
    supabase.from("webhooks").select("*").order("created_at", { ascending: false }),
    supabase
      .from("webhook_deliveries")
      .select("id, webhook_id, event, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const keys: KeyRow[] = (must(keysRes)).map((k) => ({
    id: k.id,
    label: k.label,
    prefix: k.prefix,
    scopes: k.scopes ?? [],
    revoked: k.revoked,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
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
      <p className="hm-lede">
        Keys for reading the club from outside; hooks for telling another system what happened. Both
        are scoped narrowly and both can be shut off from here.
      </p>
      <p className="hm-note" style={{ marginTop: 10, maxWidth: "60ch" }}>
        Not yet connected. Keys and hooks are recorded here, but nothing reads a
        key and nothing posts a hook — issue one only to hold a place, never to
        a partner expecting it to work.
      </p>
      <KeysClient keys={keys} hooks={hooks} />
    </div>
  );
}
