"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  revalidatePath("/home-port");
  revalidatePath("/passbook");
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

  const { error } = await supabase.from("profiles").update({ status }).eq("id", user.id);
  if (error) return { error: "That didn't land. Try again." };
  return {};
}

export async function pauseMembership(): Promise<StatusResult> {
  const res = await setStatus("paused");
  if (res.error) return res;
  revalidatePath("/you");
  revalidatePath("/home-port");
  return {};
}

export async function resumeMembership(): Promise<StatusResult> {
  const res = await setStatus("active");
  if (res.error) return res;
  revalidatePath("/you");
  revalidatePath("/home-port");
  return {};
}

export async function departClub(): Promise<StatusResult> {
  const res = await setStatus("departed");
  if (res.error) return res;
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
