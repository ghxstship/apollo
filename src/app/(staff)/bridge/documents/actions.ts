"use server";

import { revalidatePath } from "next/cache";
import { CLUB_ZONE } from "@/lib/brand";
import { endOfDay, startOfDay } from "@/lib/format";
import type { ClauseCategory } from "@/lib/supabase/types";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

/* The clause library and the composer.

   Nothing here edits in place. Rewording a clause publishes the next version of
   that clause; changing a document publishes the next version of the document.
   The database enforces it with triggers — these actions just make the right
   move the easy one. */

function done(): ActionResult {
  revalidatePath("/bridge/documents");
  revalidatePath("/agreements");
  return {};
}

/* clauses.category is a check constraint on these seven. The composer's
   condition is keyed `class` — the key the preview renderer and the
   agreements page test against the episode's setting — and takes only the
   two settings the club runs in. Anything else is refused here, in words. */
const CATEGORIES: readonly ClauseCategory[] = [
  "liability", "conduct", "media", "privacy", "payment", "crew", "general",
];
const CONDITION_SETTINGS = ["sea", "shore"] as const;
const TITLE_MAX = 200;
const BODY_MAX = 20_000;
const NOTE_MAX = 500;
const SIGNER_TITLE_MAX = 120;
const POSITION_MAX = 999;

/* Row ids off the screen and the short codes that key clauses and documents.
   A malformed id reaches the driver as "invalid input syntax for type uuid",
   which names a Postgres type at an operator who never chose one; a code off
   the library reaches it as a foreign key. Both are refused here first. */
const UUID = /^[0-9a-f-]{36}$/;
const CODE = /^[a-z0-9][a-z0-9-]{0,59}$/;

function cleanCondition(raw: Record<string, string>): Record<string, string> | string {
  const keys = Object.keys(raw ?? {});
  if (keys.length === 0) return {};
  if (keys.length > 1 || keys[0] !== "class") return "A clause is held to a setting, or to nothing.";
  if (!(CONDITION_SETTINGS as readonly string[]).includes(raw.class)) return "That is not a setting.";
  return { class: raw.class };
}

export type NewClause = {
  code: string;
  title: string;
  category: ClauseCategory;
  body: string;
};

export async function createClause(input: NewClause): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const code = input.code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!code) return { error: "A clause needs a short code." };
  if (!input.title.trim()) return { error: "A clause needs a title." };
  if (input.title.trim().length > TITLE_MAX) return { error: `A clause's title runs to ${TITLE_MAX} characters.` };
  if (!CATEGORIES.includes(input.category)) return { error: "That is not a clause category." };
  if (input.body.trim().length < 20) return { error: "That is too short to be a clause." };
  if (input.body.trim().length > BODY_MAX) return { error: "That is too long for one clause — split it." };

  const { error: clauseError } = await supabase
    .from("clauses")
    .insert({ code, title: input.title.trim(), category: input.category });
  if (clauseError) {
    return {
      error: /duplicate|unique/i.test(clauseError.message)
        ? "A clause already carries that code."
        : ERR_LAND,
    };
  }

  const { error } = await supabase.from("clause_versions").insert({
    clause_code: code,
    version: 1,
    body: input.body.trim(),
    note: "Initial wording",
    published_by: staffId,
  });
  if (error) return { error: ERR_LAND };
  return done();
}

/* Rewording never mutates. The next version is published alongside the old one,
   and every signature already taken keeps pointing at what it pointed at. */
export async function reviseClause(
  clauseCode: string,
  body: string,
  note: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const code = clauseCode.trim().toLowerCase();
  if (!CODE.test(code)) return { error: "No clause carries that code." };
  if (body.trim().length < 20) return { error: "That is too short to be a clause." };
  if (body.trim().length > BODY_MAX) return { error: "That is too long for one clause — split it." };
  if (note.trim().length > NOTE_MAX) return { error: `A revision note runs to ${NOTE_MAX} characters.` };

  /* A code with no clause behind it would otherwise reach the database as a
     foreign key and come back as "That didn't land." */
  const { data: clause } = await supabase.from("clauses").select("code").eq("code", code).maybeSingle();
  if (!clause) return { error: "No clause carries that code." };

  const { data: latest, error: readError } = await supabase
    .from("clause_versions")
    .select("version")
    .eq("clause_code", code)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) return { error: ERR_LAND };

  const next = (latest?.version ?? 0) + 1;
  const { error } = await supabase.from("clause_versions").insert({
    clause_code: code,
    version: next,
    body: body.trim(),
    note: note.trim() || null,
    published_by: staffId,
  });
  if (error) {
    /* (clause_code, version) is unique. Two operators rewording the same
       clause at once both read the same "latest" and one of them loses. */
    if (error.code === "23505") return { error: "Somebody just reworded this clause — reload and read theirs first." };
    return { error: ERR_LAND };
  }
  return done();
}

