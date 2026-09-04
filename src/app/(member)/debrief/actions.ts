"use server";

import { revalidatePath } from "next/cache";
import { HOLD_MESSAGE, isRlsRefusal, voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type DebriefResult = { error?: string; sent?: boolean };

/* One question to the Bridge after a night, never a score.

   debriefs' INSERT policy carries the whole rule: the row is the member's own
   and they held an aboard pass on that episode. The unique (episode, member)
   index carries the other one — a night is answered once. Both refusals are
   read here and put into words, because a policy's "no" reaches a member as
   a sentence about row-level security otherwise. */
export async function sendDebrief(_prev: DebriefResult, formData: FormData): Promise<DebriefResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const episodeId = String(formData.get("episode") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000) || null;
  const againRaw = String(formData.get("again") ?? "");
  const again = againRaw === "yes" ? true : againRaw === "no" ? false : null;

  if (!/^[0-9a-f-]{36}$/i.test(episodeId)) {
    return { error: "This page has lost the episode. Reload it, then send again." };
  }
  if (!note && again === null) {
    return { error: "Say one thing, or answer the one question. Either is enough." };
  }

  const { error } = await supabase
    .from("debriefs")
    .insert({ episode_id: episodeId, profile_id: user.id, note, again });

  if (error) {
    if (error.code === "23505") {
      return { error: "You have already answered for this night. One debrief an episode." };
    }
    if (isRlsRefusal(error)) {
      const said = await voiceWith(supabase, error);
      return {
        error:
          said === HOLD_MESSAGE
            ? said
            : "The debrief is for the crew who were aboard. This one was not your night.",
      };
    }
    return { error: await voiceWith(supabase, error) };
  }

  if (/^[a-z0-9-]+$/i.test(slug)) revalidatePath(`/debrief/${slug}`);
  return { sent: true };
}
