"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

function done(): ActionResult {
  revalidatePath("/bridge/media");
  revalidatePath("/gallery");
  return {};
}

export async function approveMedia(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("voyage_media").update({ approved: true }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}

export async function unapproveMedia(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("voyage_media").update({ approved: false }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}

/* Removal takes the frame out of the record AND out of the bucket. There is no
   "bucket's own housekeeping" — there never was — and a frame pulled for consent
   that stays fetchable is the whole thing this screen exists to prevent. The
   file goes first: if that fails there is nothing to clean up after, and if the
   row delete fails afterwards the trigger records the path for a sweep. */
export async function removeMedia(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { data: frame } = await supabase
    .from("voyage_media")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  if (frame?.storage_path) {
    const { error: fileError } = await supabase.storage
      .from("voyage-media")
      .remove([frame.storage_path]);
    /* A file that was never uploaded is not a reason to keep the row. */
    if (fileError && !/not found/i.test(fileError.message)) return { error: ERR_LAND };
  }

  const { error } = await supabase.from("voyage_media").delete().eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}
