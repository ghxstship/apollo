"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

/* The application asks what the Bridge tells it to ask. Until 2026-09-04 the
   questions were the form's own source — changing one was a deploy. Now the
   door reads application_questions, and this is where they are kept. */

export type QuestionKind = "text" | "long" | "choice";
const KINDS: readonly QuestionKind[] = ["text", "long", "choice"];
const KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;
const PROMPT_MIN = 3;
const PROMPT_MAX = 200;
const OPTION_MAX = 80;
const OPTIONS_MAX = 12;

export type QuestionInput = {
  key: string;
  prompt: string;
  kind: QuestionKind;
  options: string[];
  required: boolean;
};

function done(): ActionResult {
  revalidatePath("/bridge/questions");
  revalidatePath("/bridge");
  revalidatePath("/membership");
  return {};
}

/* The same shape the CHECKs hold, said in words before the database says it
   in a constraint name. Choice questions carry their options; the other two
   kinds carry none, so a stale list cannot ride along on a kind change. */
function clean(input: QuestionInput): { ok: true; row: { prompt: string; kind: QuestionKind; options: string[] | null; required: boolean } } | { ok: false; error: string } {
  const prompt = input.prompt.trim();
  if (prompt.length < PROMPT_MIN || prompt.length > PROMPT_MAX)
    return { ok: false, error: `A prompt runs ${PROMPT_MIN} to ${PROMPT_MAX} characters.` };
  if (!KINDS.includes(input.kind)) return { ok: false, error: "That is not a kind of question." };
  let options: string[] | null = null;
  if (input.kind === "choice") {
    options = (input.options ?? [])
      .map((o) => String(o ?? "").trim())
      .filter(Boolean);
    if (options.length < 2) return { ok: false, error: "A choice needs at least two options." };
    /* Refused rather than cut short: an option truncated in silence is an
       option the applicant reads differently from the one the Bridge typed. */
    if (options.some((o) => o.length > OPTION_MAX)) return { ok: false, error: `An option runs to ${OPTION_MAX} characters.` };
    if (options.length > OPTIONS_MAX) return { ok: false, error: `A choice runs to ${OPTIONS_MAX} options.` };
    if (new Set(options).size !== options.length) return { ok: false, error: "Two options say the same thing." };
  }
  return { ok: true, row: { prompt, kind: input.kind, options, required: input.required === true } };
}

export async function createQuestion(input: QuestionInput): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const key = input.key.trim().toLowerCase();
  if (!KEY_RE.test(key))
    return { error: "A key is lowercase letters, digits and underscores, 2 to 41 characters, starting with a letter." };
  const c = clean(input);
  if (!c.ok) return { error: c.error };

  /* New questions go on the end. */
  const { data: last } = await supabase
    .from("application_questions")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("application_questions").insert({
    key,
    ...c.row,
    active: true,
    position: (last?.position ?? 0) + 1,
  });
  if (error) {
    if (error.code === "23505") return { error: "A question already carries that key." };
    return { error: ERR_LAND };
  }
  return done();
}

export async function updateQuestion(key: string, input: QuestionInput): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!KEY_RE.test(key)) return { error: "No such question." };
  const c = clean(input);
  if (!c.ok) return { error: c.error };
  /* Zero rows is not a change: a key that has gone since the screen loaded
     would otherwise report "Question changed." */
  const { data: changed, error } = await supabase.from("application_questions").update(c.row).eq("key", key).select("key");
  if (error) return { error: ERR_LAND };
  if (!changed || changed.length === 0) return { error: "No such question." };
  return done();
}

/* Off is not gone: answers already filed under the key still read against
   the prompt, so a question is switched off rather than deleted. */
export async function setQuestionActive(key: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!KEY_RE.test(key)) return { error: "No such question." };
  const { error } = await supabase.from("application_questions").update({ active }).eq("key", key);
  if (error) return { error: ERR_LAND };
  return done();
}

/* One step up or down: swap positions with the neighbour. Two updates rather
   than a renumbering pass — the list is a dozen rows and the swap is the whole
   of what the operator asked for. */
export async function moveQuestion(key: string, direction: "up" | "down"): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!KEY_RE.test(key)) return { error: "No such question." };

  const { data: rows, error: readError } = await supabase
    .from("application_questions")
    .select("key, position")
    .order("position", { ascending: true });
  if (readError || !rows) return { error: ERR_LAND };

  const i = rows.findIndex((r) => r.key === key);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return {};

  /* Positions may carry duplicates from an earlier insert; normalise the two
     being swapped to their list indexes so the swap always takes. */
  const a = rows[i];
  const b = rows[j];
  const posA = i + 1;
  const posB = j + 1;
  const [r1, r2] = await Promise.all([
    supabase.from("application_questions").update({ position: posB }).eq("key", a.key),
    supabase.from("application_questions").update({ position: posA }).eq("key", b.key),
  ]);
  if (r1.error || r2.error) return { error: ERR_LAND };
  return done();
}
