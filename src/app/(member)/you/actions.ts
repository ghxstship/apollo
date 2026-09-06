"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { voiceWith } from "@/lib/errors";
import { duesNote, endDuesAtPeriodEnd, pauseDues, resumeDues } from "@/lib/dues";
import { createClient } from "@/lib/supabase/server";
import { actionStepUp } from "@/lib/supabase/step-up-action";
import { headers } from "next/headers";
import { BIO_MAX, INTERESTS } from "./interests";
import { PREF_CATEGORIES, PREF_CHANNELS } from "./prefs";

export type ProfileFormState = { saved?: boolean; error?: string };

const TONES = new Set(["ink", "sea", "gold", "sand"]);
const NAME_MAX = 80;
const HANDLE_MIN = 2;
const HANDLE_MAX = 32;
const HANDLE_SHAPE = /^[a-z0-9._-]{2,32}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const homeCity = String(formData.get("home_city") ?? "");
  const avatarTone = String(formData.get("avatar_tone") ?? "ink");
  const bio = String(formData.get("bio") ?? "").trim();
  const allowed = new Set<string>(INTERESTS);
  const interests = formData
    .getAll("interests")
    .map(String)
    .filter((i) => allowed.has(i));
  const inDirectory = formData.get("in_directory") === "on";

  /* Not "a name for the manifest": this is the profile, no episode is in view,
     and the place a member can actually SEE this name is their Member Card. */
  if (!fullName) return { error: "A name, at least — it goes on your Member Card." };
  if (fullName.length > NAME_MAX) return { error: `Keep the name under ${NAME_MAX} characters.` };
  /* The handle is a URL segment (/directory/[handle]) and the roster's search
     key, so it is letters, digits, dot, dash and underscore — nothing a path
     or a query could misread. */
  if (handle && !HANDLE_SHAPE.test(handle)) {
    return { error: `A handle is ${HANDLE_MIN} to ${HANDLE_MAX} characters — letters, digits, dots, dashes, underscores.` };
  }
  if (homeCity && !UUID.test(homeCity)) return { error: "Pick a city from the list." };
  if (bio.length > BIO_MAX) return { error: `Keep it under ${BIO_MAX} characters.` };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      handle: handle || null,
      home_city: homeCity || null,
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

/* — Notification preferences, as the database reads them —

   profiles.notification_prefs is a jsonb of category booleans plus a
   `channels` object. The push fan-out asks the category AND channels.push;
   the letters (digest, season card, win-back, the Bridge's word) stop when
   channels.email is false; the texts stop when channels.sms is false. Every
   key missing from the object reads TRUE at every reader, so a member who has
   never touched this page gets everything — which is why the form writes
   every key explicitly rather than only the ones that changed.

   The two lists below are the whole vocabulary. Anything else on the wire is
   dropped, so a form field renamed in the client cannot write a key no reader
   honours and leave the member believing they turned something off. */
export async function saveNotificationPrefs(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* A switch that is checked posts "on"; an unchecked one posts nothing. A
     disabled channel (text, with no verified number) posts its standing value
     from a hidden field so a save does not quietly flip it. */
  const on = (key: string) => formData.get(key) === "on";
  const prefs: Record<string, boolean | Record<string, boolean>> = {};
  for (const c of PREF_CATEGORIES) prefs[c] = on(c);
  const channels: Record<string, boolean> = {};
  for (const ch of PREF_CHANNELS) channels[ch] = on(`channel_${ch}`);
  prefs.channels = channels;

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

/* Every consent switch on this page writes a LINE, not a value.
   consent_records is append-only and keyed to the words the member was shown,
   so "what did they agree to, and when" has an answer — which it did not, for
   any of the three switches here, until 2026-09-06.

   Best effort on purpose. If the ledger write fails, the member's switch still
   moves: refusing to honour somebody turning filming OFF because the audit
   trail would not write is the wrong way round, and a consent the club acted
   on but failed to record is a bookkeeping problem, while a consent the club
   ignored is a broken promise. The failure is not silent either — it lands in
   app_errors, which the Bridge reads. */
async function noteConsent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subject: string,
  granted: boolean,
) {
  const h = await headers();
  await supabase.rpc("record_consent", {
    p_subject: subject,
    p_granted: granted,
    p_source: "member",
    /* The address the edge saw, not the one the caller typed — the same
       reading the pacing gates take. */
    p_ip: h.get("cf-connecting-ip") ?? null,
    p_agent: h.get("user-agent")?.slice(0, 400) ?? null,
    p_note: null,
  });
}

export async function departClub(): Promise<StatusResult> {
  /* Ending a membership is the largest thing this page does, and it sat on the
     seam a server action falls through: neither the proxy's path list nor
     stepUpRefusal() ever reached it. */
  const guard = await createClient();
  const {
    data: { user: whoAsks },
  } = await guard.auth.getUser();
  const stepUp = await actionStepUp(guard, whoAsks);
  if (stepUp) return { error: stepUp.error };

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
  /* No scope argument, which in supabase-js is the GLOBAL scope: every session
     this member holds, on every device, is revoked. That is deliberate and it
     is what the page now says. It read "This device only" until 2026-09-06,
     which was the exact opposite of what ran — and the direction of the error
     mattered, because a member signing out of a borrowed laptop was told the
     phone in their pocket was still signed in when it was not, and a member
     who had lost a device was given no control that would have helped. The
     club has no session list, so this is the only revoke there is; making it
     narrow to match the old sentence would have taken that away. */
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

  const stepUp = await actionStepUp(supabase, user);
  if (stepUp) return { error: stepUp.error };

  const { error } = await supabase.rpc("set_manifest_visibility", { p_on: on });
  if (error) return { error: await voiceWith(supabase, error) };
  await noteConsent(supabase, "manifest", on);
  revalidatePath("/you");
  revalidatePath("/passes");
  return {};
}

export async function setOnCamera(on: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const stepUp = await actionStepUp(supabase, user);
  if (stepUp) return { error: stepUp.error };

  /* The withdrawal timestamp is no longer erased on re-consent.
     This wrote `camera_withdrawn_at: on ? null : now()`, so a member who
     withdrew and later changed their mind had the record of their withdrawal
     DELETED — the single fact the club would most need to be able to show, that
     it stopped filming somebody when they asked, was the one the schema threw
     away. The column stays, because the surfaces that honour a withdrawal at
     the next stop read it, but it is a convenience now and not the record.
     consent_records is the record, it is append-only, and it keeps every
     withdrawal whether or not one was later reversed. */
  const { error } = await supabase
    .from("profiles")
    .update(
      on
        ? { on_camera: true }
        : { on_camera: false, camera_withdrawn_at: new Date().toISOString() },
    )
    .eq("id", user.id);
  if (error) return { error: await voiceWith(supabase, error) };
  await noteConsent(supabase, "filming", on);
  revalidatePath("/you");
  return {};
}