/* Start the next version of a document by copying the standing composition.
   Editing from a copy is what makes revision cheap; the published version is
   frozen, so there is nothing to break. */
export async function draftNextVersion(documentCode: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const code = documentCode.trim().toLowerCase();
  if (!CODE.test(code)) return { error: "No document carries that code." };

  const { data: doc } = await supabase.from("documents").select("code").eq("code", code).maybeSingle();
  if (!doc) return { error: "No document carries that code." };

  /* A read that fails is not an empty list: treated as one, this would have
     opened "version 1" of a document with a dozen on the books and been
     refused as a duplicate — or worse, not been. */
  const { data: existing, error: readError } = await supabase
    .from("document_versions")
    .select("id, version, status")
    .eq("document_code", code)
    .order("version", { ascending: false });
  if (readError) return { error: ERR_LAND };

  if ((existing ?? []).some((v) => v.status === "draft")) {
    return { error: "There is already a draft open for that document." };
  }

  const standing = (existing ?? []).find((v) => v.status === "published");
  const next = ((existing ?? [])[0]?.version ?? 0) + 1;

  const { data: created, error } = await supabase
    .from("document_versions")
    .insert({ document_code: code, version: next, status: "draft" })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { error: "Somebody just opened a draft of that document — reload." };
    return { error: ERR_LAND };
  }
  if (!created) return { error: ERR_LAND };

  if (standing) {
    const { data: clauses, error: clauseReadError } = await supabase
      .from("document_clauses")
      .select("clause_version_id, position, condition")
      .eq("document_version_id", standing.id);
    /* The draft exists by now. If the standing clauses did not follow it, say
       so rather than presenting an empty composer as "opened from the
       standing version" — the operator would publish a document that says
       nothing, and the publish guard would be the first to tell them. */
    const copyError = clauseReadError
      ? clauseReadError
      : clauses?.length
        ? (
            await supabase.from("document_clauses").insert(
              clauses.map((c) => ({
                document_version_id: created.id,
                clause_version_id: c.clause_version_id,
                position: c.position,
                condition: c.condition,
              }))
            )
          ).error
        : null;
    if (copyError) {
      done();
      return { error: "The draft opened, but the standing clauses did not copy across. Tick them in the composer." };
    }
  }
  return done();
}

export async function setDraftClause(
  versionId: string,
  clauseVersionId: string,
  position: number,
  condition: Record<string, string>,
  include: boolean
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(versionId)) return { error: "No version under that id." };
  if (!UUID.test(clauseVersionId)) return { error: "That clause wording is not in the library." };
  if (typeof include !== "boolean") return { error: "A clause is in the draft or it is not." };

  const cleaned = cleanCondition(condition);
  if (typeof cleaned === "string") return { error: cleaned };
  const pos = Math.round(Number(position));
  if (!Number.isFinite(pos) || pos < 1 || pos > POSITION_MAX)
    return { error: `A clause's position runs 1 to ${POSITION_MAX}.` };

  if (!include) {
    const { error } = await supabase
      .from("document_clauses")
      .delete()
      .eq("document_version_id", versionId)
      .eq("clause_version_id", clauseVersionId);
    if (error) {
      return {
        error: /fixed/i.test(error.message)
          ? "That version is published. Draft the next one to change it."
          : ERR_LAND,
      };
    }
    return done();
  }

  const { error } = await supabase.from("document_clauses").upsert({
    document_version_id: versionId,
    clause_version_id: clauseVersionId,
    position: pos,
    condition: cleaned,
  });
  if (error) {
    if (/fixed/i.test(error.message)) return { error: "That version is published. Draft the next one to change it." };
    /* Either parent can have gone since the composer loaded: a draft struck
       from the board, or a clause version that is not in the library. */
    if (error.code === "23503") return { error: "That draft, or that clause wording, is no longer on the books — reload." };
    return { error: ERR_LAND };
  }
  return done();
}

