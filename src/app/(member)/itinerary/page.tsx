import type { Metadata } from "next";
import Link from "next/link";
import { getMember } from "../data";
import { logDate, logDateTime, logTime } from "@/lib/format";
import { SURFACES } from "@/lib/brand";
import { moduleTables } from "@/lib/module-tables";
import { CabinPlan, type CabinRow } from "./cabin-plan";
import {
  CHARTER_STATES,
  SIDE_LABEL,
  readCabin,
  readCabinPlaces,
  readLegs,
  readMyOption,
  readStops,
  type EpisodeLeg,
} from "./data";
import "./charter.css";

export const metadata: Metadata = { title: "Itinerary" };

/* The itinerary and cabin card for the episode you are booked on, as the kit
   prints it.

   The manifest is deliberately absent from this page. The charter kit draws one
   with surnames and three aboard states, and apollo already has it twice over:
   episode_manifest() for members and the Bridge's roster for crew, both of which
   honour a member's right to be off it — a right the kit's manifest does not
   have. Rebuilding the kit's version here would be a third manifest and the
   only one of the three that ignores the opt-out. */

export default async function ItineraryPage() {
  const { supabase, user, zone } = await getMember();
  const db = moduleTables(supabase);

  /* The episode in front of you. One at a time, because the itinerary
     one-pager, the cabin card and the port guide are all artefacts OF an
     episode — a list of them is a manifest, which is a different page. */
  /* `episodes!inner(...)` was ambiguous and the whole module went dark.
     radar_picks arrived carrying picker_rsvp → passes, picked_rsvp → passes AND
     episode_id → episodes, which manufactures two more passes↔episodes paths
     alongside the real one. PostgREST refuses an embed it cannot resolve —
     PGRST201, "more than one relationship was found" — so this returned
     nothing and the page fell to its "No episode ahead" empty state for every
     member with a booking. Naming the constraint pins it to the pass's own
     episode and no future foreign key can make it ambiguous again.

     `error` is destructured now too. It was not, so a refused query was
     indistinguishable from an empty result: nothing reached the browser, the
     console, the server log, or the member. Silent is worse than ugly. */
  const { data: booked, error: bookedError } = await db
    .from("passes")
    .select("id,episode_id,cabin_id,boarding_code,status,episodes!rsvps_voyage_id_fkey!inner(id,slug,title,starts_at,ends_at,status,time_zone,muster,distance_nm)")
    .eq("profile_id", user.id)
    .eq("status", "aboard")
    .gte("episodes.starts_at", new Date().toISOString())
    .order("starts_at", { foreignTable: "episodes", ascending: true })
    .limit(1);

  /* A refused query is not an empty manifest, and must never render as one. */
  if (bookedError) throw new Error(`the episode could not be read: ${bookedError.message}`);

  /* PostgREST types an embedded relation as an array even when the join is
     to-one, which `!inner` on a single foreign key always is. Through unknown,
     because the two shapes genuinely do not overlap and pretending they do is
     how a real mismatch would slip past later. */
  const row = (booked ?? [])[0] as unknown as
    | {
        id: string;
        episode_id: string;
        cabin_id: string | null;
        boarding_code: string | null;
        episodes: {
          id: string; slug: string; title: string; starts_at: string;
          ends_at: string | null; status: string; time_zone: string;
          muster: string | null; distance_nm: number | null;
        };
      }
    | undefined;

  if (!row) {
    return (
      <div className="cht">
        <span className="mbr-eyebrow">{SURFACES.episode} · [un] Limited</span>
        <h1 className="mbr-h1">Itinerary.</h1>
        <p className="cht-empty">
          No episode ahead. The itinerary, the cabin card and the port guide are
          artefacts of an episode you are booked on — claim a pass on the{" "}
          <Link href="/passes">Passes</Link> page and this fills in.
        </p>
        <States />
      </div>
    );
  }

  const v = row.episodes;
  const [legs, stops, places, option, cabin] = await Promise.all([
    readLegs(supabase, v.id),
    readStops(supabase, v.id),
    readCabinPlaces(supabase, v.id),
    readMyOption(supabase, v.id),
    row.cabin_id ? readCabin(supabase, row.cabin_id) : Promise.resolve(null),
  ]);

  const cabinRows: CabinRow[] = places.map((p) => ({
    id: p.cabin_id,
    name: p.name,
    places: p.berths,
    taken: p.taken,
    mine: p.mine,
  }));

  return (
    <div className="cht">
      <span className="mbr-eyebrow">
        {SURFACES.episode} · {logDate(v.starts_at, v.time_zone)}
        {v.distance_nm ? ` · ${v.distance_nm} nm` : ""}
      </span>
      {/* The episode title was the h1, so the page never said its own name.
          The name is the h1 now and the title leads the standfirst, where it
          reads as what this is the itinerary FOR. */}
      <h1 className="mbr-h1">Itinerary.</h1>
      <p className="cht-lede">
        {v.title}. Every time below is local and 24-hour. Legs are intentions;
        the posted update is the truth, and weather decides which of the two you
        are reading.
      </p>

      <section className="mbr-sec" aria-labelledby="cht-itin">
        {/* Was also headed Itinerary, which put the page name twice on one
            screen at two different sizes. The legs are the passage plan, which
            is what the empty copy below already calls them. */}
        <span className="mbr-eyebrow" id="cht-itin">The passage plan</span>
        {legs.length ? (
          <>
            <div className="cht-legs">
              {legs.map((leg) => (
                <Leg key={leg.id} leg={leg} zone={v.time_zone} />
              ))}
            </div>
            <p className="cht-legs__foot">
              Weather may revise any leg
              <br />
              Crew post changes by 08:00 daily
            </p>
          </>
        ) : (
          <p className="cht-empty">
            The passage plan is not posted yet. When the crew post it, each leg
            appears here with the day it was posted, and any leg that moves says
            why, what happens instead, and what is unchanged.
          </p>
        )}
      </section>

      <section className="mbr-sec" aria-labelledby="cht-cabin">
        <span className="mbr-eyebrow" id="cht-cabin">Your cabin</span>
        {cabin ? (
          <div className="cht-cards">
            <article className="cht-card">
              <div className="cht-card__head">
                <h2 className="cht-card__name">{cabin.name}</h2>
                <span className="cht-card__where">
                  {[cabin.deck, cabin.side ? SIDE_LABEL[cabin.side] : null]
                    .filter(Boolean)
                    .join(" · ") || "Deck posted on board"}
                </span>
              </div>
              <div className="cht-card__facts">
                <span>
                  Sleeps<b>{cabin.sleeps}</b>
                </span>
                <span>
                  Muster<b>{cabin.muster ?? v.muster ?? "Posted on board"}</b>
                </span>
                <span>
                  Safe code<b>Set on board</b>
                </span>
              </div>
              <p className="cht-card__note">
                Life jackets under the bunk. Fresh water runs 07:00 to 23:00.
              </p>
            </article>
          </div>
        ) : (
          <p className="cht-empty">
            No cabin on this episode yet. Hold one below for 72 hours at no
            charge, or take one outright from the plan.
          </p>
        )}
      </section>

      {cabinRows.length ? (
        <section className="mbr-sec" aria-labelledby="cht-plan">
          <span className="mbr-eyebrow" id="cht-plan">The cabin plan</span>
          <CabinPlan
            episodeId={v.id}
            cabins={cabinRows}
            option={
              option
                ? {
                    id: option.id,
                    cabinId: option.cabin_id,
                    /* Formatted on the server, in the harbour's clock. A
                       toLocaleString() in the browser renders a different
                       instant than the server did on any machine set to another
                       zone, and the two disagreeing on the same page is the bug
                       this codebase already paid for once. */
                    expiresLabel: logDateTime(option.expires_at, zone ?? v.time_zone),
                  }
                : null
            }
          />
        </section>
      ) : null}

      {stops.length ? (
        <section className="mbr-sec" aria-labelledby="cht-stops">
          <span className="mbr-eyebrow" id="cht-stops">Port guide</span>
          <div className="cht-stops">
            {stops.map((s) => (
              <article className="cht-stop" key={s.id}>
                <span className="cht-stop__no">
                  Stop {String(s.position).padStart(2, "0")} · {s.name}
                </span>
                <span className="cht-stop__what">
                  {s.tender_at ? `Tender leaves at ${s.tender_at.slice(0, 5)}` : s.name}
                </span>
                <span className="cht-stop__when">
                  {s.last_return ? `Last return ${s.last_return.slice(0, 5)}` : ""}
                  {s.notes ? ` · ${s.notes}` : ""}
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <States />
    </div>
  );
}

function Leg({ leg, zone }: { leg: EpisodeLeg; zone: string }) {
  return (
    <div className="cht-leg">
      <span className="cht-leg__day">Day {String(leg.day).padStart(2, "0")}</span>
      <div className="cht-leg__body">
        <span className="cht-leg__port">
          <b>{leg.place}</b>
          {leg.note ? ` — ${leg.note}` : ""}
          {leg.starts_at ? ` — ${logTime(leg.starts_at, zone)}` : ""}
        </span>
        {leg.status === "held" ? (
          /* Reason, then the new plan, then what is unchanged — in that order,
             and the database refuses a hold missing any of the three. The third
             is the one that does the work: a guest reading that their leg moved
             wants to hear that dinner is still on. */
          <div className="cht-hold">
            <span className="cht-hold__eyebrow">
              Weather hold · posted{" "}
              {leg.hold_posted_at ? logTime(leg.hold_posted_at, zone) : ""}
            </span>
            <span className="cht-hold__reason">{leg.hold_new_plan}</span>
            <span className="cht-hold__plan">{leg.hold_reason}</span>
            <span className="cht-hold__same">{leg.hold_unchanged}</span>
          </div>
        ) : leg.status === "revised" ? (
          <span className="cht-leg__posted">
            Revised · posted {logDate(leg.posted_at, zone)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function States() {
  return (
    <section className="mbr-sec" aria-labelledby="cht-states">
      <span className="mbr-eyebrow" id="cht-states">Episode states</span>
      <div className="cht-states">
        {CHARTER_STATES.map(([name, line, colour]) => (
          <div
            className="cht-state"
            key={name}
            style={{ ["--cht-state" as string]: colour }}
          >
            <span className="cht-state__name">{name}</span>
            <span className="cht-state__line">{line}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
