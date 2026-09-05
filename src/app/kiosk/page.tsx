import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KioskClient, type KioskPass } from "./kiosk-client";
import "./kiosk.css";

export const metadata: Metadata = {
  title: "Gangway kiosk",
  robots: { index: false, follow: false },
};

/* The gangway kiosk — a crew device propped at the dock. Scan, confirm, help;
   nothing else on screen, every target 48px or better. Staff-gated: the device
   is signed in once by crew and left facing the queue.

   The page also hands the client a minimal manifest — code, name, waiver
   standing, boarded-or-not — for every pass on the upcoming boards, exactly
   the fallback the gangway console keeps as its cached roster. It is what lets
   a kiosk that loses signal keep admitting people instead of refusing
   everyone. Held in memory only, never written to device storage: a dockside
   kiosk is the most walk-up-able device the club owns, and the queue it feeds
   (the gangway queue) is already the one thing sign-out is careful with. */
export default async function KioskPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/gangway");

  /* Staff, or the holder of a live door grant — the hired crew member who has
     one episode's gangway for one night. is_door() answers for both. RLS then
     hands a door exactly its own episode's passes below, so the manifest this
     page carries is already the right one for whoever propped the device. */
  const { data: door } = await supabase.rpc("is_door");
  if (door !== true) redirect("/home");
  const { data: me } = await supabase
    .from("profiles")
    .select("is_staff")
    .eq("id", user.id)
    .maybeSingle();
  const staff = Boolean(me?.is_staff);

  /* The same board the gangway console and the check-in action work from:
     today's departures stay for 24 hours, upcoming line up after. */
  const cutoff = new Date(new Date().getTime() - 24 * 3600 * 1000).toISOString();
  const { data: episodes } = await supabase
    .from("episodes")
    .select("id")
    .gte("starts_at", cutoff)
    .in("status", ["scheduled", "live", "weather_hold"]);
  const episodeIds = (episodes ?? []).map((v) => v.id);

  let passes: KioskPass[] = [];
  if (episodeIds.length) {
    const { data: passRows } = await supabase
      .from("passes")
      .select("id, episode_id, profile_id, boarding_code, checked_in_at")
      .in("episode_id", episodeIds)
      .eq("status", "aboard")
      .not("boarding_code", "is", null);

    const profileIds = [...new Set((passRows ?? []).map((r) => r.profile_id))];
    /* Names and waiver standing, the same way the gangway roster reads them.
       A door is not staff: profiles is own-or-staff, so it reads the directory
       view for names, and the waiver view (security_invoker over signatures)
       cannot answer for it at all — so standing is UNKNOWN for a door, never
       false, and the offline path holds rather than refuses. The database
       still refuses an unsigned member at the stamp. */
    const [profilesRes, waiverRes] = profileIds.length
      ? await Promise.all([
          staff
            ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
            : Promise.all(episodeIds.map((id) => supabase.rpc("door_manifest", { p_episode: id }))).then((rs) => ({
                data: rs.flatMap((r) => (r.data ?? []).map((d) => ({ id: d.profile_id, full_name: d.full_name, waiver: d.waiver_current }))),
              })),
          staff
            ? supabase
                .from("member_waiver_standing")
                .select("profile_id, current")
                .in("profile_id", profileIds)
            : Promise.resolve({ data: [] as Array<{ profile_id: string | null; current: boolean | null }> }),
        ])
      : [{ data: [] }, { data: [] }];
    const nameOf = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name ?? "Sailor"]));
    const waiverCurrent = new Map<string | null, boolean>(
      (waiverRes.data ?? []).map((w) => [w.profile_id, Boolean(w.current)])
    );
    /* door_manifest carries the waiver state a door could not otherwise read. */
    for (const p of profilesRes.data ?? []) {
      if ("waiver" in p && typeof p.waiver === "boolean") waiverCurrent.set(p.id, p.waiver);
    }

    passes = (passRows ?? []).map((r) => ({
      passId: r.id,
      episodeId: r.episode_id,
      code: r.boarding_code ?? "",
      name: nameOf.get(r.profile_id) ?? "Sailor",
      waiverSigned: waiverCurrent.has(r.profile_id) ? (waiverCurrent.get(r.profile_id) ?? false) : staff ? false : null,
      checkedInAt: r.checked_in_at,
    }));
  }

  return <KioskClient passes={passes} />;
}
