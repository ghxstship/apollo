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
  if (input.body.trim().length < 20) return { error: "That is too short to be a clause." };

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
  if (body.trim().length < 20) return { error: "That is too short to be a clause." };

  const { data: latest } = await supabase
    .from("clause_versions")
    .select("version")
    .eq("clause_code", clauseCode)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const next = (latest?.version ?? 0) + 1;
  const { error } = await supabase.from("clause_versions").insert({
    clause_code: clauseCode,
    version: next,
    body: body.trim(),
    note: note.trim() || null,
    published_by: staffId,
  });
  if (error) return { error: ERR_LAND };
  return done();
}

/* Start the next version of a document by copying the standing composition.
   Editing from a copy is what makes revision cheap; the published version is
   frozen, so there is nothing to break. */
export async function draftNextVersion(documentCode: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { data: existing } = await supabase
    .from("document_versions")
    .select("id, version, status")
    .eq("document_code", documentCode)
    .order("version", { ascending: false });

  if ((existing ?? []).some((v) => v.status === "draft")) {
    return { error: "There is already a draft open for that document." };
  }

  const standing = (existing ?? []).find((v) => v.status === "published");
  const next = ((existing ?? [])[0]?.version ?? 0) + 1;

  const { data: created, error } = await supabase
    .from("document_versions")
    .insert({ document_code: documentCode, version: next, status: "draft" })
    .select("id")
    .maybeSingle();
  if (error || !created) return { error: ERR_LAND };

  if (standing) {
    const { data: clauses } = await supabase
      .from("document_clauses")
      .select("clause_version_id, position, condition")
      .eq("document_version_id", standing.id);
    if (clauses?.length) {
      await supabase.from("document_clauses").insert(
        clauses.map((c) => ({
          document_version_id: created.id,
          clause_version_id: c.clause_version_id,
          position: c.position,
          condition: c.condition,
        }))
      );
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

  if (!include) {
    const { error } = await supabase
      .from("document_clauses")
      .delete()
      .eq("document_version_id", versionId)
      .eq("clause_version_id", clauseVersionId);
    if (error) return { error: ERR_LAND };
    return done();
  }

  const { error } = await supabase.from("document_clauses").upsert({
    document_version_id: versionId,
    clause_version_id: clauseVersionId,
    position,
    condition,
  });
  if (error) {
    return {
      error: /fixed/i.test(error.message)
        ? "That version is published. Draft the next one to change it."
        : ERR_LAND,
    };
  }
  return done();
}

export async function publishVersion(versionId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { error } = await supabase.rpc("publish_document_version", { p_id: versionId });
  if (error) {
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

  const { error } = await supabase.rpc("redact_signature", { p_id: id });
  if (error) {
    /* The RPC distinguishes these; the operator should see the difference.
       Telling someone a signature that does not exist has "already" been dealt
       with invites them to retry something that can never succeed. */
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

  const { error } = await supabase.rpc("counter_sign", {
    p_signature_id: signatureId,
    p_title: title.trim() || null,
  });
  if (error) {
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
  if (new Date(to) <= new Date(from)) return { error: "A season runs forwards." };

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
  if (error) return { error: ERR_LAND };
  revalidatePath("/bridge/documents");
  return { queued: typeof data === "number" ? data : 0 };
}
