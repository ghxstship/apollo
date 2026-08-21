import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KioskClient } from "./kiosk-client";
import "./kiosk.css";

export const metadata: Metadata = {
  title: "Gangway kiosk",
  robots: { index: false, follow: false },
};

/* The gangway kiosk — a crew device propped at the dock. Scan, confirm, help;
   nothing else on screen, every target 48px or better. Staff-gated: the device
   is signed in once by crew and left facing the queue. */
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

  return <KioskClient />;
}
