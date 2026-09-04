"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

export type Audience =
  | { kind: "all" }
  | { kind: "lapsed" }
  | { kind: "city"; id: string }
  | { kind: "episode"; id: string }
  | { kind: "tier"; tier: "regional" | "national" | "global" };

const UUID = /^[0-9a-f-]{36}$/;

/* One word to a chosen audience. The database does the fan-out and keeps the
   record; this checks the shape in words before the RPC refuses it in its own. */
export async function sendBroadcast(
  audience: Audience,
  title: string,
  body: string,
  channels: Array<"notice" | "email">
): Promise<ActionResult & { recipients?: number }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const t = title.trim();
  const b = body.trim();
  if (!t || t.length > 120) return { error: "A title is one line, up to 120 characters." };
  if (!b || b.length > 2000) return { error: "The word is up to two thousand characters." };
  if (channels.length === 0) return { error: "Pick at least one way to say it." };
  if ("id" in audience && !UUID.test(audience.id)) return { error: ERR_LAND };

  const { data, error } = await supabase.rpc("send_broadcast", {
    p_audience: audience,
    p_title: t,
    p_body: b,
    p_channels: channels,
  });
  if (error) return { error: ERR_LAND };
  revalidatePath("/bridge/broadcast");
  return { recipients: typeof data === "number" ? data : 0 };
}
