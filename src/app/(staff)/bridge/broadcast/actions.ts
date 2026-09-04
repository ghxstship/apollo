"use server";

import { revalidatePath } from "next/cache";
import { CLUB_ZONE } from "@/lib/brand";
import { wallClockInZone } from "@/lib/format";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

export type Audience =
  | { kind: "all" }
  | { kind: "lapsed" }
  | { kind: "city"; id: string }
  | { kind: "episode"; id: string }
  | { kind: "tier"; tier: "regional" | "national" | "global" };

const UUID = /^[0-9a-f-]{36}$/;

export type Channel = "notice" | "email" | "push" | "sms";
const CHANNELS: readonly Channel[] = ["notice", "email", "push", "sms"];

/* A datetime-local value read on the club's clock — the same reading the
   episode composer makes for a departure. */
function onClubClock(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const at = new Date(wallClockInZone(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), CLUB_ZONE));
  return Number.isNaN(at.getTime()) ? null : at;
}

/* One word to a chosen audience. The database does the fan-out and keeps the
   record; this checks the shape in words before the RPC refuses it in its own. */
export async function sendBroadcast(
  audience: Audience,
  title: string,
  body: string,
  channels: Channel[],
  /* A datetime-local on the club's clock, or blank to say it now. Queued words
     are performed by the five-minute clock at the database. */
  sendAtLocal: string = ""
): Promise<ActionResult & { recipients?: number; queued?: boolean }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const t = title.trim();
  const b = body.trim();
  if (!t || t.length > 120) return { error: "A title is one line, up to 120 characters." };
  if (!b || b.length > 2000) return { error: "The word is up to two thousand characters." };
  if (channels.length === 0) return { error: "Pick at least one way to say it." };
  if (channels.some((c) => !CHANNELS.includes(c))) return { error: ERR_LAND };
  if ("id" in audience && !UUID.test(audience.id)) return { error: ERR_LAND };

  let sendAt: Date | null = null;
  if (sendAtLocal.trim()) {
    sendAt = onClubClock(sendAtLocal.trim());
    if (!sendAt) return { error: "That hour doesn't parse." };
    if (sendAt.getTime() <= Date.now()) return { error: "The hour has to be ahead of now — or leave it blank to say it at once." };
    if (sendAt.getTime() > Date.now() + 90 * 86_400_000) return { error: "A word is scheduled inside ninety days." };
  }

  const { data, error } = await supabase.rpc("send_broadcast", {
    p_audience: audience,
    p_title: t,
    p_body: b,
    p_channels: channels,
    p_send_at: sendAt ? sendAt.toISOString() : null,
  });
  if (error) return { error: ERR_LAND };
  revalidatePath("/bridge/broadcast");
  return { recipients: typeof data === "number" ? data : 0, queued: !!sendAt };
}

/* A test, to the operator alone. send_broadcast has no single-member audience
   — its kinds are all, city, tier, episode and lapsed — so the test is not a
   broadcast: it is one notice through notify_member and, if email is ticked,
   one letter through queue_email on the same bridge-word template the real
   send uses. Push rides the notice as it does on the real send; a text has no
   staff-callable single-recipient path and is not tested from here. Nothing is
   written to `broadcasts`. */
export async function sendTestToSelf(
  title: string,
  body: string,
  channels: Channel[]
): Promise<ActionResult & { sent?: string[] }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const t = title.trim();
  const b = body.trim();
  if (!t || t.length > 120) return { error: "A title is one line, up to 120 characters." };
  if (!b || b.length > 2000) return { error: "The word is up to two thousand characters." };

  const sent: string[] = [];
  if (channels.includes("notice") || channels.includes("push")) {
    const { error } = await supabase.rpc("notify_member", { p_profile: staffId, p_kind: "word", p_title: t, p_body: b });
    if (error) return { error: ERR_LAND };
    sent.push("notice");
  }
  if (channels.includes("email")) {
    const { data: me } = await supabase.from("profiles").select("email, full_name").eq("id", staffId).maybeSingle();
    if (!me?.email) return { error: "No email on your own profile to test with." };
    const { error } = await supabase.rpc("queue_email", {
      p_to: me.email,
      p_template: "bridge-word",
      p_payload: { name: me.full_name, title: t, body: b },
    });
    if (error) return { error: ERR_LAND };
    sent.push("email");
  }
  if (sent.length === 0) return { error: "A test reaches you as a notice or a letter — tick one of those." };
  return { sent };
}
