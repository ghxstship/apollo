"use server";

import { staffContext } from "./staff";

export type BridgeHit = { kind: string; id: string; title: string; subtitle: string; href: string };

/* One search across the Bridge: members, episodes, codes, applications and
   crew candidates, through a staff-only definer that returns typed rows with
   the door each one opens. Two characters or nothing; the function bounds the
   rest. */
export async function searchBridge(q: string): Promise<BridgeHit[]> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return [];
  const needle = (q ?? "").trim().slice(0, 80);
  if (needle.length < 2) return [];
  const { data, error } = await supabase.rpc("bridge_search", { p_q: needle });
  if (error || !data) return [];
  return data as BridgeHit[];
}
