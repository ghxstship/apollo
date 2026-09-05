"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("profile_id", user.id)
    .eq("read", false);
  revalidatePath("/inbox");
  revalidatePath("/home");
}

/* Archive: every notice this member has read goes, and the unread stay. The
   inbox had no way to shrink — 7,700 rows on the fixture personas alone — so
   a member two seasons in scrolled a lifetime. The policy admits only own,
   read rows; the nightly purge takes the same rows once they are old. */
export async function archiveRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").delete().eq("profile_id", user.id).eq("read", true);
  revalidatePath("/inbox");
  revalidatePath("/home");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* One notice, read, as the member taps through to where it points. The
   destination is already on its way in the browser by the time this lands, so
   nothing here is on the path to the page; a refusal is silent by design — an
   unread dot that survives one tap is a smaller wrong than a navigation that
   waits on a write. */
export async function markRead(id: string): Promise<void> {
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("profile_id", user.id)
    .eq("read", false);
  revalidatePath("/inbox");
  revalidatePath("/home");
}
