"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

function done(): ActionResult {
  revalidatePath("/bridge/media");
  revalidatePath("/gallery");
  return {};
}

/* Every id here is a frame's row id off the queue. A malformed one reaches the
   driver as "invalid input syntax for type uuid", which names a Postgres type
   at an operator who never chose one; refused here first. */
const UUID = /^[0-9a-f-]{36}$/;

export async function approveMedia(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: ERR_LAND };
  const { error } = await supabase.from("episode_media").update({ approved: true }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}

export async function unapproveMedia(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: ERR_LAND };
  const { error } = await supabase.from("episode_media").update({ approved: false }).eq("id", id);
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
  if (!UUID.test(id)) return { error: ERR_LAND };

  const { data: frame, error: readError } = await supabase
    .from("episode_media")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  /* A read that fails is not a frame with no file: treated as one, this
     deleted nothing and reported success. And a frame the uploader has already
     withdrawn is not ours to remove twice — say so rather than "Removed." */
  if (readError) return { error: ERR_LAND };
  if (!frame) return { error: "That frame is already off the record." };

  if (frame.storage_path) {
    const { error: fileError } = await supabase.storage
      .from("episode-media")
      .remove([frame.storage_path]);
    /* A file that was never uploaded is not a reason to keep the row. */
    if (fileError && !/not found/i.test(fileError.message)) return { error: ERR_LAND };
  }

  const { error } = await supabase.from("episode_media").delete().eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}
