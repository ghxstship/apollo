"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../staff";

function done(): ActionResult {
  revalidatePath("/bridge");
  return {};
}

export async function moveToReview(applicationId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.rpc("set_application_status", {
    p_id: applicationId,
    p_status: "review",
  });
  if (error) return { error: ERR_LAND };
  return done();
}

export async function salonInvite(applicationId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.rpc("set_application_status", {
    p_id: applicationId,
    p_status: "invited",
  });
  if (error) return { error: ERR_LAND };
  return done();
}

export async function declineApplication(applicationId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.rpc("set_application_status", {
    p_id: applicationId,
    p_status: "declined",
  });
  if (error) return { error: ERR_LAND };
  return done();
}

/* Accept aboard — the RPC writes the member roll entry, queues the welcome
   email, and banks referral knots. Confirm-first in the UI. */
export async function acceptApplication(applicationId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.rpc("accept_application", { p_id: applicationId });
  if (error) return { error: ERR_LAND };
  return done();
}
