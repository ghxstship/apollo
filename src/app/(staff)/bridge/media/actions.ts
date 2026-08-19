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

/* Removal takes the frame out of the record. The stored file is left to the
   bucket's own housekeeping — nothing renders it once the row is gone. */
export async function removeMedia(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("voyage_media").delete().eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}
