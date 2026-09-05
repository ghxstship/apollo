"use server";

import { revalidatePath } from "next/cache";
import { CLUB_ZONE } from "@/lib/brand";
import { voice } from "@/lib/errors";
import { wallClockInZone } from "@/lib/format";
import { staffContext, ERR_STAFF, type ActionResult } from "../../staff";

import { FIELDS, MAX_RULES, audienceReady, type Audience } from "./audience";
export type { Audience } from "./audience";

/* The audiences send_broadcast fans out to. Both are checked in the function
   too, but its refusals — "no such audience", "no such rule" — used to come
   back here as "That didn't land", so an operator whose screen had drifted
   from the list learned nothing. Said in words first. */
const AUDIENCES: readonly Audience["kind"][] = ["all", "lapsed", "city", "episode", "tier", "filter"];
const TIERS = ["regional", "national", "global"] as const;

/* The shape check the builder cannot be trusted to have done: a real field, a
   real op, a bounded rule count. The database resolves and refuses after. */
function audienceProblem(a: Audience | null): string | null {
  if (!a || !AUDIENCES.includes(a.kind)) return "Pick who hears it.";
  if (a.kind === "tier" && !(TIERS as readonly string[]).includes(a.tier)) return "That is not a tier.";
  if ("id" in a && !UUID.test(a.id ?? "")) return a.kind === "city" ? "Pick the city first." : "Pick the episode first.";
  if (a.kind === "filter") {
    if (!Array.isArray(a.rules) || a.rules.length < 1) return "Add at least one rule.";
    if (a.rules.length > MAX_RULES) return `An audience is up to ${MAX_RULES} rules.`;
    if (a.match !== "all" && a.match !== "any") return "Rules match all, or any.";
    for (const r of a.rules) if (!(r.field in FIELDS)) return "That is not a rule the club can read.";
    if (!audienceReady(a)) return "Finish every rule before sending.";
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const picked = Array.from(new Set(channels ?? []));
  if (picked.length === 0) return { error: "Pick at least one way to say it." };
  if (picked.some((c) => !CHANNELS.includes(c))) return { error: "That is not a way to say it — a notice, a letter, a push or a text." };
  const problem = audienceProblem(audience);
  if (problem) return { error: problem };

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
    p_channels: picked,
    p_send_at: sendAt ? sendAt.toISOString() : null,
  });
  /* The function speaks in the club's voice when it refuses; let it. */
  if (error) return { error: voice(error) };
  revalidatePath("/bridge/broadcast");
  return { recipients: typeof data === "number" ? data : 0, queued: !!sendAt };
}

/* How many the rules reach, and a few names, as the operator builds them.
   Staff only at the database; a refusal is a count of nothing. */
export async function previewAudience(audience: Audience): Promise<ActionResult & { count?: number; sample?: string[] }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const problem = audienceProblem(audience);
  if (problem) return { error: problem };
  const { data, error } = await supabase.rpc("broadcast_audience_preview", { p_audience: audience });
  if (error) return { error: voice(error) };
  const d = (data ?? {}) as { count?: number; sample?: string[] };
  return { count: Number(d.count ?? 0), sample: Array.isArray(d.sample) ? d.sample.map(String) : [] };
}

/* A test, to the operator alone. send_broadcast has a single-member audience
   for exactly this — {kind:"member", id} is admitted only when the id is the
   caller's own — so the test IS a broadcast: the same fan-out, the same
   channel logic (a notice reaches push; push alone stays out of the Inbox; a
   letter on bridge-word; a text to a verified number, cut at 140), recorded in
   `broadcasts` as a one-recipient send. Until 2026-09-05 this went through
   notify_member and queue_email instead, which never exercised push-alone or
   the text path — an operator's test passed and the real send took a channel
   the test had not. */
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
  const picked = channels.filter((c) => CHANNELS.includes(c));
  if (picked.length === 0) return { error: "Pick at least one way to say it." };

  const { data, error } = await supabase.rpc("send_broadcast", {
    p_audience: { kind: "member", id: staffId },
    p_title: t,
    p_body: b,
    p_channels: picked,
    p_send_at: null,
  });
  /* Its refusals speak in the club's voice — "a test goes to yourself" among
     them — so they are passed through rather than flattened. */
  if (error) return { error: voice(error) };
  if (typeof data !== "number" || data < 1) return { error: "The test reached nobody — is your own profile active?" };
  revalidatePath("/bridge/broadcast");
  return { sent: picked };
}
