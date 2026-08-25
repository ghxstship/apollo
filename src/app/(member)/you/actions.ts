"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { voiceWith } from "@/lib/errors";
import { duesNote, endDuesAtPeriodEnd, pauseDues, resumeDues } from "@/lib/dues";
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

  if (error) return { error: await voiceWith(supabase, error) };

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
    /* The weekly dispatch went to every active member with no preference
       consulted anywhere — bulk mail with no way off it. It has a switch now,
       and the switch is the unsubscribe the footer has always claimed existed. */
    digest: formData.get("digest") === "on",
  };

  const { error } = await supabase
    .from("profiles")
    .update({ notification_prefs: prefs })
    .eq("id", user.id);

  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/you");
  return { saved: true };
}

/* — Offboarding: pause, resume, depart —

   Standing and dues are two things, and until now only one of them moved. The
   dues half lives in @/lib/dues, which states the rules once; these three
   functions apply the standing, then the dues, then report BOTH — because the
   member needs to know if one happened and the other did not. */
export type StatusResult = { error?: string; note?: string | null };

async function setStatus(status: "active" | "paused" | "departed"): Promise<StatusResult & { userId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* Standing does not move by hand — the profile guard refuses a raw update.
     set_own_standing is the one door, and it only opens for your own row. */
  const { error } = await supabase.rpc("set_own_standing", { p_status: status });
  if (error) return { error: await voiceWith(supabase, error) };
  return { userId: user.id };
}

export async function pauseMembership(): Promise<StatusResult> {
  const res = await setStatus("paused");
  if (res.error || !res.userId) return res;
  /* The standing is already set. If this fails the hold still stands and the
     note says the card did not change — which is the true thing to say. */
  const note = duesNote(await pauseDues(res.userId), "paused");
  revalidatePath("/you");
  revalidatePath("/home");
  revalidatePath("/account");
  return { note };
}

export async function resumeMembership(): Promise<StatusResult> {
  const res = await setStatus("active");
  if (res.error || !res.userId) return res;
  const outcome = await resumeDues(res.userId);
  const note = duesNote(outcome, "resumed");

  /* Revalidating /you re-renders it as an ACTIVE member, which unmounts the
     paused banner — and the banner is what holds the note. Measured: the one
     sentence saying the card was not changed survived 570ms before the flush
     took it off screen.

     So when there is something the member must act on, leave the page alone.
     The standing is already changed in the database; the only cost is that
     this tab shows the old banner until they navigate, and that is a far
     smaller price than never learning their dues did not restart. Good news
     revalidates as before. */
  const mustBeRead = outcome.kind === "not-wired" || outcome.kind === "failed";
  if (!mustBeRead) {
    revalidatePath("/you");
    revalidatePath("/home");
  }
  revalidatePath("/account");
  return { note };
}

export async function departClub(): Promise<StatusResult> {
  const res = await setStatus("departed");
  if (res.error || !res.userId) return res;

  /* Ends at period end — they paid for this month and this month is theirs.
     Done BEFORE the sign-out, because afterwards there is no session to act
     with. */
  const outcome = await endDuesAtPeriodEnd(res.userId);

  if (outcome.kind === "failed" || outcome.kind === "not-wired") {
    /* Their place is closed either way — set_own_standing has already run. But
       the card was NOT stopped, and signing them straight out would leave them
       on a marketing page with no way to learn that and nothing to press. They
       stay signed in, holding the one sentence that matters and the portal
       link on their account page. Departed members can sign in regardless, so
       staying put costs nothing. */
    revalidatePath("/you");
    revalidatePath("/account");
    return { note: duesNote(outcome, "departed") };
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/* Standing filming consent. Withdrawal is a fact with a timestamp — the crew
   sees it on the manifest, and production keeps you out of frame from the next
   port. Turning it back on clears the withdrawal. */
/* Routed through a definer RPC rather than a table update, because this one
   must work while a membership is held — see the migration for why. */
export async function setManifestVisibility(on: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase.rpc("set_manifest_visibility", { p_on: on });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/you");
  revalidatePath("/manifest");
  return {};
}

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
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/you");
  return {};
}
