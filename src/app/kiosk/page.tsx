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

  const { data: me } = await supabase
    .from("profiles")
    .select("is_staff")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_staff) redirect("/home");

  /* The same board the gangway console and the check-in action work from:
     today's departures stay for 24 hours, upcoming line up after. */
  const cutoff = new Date(new Date().getTime() - 24 * 3600 * 1000).toISOString();
  const { data: voyages } = await supabase
    .from("voyages")
    .select("id")
    .gte("starts_at", cutoff)
    .in("status", ["scheduled", "live", "weather_hold"]);
  const voyageIds = (voyages ?? []).map((v) => v.id);

  let passes: KioskPass[] = [];
  if (voyageIds.length) {
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("id, voyage_id, profile_id, boarding_code, checked_in_at")
      .in("voyage_id", voyageIds)
      .eq("status", "aboard")
      .not("boarding_code", "is", null);

    const profileIds = [...new Set((rsvps ?? []).map((r) => r.profile_id))];
    const [profilesRes, waiverRes] = profileIds.length
      ? await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", profileIds),
          /* Waiver standing from the signature record, never a profile flag —
             the same single source the gangway roster reads. */
          supabase
            .from("member_waiver_standing")
            .select("profile_id, current")
            .in("profile_id", profileIds),
        ])
      : [{ data: [] }, { data: [] }];
    const nameOf = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name ?? "Sailor"]));
    const waiverCurrent = new Map(
      (waiverRes.data ?? []).map((w) => [w.profile_id, Boolean(w.current)])
    );

    passes = (rsvps ?? []).map((r) => ({
      rsvpId: r.id,
      voyageId: r.voyage_id,
      code: r.boarding_code ?? "",
      name: nameOf.get(r.profile_id) ?? "Sailor",
      waiverSigned: waiverCurrent.get(r.profile_id) ?? false,
      checkedInAt: r.checked_in_at,
    }));
  }

  return <KioskClient passes={passes} />;
}
