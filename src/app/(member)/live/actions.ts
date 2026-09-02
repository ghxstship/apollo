"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type GalleyLine = { itemId: string; qty: number };
export type GalleyResult = { error?: string };

/* Member self-order, through place_galley_order.

   This used to insert into galley_orders directly, with the total computed
   here from a price map read a moment earlier. Two things were wrong with it.
   The smaller one is that a member was stating a price — the rule everywhere
   else in this codebase is that they never do. The larger one is that it had
   not worked in some time: galley_orders' INSERT policy is `is_staff()`, so
   every member order was refused by RLS and the member was told "That didn't
   land. Try again." The policy was tightened to force orders through the
   definer and this caller was never moved across.

   The RPC prices the tab from the catalogue, refuses a member who is not
   aboard that episode, and refuses a membership on hold — each in its own
   words, which now reach the member instead of a generic line. */
export async function placeGalleyOrder(
  episodeId: string,
  lines: GalleyLine[],
  /* The offline queue re-sends this unchanged. A request that reached the
     galley and was charged, but whose response the boat wifi swallowed, used to
     come back as a second order and a second charge — the exact failure the
     offline queue exists to survive. */
  idemKey: string
): Promise<GalleyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const clean = lines
    .map((l) => ({ itemId: String(l.itemId), qty: Math.round(Number(l.qty)) }))
    .filter((l) => l.itemId && l.qty > 0 && l.qty <= 12);
  if (clean.length === 0) return { error: "Nothing in the order yet." };

  const { error } = await supabase.rpc("place_galley_order", {
    p_episode: episodeId,
    /* "itemId", camelCase — that is the key jsonb_to_recordset destructures
       inside the RPC, and there is a whole migration named after getting this
       wrong on the shop's twin. */
    p_lines: clean.map((l) => ({ itemId: l.itemId, qty: l.qty })),
    p_idem_key: idemKey,
  });
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/live");
  return {};
}

/* A frame from the water, into the Bridge's queue.

   The policies invited this write from the start — storage's "aboard members
   upload episode media" (path must open with the member's own id) and
   episode_media's "aboard members upload" (own row, aboard that episode,
   approved false) — and no product surface ever called them: the gallery's
   member half was fed by staff uploads alone. The file goes first; a row
   that fails after leaves nothing fetchable, and the object is removed so
   the bucket holds no frame the record doesn't know about. */
export async function uploadFrame(formData: FormData): Promise<GalleyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const episodeId = String(formData.get("episode_id") ?? "");
  const caption = String(formData.get("caption") ?? "").trim().slice(0, 200) || null;
  const file = formData.get("frame");
  if (!episodeId || !(file instanceof File) || file.size === 0)
    return { error: "Pick a frame first." };
  if (!/^[0-9a-f-]{36}$/i.test(episodeId))
    return { error: "Pick a frame first." };
  /* An allowlist, not a prefix: image/svg+xml passes startsWith("image/") and
     is scriptable content served from the storage origin. */
  if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type))
    return { error: "Frames are photographs — JPEG, PNG, WebP or HEIC." };
  if (file.size > 12 * 1024 * 1024)
    return { error: "That frame is over 12MB — send a smaller cut." };

  const ext = (file.type.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg";
  const path = `${user.id}/${episodeId}/${crypto.randomUUID()}.${ext}`;

  const { error: fileError } = await supabase.storage
    .from("episode-media")
    .upload(path, file, { contentType: file.type });
  if (fileError)
    return {
      error: /policy|security/i.test(fileError.message)
        ? "Frames are for the crew on the water — board first, then send it."
        : "The frame didn't land. Try again; if it holds, hail Shoreside.",
    };

  const { error } = await supabase
    .from("episode_media")
    .insert({ episode_id: episodeId, storage_path: path, caption, uploaded_by: user.id });
  if (error) {
    await supabase.storage.from("episode-media").remove([path]);
    return { error: await voiceWith(supabase, error) };
  }

  revalidatePath("/live");
  revalidatePath("/gallery");
  return {};
}
