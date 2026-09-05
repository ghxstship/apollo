"use server";

import { revalidatePath } from "next/cache";
import { CLUB_ZONE } from "@/lib/brand";
import { wallClockInZone } from "@/lib/format";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

/* A poll is one question with two to six answers and a closing hour. Members
   vote once; the Bridge reads the tally at any time and, once it has closed,
   marks which way it went. The question is about the club — a venue, a night,
   a name — and never about a person; the screen says so once and this file
   holds no rule that could check it, because a rule that could would have to
   read names. */

const QUESTION_MIN = 3;
const QUESTION_MAX = 200;
const OPTION_MAX = 80;
/* A real uuid, not thirty-six of the right characters — the loose test let
   "------------------------------------" through to the driver as a 22P02. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done(): ActionResult {
  revalidatePath("/bridge/polls");
  revalidatePath("/polls");
  return {};
}

/* A datetime-local value, read on the club's clock — the same reading the
   episode composer makes for a departure. */
function onClubClock(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const at = new Date(wallClockInZone(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), CLUB_ZONE));
  return Number.isNaN(at.getTime()) ? null : at;
}

export async function createPoll(question: string, options: string[], closesAtLocal: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const q = question.trim();
  if (q.length < QUESTION_MIN || q.length > QUESTION_MAX)
    return { error: `A question runs ${QUESTION_MIN} to ${QUESTION_MAX} characters.` };
  const opts = (options ?? []).map((o) => String(o ?? "").trim()).filter(Boolean);
  if (opts.length < 2 || opts.length > 6) return { error: "A question takes two to six answers." };
  /* Refused, not silently cut short — an answer the operator typed and did not
     see truncated would reach members as a different answer. */
  if (opts.some((o) => o.length > OPTION_MAX)) return { error: `An answer runs to ${OPTION_MAX} characters.` };
  if (new Set(opts).size !== opts.length) return { error: "Two answers say the same thing." };
  const closes = onClubClock(closesAtLocal);
  if (!closes) return { error: "Set the hour it closes." };
  if (closes.getTime() <= Date.now()) return { error: "The closing hour has to be ahead of now." };

  const { error } = await supabase.from("polls").insert({
    question: q,
    options: opts,
    closes_at: closes.toISOString(),
    created_by: staffId,
  });
  if (error) return { error: ERR_LAND };
  return done();
}

/* Close early: the closing hour becomes now. Votes stop at the database, which
   reads closes_at on every cast. */
export async function closePoll(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: "No such question." };
  const { error } = await supabase
    .from("polls")
    .update({ closes_at: new Date().toISOString() })
    .eq("id", id)
    .gt("closes_at", new Date().toISOString());
  if (error) return { error: ERR_LAND };
  return done();
}

/* Settle: record which answer carried. The index is checked against the
   options the row actually holds, and a poll still open is not settled — the
   outcome would be a prediction. */
export async function settlePoll(id: string, option: number): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: "No such question." };
  const { data: poll } = await supabase.from("polls").select("options, closes_at").eq("id", id).maybeSingle();
  if (!poll) return { error: "No such question." };
  if (new Date(poll.closes_at).getTime() > Date.now()) return { error: "Close it first — an open question has no outcome yet." };
  const n = Array.isArray(poll.options) ? poll.options.length : 0;
  if (!Number.isInteger(option) || option < 0 || option >= n) return { error: "Pick one of the answers." };
  const { error } = await supabase.from("polls").update({ settled: option }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}
