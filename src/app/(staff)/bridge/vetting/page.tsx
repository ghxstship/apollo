import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { logDate, logTime } from "@/lib/format";
import { memberMark } from "@/lib/membership";
import { moduleTables } from "@/lib/module-tables";
import type { BackgroundState } from "@/lib/vetting";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { VettingClient, type FileRow } from "./vetting-client";

export const metadata: Metadata = { title: "Vetting" };

interface VettingFile {
  id: string;
  profile_id: string | null;
  id_verified_at: string | null;
  id_purge_due: string | null;
  age_ok: boolean;
  background_state: BackgroundState;
  cleared_until: string | null;
  interview_at: string | null;
  fast_track: boolean;
}

interface SheetRow {
  profile_id: string;
  completed_at: string | null;
}

/* An ISO instant as the wall clock of a named zone, in the exact shape
   <input type="datetime-local"> wants. toISOString().slice(0,16) — the obvious
   version — prints UTC, so a 14:30 Eastern call came back into the field as
   18:30 and saving it without touching the field moved the appointment four
   hours later every time. */
function wallClockField(iso: string | null, zone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

export default async function VettingOpsPage() {
  const { supabase } = await getOperator();
  const db = moduleTables(supabase);

  const [filesRes, profilesRes] = await Promise.all([
    db
      .from("vetting_files")
      .select("id, profile_id, id_verified_at, id_purge_due, age_ok, background_state, cleared_until, interview_at, fast_track")
      .order("updated_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, member_no, status")
      .order("full_name", { ascending: true }),
  ]);

  const files = must(filesRes as { data: VettingFile[] | null; error: null });
  const profiles = must(profilesRes);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  /* The Preference Sheet is the member's own and is not written here — it is
     read so the crew can see which of the six gates is actually the one
     holding a member up. Two of the six are the member's to close, and telling
     a caller "your sheet is still open" is the difference between a useful
     answer and "the vetting team has it". */
  const profileIds = files.map((f) => f.profile_id).filter((v): v is string => !!v);
  const sheetsRes = profileIds.length
    ? await db.from("preference_sheets").select("profile_id, completed_at").in("profile_id", profileIds)
    : { data: [] as SheetRow[], error: null };
  const sheetComplete = new Set(
    (must(sheetsRes as { data: SheetRow[] | null; error: null }))
      .filter((s) => s.completed_at)
      .map((s) => s.profile_id)
  );

  const rows: FileRow[] = files
    .filter((f) => f.profile_id)
    .map((f) => {
      const p = byId.get(f.profile_id as string);
      return {
        id: f.id,
        profileId: f.profile_id as string,
        name: p?.full_name ?? "Unknown member",
        memberNo: memberMark(p?.member_no) || "NO NUMBER",
        state: f.background_state,
        idVerified: !!f.id_verified_at,
        ageOk: f.age_ok,
        fastTrack: f.fast_track,
        clearedUntil: f.cleared_until ? logDate(f.cleared_until, CLUB_ZONE) : null,
        interviewAt: f.interview_at
          ? `${logDate(f.interview_at, CLUB_ZONE)} ${logTime(f.interview_at, CLUB_ZONE)}`
          : null,
        interviewLocal: wallClockField(f.interview_at, CLUB_ZONE),
        purgeDue: f.id_purge_due,
        sheetComplete: sheetComplete.has(f.profile_id as string),
      };
    });

  const filed = new Set(rows.map((r) => r.profileId));
  const unfiled = profiles
    .filter((p) => !filed.has(p.id))
    .map((p) => ({
      value: p.id,
      label: `${p.full_name ?? "Unnamed"}${p.member_no ? ` — ${memberMark(p.member_no)}` : ""}`,
    }));

  return (
    <div>
      <span className="hm-eyebrow">Vetting</span>
      <h1 className="hm-h1">The files.</h1>
      <p className="hm-lede">
        Identity, age, and the background state. Four of the six gates a member
        reads on their own page turn here and nowhere else, and no ratio-gated
        sailing will seat a member whose file is not open and cleared.
      </p>
      <p className="hm-note">
        A member never sees a count, a queue position or anything about anybody
        else — only their own six gates and the one line their state carries.
        Ages 25 to 45, with no exceptions, and a decline is final and
        unexplained.
      </p>
      <VettingClient rows={rows} unfiled={unfiled} />
    </div>
  );
}