export async function publishVersion(versionId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(versionId)) return { error: "No version under that id." };

  const { error } = await supabase.rpc("publish_document_version", { p_id: versionId });
  if (error) {
    if (/staff only/i.test(error.message)) return { error: ERR_STAFF };
    if (/no clauses/i.test(error.message)) return { error: "A document with no clauses says nothing." };
    if (/out of use/i.test(error.message))
      return { error: "This draft carries a clause that is out of use. Untick it, then publish." };
    /* Ahead of the /retired/i branch below, which would not match this anyway,
       but the order of these tests is load-bearing and worth keeping obvious.
       Without a branch here the refusal fell through to "That didn't land." —
       a dead end on the one screen where the operator needs a way forward. */
    if (/more than one version|says its piece once/i.test(error.message))
      return {
        error:
          "This draft carries the same clause at two versions, so it would say that thing twice. Untick it until the box clears, then tick it again to take the current wording.",
      };
    if (/already the standing one/i.test(error.message))
      return { error: "That version is already the standing one." };
    if (/retired/i.test(error.message))
      return { error: "That version is retired. Copy it into a fresh draft to bring it back." };
    if (/no such version/i.test(error.message)) return { error: "No version under that id." };
    if (/only a draft/i.test(error.message)) return { error: "Only a draft can be published." };
    return { error: ERR_LAND };
  }
  return done();
}

/* GDPR Art 17(3)(e): erasure does not reach a record needed to answer a legal
   claim. Redaction removes the person and keeps the proof. */
export async function redactSignature(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: "No signature under that id." };

  const { error } = await supabase.rpc("redact_signature", { p_id: id });
  if (error) {
    /* The RPC distinguishes these; the operator should see the difference.
       Telling someone a signature that does not exist has "already" been dealt
       with invites them to retry something that can never succeed. */
    if (/staff only/i.test(error.message)) return { error: ERR_STAFF };
    if (/already redacted/i.test(error.message)) return { error: "That one is already redacted." };
    if (/no signature under that id/i.test(error.message))
      return { error: "No signature under that id." };
    return { error: ERR_LAND };
  }
  revalidatePath("/bridge/documents");
  return {};
}

/* A waiver is one-way; a contract binds the club too. Until the club signs its
   side, a contract is an offer. */
export async function counterSign(signatureId: string, title: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(signatureId)) return { error: "No signature under that id." };

  const signedAs = title.trim();
  if (signedAs.length > SIGNER_TITLE_MAX)
    return { error: `"Signing as" runs to ${SIGNER_TITLE_MAX} characters.` };
  const { error } = await supabase.rpc("counter_sign", {
    p_signature_id: signatureId,
    p_title: signedAs || null,
  });
  if (error) {
    if (/staff only/i.test(error.message)) return { error: ERR_STAFF };
    if (/already counter-signed/i.test(error.message)) return { error: "That one is already counter-signed." };
    if (/no such signature|no signature under that id/i.test(error.message))
      return { error: "No signature under that id." };
    if (/one-way/i.test(error.message)) return { error: "A waiver is one-way — only a contract is counter-signed." };
    return { error: ERR_LAND };
  }
  revalidatePath("/bridge/documents");
  return {};
}

/* Queued at season close, by hand, because a season ends when the club says it
   does — not when a timer says so. Members who did not sail get nothing. */
export async function sendSeasonCards(
  from: string,
  to: string,
  label: string
): Promise<ActionResult & { queued?: number }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!from || !to) return { error: "A season needs both dates." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return { error: "Those dates don't parse." };
  /* The shape test above lets "2026-13-45" through, and an Invalid Date
     compares false both ways — so a season with one nonsense date ran
     forwards, and the RPC was handed NaN. */
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return { error: "Those dates don't parse." };
  if (toMs <= fromMs) return { error: "A season runs forwards." };
  if (label.trim().length > TITLE_MAX) return { error: `A season's name runs to ${TITLE_MAX} characters.` };

  /* Both ends came from <input type="date"> and became UTC midnight, and the
     RPC filters `starts_at < p_to`. So a season entered as closing DEC 31
     excluded every episode on Dec 31 — and a member whose only completed
     episode was the closing-night sail got no card at all. A season named
     through a day includes that day. */
  const { data, error } = await supabase.rpc("send_season_cards", {
    p_from: startOfDay(from, CLUB_ZONE),
    p_to: endOfDay(to, CLUB_ZONE),
    p_season: label.trim() || null,
  });
  if (error) {
    if (/staff only/i.test(error.message)) return { error: ERR_STAFF };
    if (/runs forwards/i.test(error.message)) return { error: "A season runs forwards." };
    return { error: ERR_LAND };
  }
  revalidatePath("/bridge/documents");
  return { queued: typeof data === "number" ? data : 0 };
}
