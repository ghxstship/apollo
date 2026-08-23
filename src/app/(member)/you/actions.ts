"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { voice } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { BIO_MAX, INTERESTS } from "./interests";

export type ProfileFormState = { saved?: boolean; error?: string };

const TONES = new Set(["ink", "sea", "gold", "sand"]);

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
  const bio = String(formData.get("bio") ?? "").trim();
  const allowed = new Set<string>(INTERESTS);
  const interests = formData
    .getAll("interests")
    .map(String)
    .filter((i) => allowed.has(i));
  const inDirectory = formData.get("in_directory") === "on";

  if (!fullName) return { error: "A name for the manifest, at least." };
  if (bio.length > BIO_MAX) return { error: `Keep it under ${BIO_MAX} characters.` };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      handle: handle || null,
      home_harbor: homeHarbor || null,
      avatar_tone: TONES.has(avatarTone) ? avatarTone : "ink",
      bio: bio || null,
      interests,
      in_directory: inDirectory,
    })
    .eq("id", user.id);

  if (error) return { error: "That didn't land. Try again." };

  revalidatePath("/you");
  revalidatePath("/home");
  revalidatePath("/card");
  revalidatePath("/directory");
  return { saved: true };
}

/* — Notification preferences: {weather, berths, fathoms} on the profile — */
export async function saveNotificationPrefs(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const prefs = {
    weather: formData.get("weather") === "on",
    berths: formData.get("berths") === "on",
    fathoms: formData.get("fathoms") === "on",
  };

  const { error } = await supabase
    .from("profiles")
    .update({ notification_prefs: prefs })
    .eq("id", user.id);

  if (error) return { error: "That didn't land. Try again." };

  revalidatePath("/you");
  return { saved: true };
}

/* — Offboarding: pause, resume, depart — */
export type StatusResult = { error?: string };

async function setStatus(status: "active" | "paused" | "departed"): Promise<StatusResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* Standing does not move by hand — the profile guard refuses a raw update.
     set_own_standing is the one door, and it only opens for your own row. */
  const { error } = await supabase.rpc("set_own_standing", { p_status: status });
  if (error) return { error: voice(error) };
  return {};
}

export async function pauseMembership(): Promise<StatusResult> {
  const res = await setStatus("paused");
  if (res.error) return res;
  revalidatePath("/you");
  revalidatePath("/home");
  return {};
}

export async function resumeMembership(): Promise<StatusResult> {
  const res = await setStatus("active");
  if (res.error) return res;
  revalidatePath("/you");
  revalidatePath("/home");
  return {};
}

export async function departClub(): Promise<StatusResult> {
  const res = await setStatus("departed");
  if (res.error) return res;
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/* Standing filming consent. Withdrawal is a fact with a timestamp — the crew
   sees it on the manifest, and production keeps you out of frame from the next
   port. Turning it back on clears the withdrawal. */
export async function setOnCamera(on: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase
    .from("profiles")
    .update({
      on_camera: on,
      camera_withdrawn_at: on ? null : new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: "That didn't land. Try again." };
  revalidatePath("/you");
  return {};
}
