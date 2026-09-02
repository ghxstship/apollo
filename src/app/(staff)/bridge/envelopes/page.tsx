import type { Metadata } from "next";
import { logDate, logTime } from "@/lib/format";
import { memberMark } from "@/lib/membership";
import { moduleTables } from "@/lib/module-tables";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { EnvelopesClient, VoyagePicker, type EnvelopeRow } from "./envelopes-client";
import { StateBlock } from "@/components/ds";

export const metadata: Metadata = { title: "Envelopes" };

interface EnvelopeRecord {
  rsvp_id: string;
  token: string;
  opened_at: string | null;
}

export default async function EnvelopesPage({
  searchParams,
}: {
  searchParams: Promise<{ voyage?: string }>;
}) {
  const { supabase } = await getOperator();
  const db = moduleTables(supabase);
  const sp = await searchParams;

  /* The window that matters: an episode about to run, and one that just did —
     the log stays open for twenty-four hours after 19:00, so yesterday's
     envelopes are still live and still worth reprinting for a guest who lost
     their card. */
  const cutoff = new Date(new Date().getTime() - 3 * 24 * 3600 * 1000).toISOString();
  const voyagesRes = await supabase
    .from("voyages")
    .select("id, title, starts_at, time_zone, status")
    .gte("starts_at", cutoff)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  const voyages = must(voyagesRes);

  if (voyages.length === 0) {
    return (
      <div>
        <span className="hm-eyebrow">Envelopes</span>
        <h1 className="hm-h1">The sealed envelope.</h1>
        <div className="hm-sec">
          <StateBlock
            status="empty"
            icon="Mail"
            title="Nothing on the water."
            detail="An envelope is minted against an aboard pass on an episode. When there is one, its sheet shows here."
          />
        </div>
      </div>
    );
  }

  const voyage = voyages.find((v) => v.id === sp.voyage) ?? voyages[0];

  const passesRes = await supabase
    .from("rsvps")
    .select("id, profile_id, boarding_code, status")
    .eq("voyage_id", voyage.id)
    .eq("status", "aboard")
    .order("created_at", { ascending: true });
  const passes = must(passesRes);
  const rsvpIds = passes.map((p) => p.id);

  const [envelopesRes, profilesRes, clockRes] = await Promise.all([
    rsvpIds.length
      ? db.from("captains_log_envelopes").select("rsvp_id, token, opened_at").in("rsvp_id", rsvpIds)
      : Promise.resolve({ data: [] as EnvelopeRecord[], error: null }),
    passes.length
      ? supabase.from("profiles").select("id, full_name, member_no").in("id", passes.map((p) => p.profile_id))
      : Promise.resolve({ data: [], error: null }),
    db.from("voyage_radar").select("voyage_id").eq("voyage_id", voyage.id).maybeSingle(),
  ]);

  const envelopes = new Map(
    (must(envelopesRes as { data: EnvelopeRecord[] | null; error: null })).map((e) => [e.rsvp_id, e])
  );
  const people = new Map((must(profilesRes)).map((p) => [p.id, p]));

  /* clockRes was consumed as !!clockRes.data with no check, alone on a page
     where every other read goes through must(). A failed read is not an absent
     clock, and it rendered as the confident falsehood "Radar has never been
     opened on this episode, so a printed token opens nothing." It is a
     maybeSingle, so must() (which expects a list) does not fit; the error is
     raised directly instead. */
  if (clockRes.error) throw new Error(`the radar clock could not be read: ${clockRes.error.message}`);
  const radarOpen = !!clockRes.data;

  const rows: EnvelopeRow[] = passes
    .map((p) => {
      const env = envelopes.get(p.id);
      if (!env) return null;
      const person = people.get(p.profile_id);
      return {
        rsvpId: p.id,
        name: person?.full_name ?? "A guest",
        memberNo: memberMark(person?.member_no) || "GUEST",
        boardingCode: p.boarding_code ?? "",
        token: env.token,
        opened: env.opened_at
          ? `${logDate(env.opened_at, voyage.time_zone)} ${logTime(env.opened_at, voyage.time_zone)}`
          : null,
      } satisfies EnvelopeRow;
    })
    .filter((r): r is EnvelopeRow => r !== null);

  return (
    <div>
      <span className="hm-eyebrow">Envelopes</span>
      <h1 className="hm-h1">The sealed envelope.</h1>
      <p className="hm-lede">
        One gold-foil card per aboard pass, carrying one token. The guest types
        it off the card to open their Captain&apos;s Log at 19:00, and it is the
        only way in — so an episode whose envelopes were never printed is an
        episode whose anchors nobody can reach.
      </p>

      <div className="hm-sec">
        <VoyagePicker
          options={voyages.map((v) => ({
            value: v.id,
            label: `${logDate(v.starts_at, v.time_zone)} · ${logTime(v.starts_at, v.time_zone)} — ${v.title}`,
          }))}
          value={voyage.id}
        />
      </div>

      <EnvelopesClient
        voyageId={voyage.id}
        voyageTitle={voyage.title}
        departs={`${logDate(voyage.starts_at, voyage.time_zone)} · ${logTime(voyage.starts_at, voyage.time_zone)}`}
        aboard={passes.length}
        radarOpen={radarOpen}
        rows={rows}
      />
    </div>
  );
}
