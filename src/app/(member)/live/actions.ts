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

  const clean = (Array.isArray(lines) ? lines : [])
    .map((l) => ({ itemId: String(l.itemId), qty: Math.round(Number(l.qty)) }))
    .filter((l) => l.itemId && l.qty > 0);
  if (clean.length === 0) return { error: "Nothing in the order yet." };
  /* Over the ceiling is refused, not trimmed — a tab that quietly lost a line
     is a member arguing with the galley over a drink they were never charged
     for. */
  if (clean.some((l) => l.qty > 12)) return { error: "Twelve of a thing is the ceiling per order." };
  if (clean.length > 40) return { error: "That is more than one order. Send it in two." };
  if (!/^[0-9a-f-]{36}$/i.test(episodeId)) {
    return { error: "This page has lost the episode. Reload it, then order again." };
  }
  if (typeof idemKey !== "string" || idemKey.length === 0 || idemKey.length > 64) {
    return { error: "That didn't land. Try again." };
  }

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
  /* A missing or malformed episode id and a missing file are two different
     failures and used to share one sentence. "Pick a frame first" told a member
     who HAD picked a frame that they had not — the confidently wrong message
     the errors module exists to prevent, and worse here because the member
     re-picks the same frame and is refused again for the same invisible reason.
     The id test subsumes the empty case, so the two checks stay two lines. */
  if (!/^[0-9a-f-]{36}$/i.test(episodeId))
    return { error: "This page has lost the episode. Reload it, then send the frame again." };
  if (!(file instanceof File) || file.size === 0)
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
        ? "Frames are for the crew on the episode — board first, then send it."
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

/* Take your own frame back.

   The permission for this has existed since August — the RLS policy "the
   uploader withdraws their own frame" grants DELETE where uploaded_by is the
   caller — and until now NOTHING CALLED IT. The only path that removed a frame
   was the Bridge's, which is staff-only, so the honest answer to "can I take
   that down" was: write to Shoreside and wait. The hardest half of the problem
   was already solved at the database line and the easy half was missing.

   The file goes before the row, in that order and deliberately. A row without
   its file is a broken thumbnail somebody can still find in a listing; a file
   without its row is unreachable through the app and is swept by the
   orphaned_media trigger. If this is going to fail halfway, it should fail on
   the side where the picture is already gone. */
export async function withdrawFrame(id: string): Promise<GalleyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* Read through RLS rather than trusting the id: a member who did not upload
     this frame cannot see it here, so the refusal below is the same one they
     would get from the delete, one round trip earlier. */
  const { data: frame } = await supabase
    .from("episode_media")
    .select("storage_path, uploaded_by")
    .eq("id", id)
    .maybeSingle();

  if (!frame || frame.uploaded_by !== user.id) {
    return { error: "That frame is not yours to take down. Shoreside can help." };
  }

  if (frame.storage_path) {
    const { error: fileError } = await supabase.storage
      .from("episode-media")
      .remove([frame.storage_path]);
    /* A file that is already gone is not a reason to keep the row. */
    if (fileError && !/not found/i.test(fileError.message)) {
      return { error: "The frame didn't come down. Try again; if it holds, hail Shoreside." };
    }
  }

  const { error } = await supabase.from("episode_media").delete().eq("id", id);
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/live");
  revalidatePath("/gallery");
  return {};
}
