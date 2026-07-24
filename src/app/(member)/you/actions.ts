"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = { saved?: boolean; error?: string };

const TONES = new Set(["ink", "sea", "brass", "sand"]);

export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim();
  const homeHarbor = String(formData.get("home_harbor") ?? "");
  const avatarTone = String(formData.get("avatar_tone") ?? "ink");

  if (!fullName) return { error: "A name for the manifest, at least." };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      handle: handle || null,
      home_harbor: homeHarbor || null,
      avatar_tone: TONES.has(avatarTone) ? avatarTone : "ink",
    })
    .eq("id", user.id);

  if (error) return { error: "That didn't land. Try again." };

  revalidatePath("/you");
  revalidatePath("/harbor");
  revalidatePath("/card");
  return { saved: true };
}
