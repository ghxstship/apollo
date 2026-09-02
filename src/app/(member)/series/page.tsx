import type { Metadata } from "next";
import Link from "next/link";
import { getMember } from "../data";
import {
  EXPERIENCE_CLASSES,
  EXPERIENCE_CLASS_IDS,
  SETTING_LABEL,
  SURFACES,
  lockup,
  type ExperienceClassId,
} from "@/lib/brand";
import { logDate } from "@/lib/format";
import {
  EXPERIENCE_ACCENT,
  formatPrice,
  readFiledSailings,
  readFormats,
  type ActivityFormat,
} from "./data";
import "./activity.css";

export const metadata: Metadata = { title: SURFACES.series };

/* Series — the four classes, and what each series is on the hook for.

   Grouped by experience class, which is what kind of thing a series is; where
   it happens is the other axis and rides on the tile as afloat or ashore. The
   kit requires every series to state three things: its capacity, its price, and
   what it does not include. All three are columns, so all three render or the
   row is visibly incomplete — which is the point. The fourth fact is the one
   the kit only says in prose and this product enforces in the booking guard:
   whether the series asks for vetting at all.

   The word on screen is Series as of 2026-09-02; activity_formats, the format
   column and every identifier below keep their names, which are plumbing. */

/* operations.md §2, the seven-hour arc, with the guest-facing Five-A phase the
   activity kit prints beside each window. Deliberately NOT the run-of-show
   board: no staff lead, no BPM, no critical path. Those belong to the crew's
   surface and duplicating them here would put two versions of the same day on
   two screens, which is how one of them goes stale. */
const ANCHOR_ARC: Array<[string, string, string]> = [
  ["11:00", "Pre-boarding social in the marina lounge", "Arrival"],
  ["12:00", "Boarding, and the Wristband", "Arrival"],
  ["12:45", "Departure, consent briefing, the Pod opens", "Atmosphere"],
  ["14:00", "Haulover Sandbar and the challenges", "Activity"],
  ["17:00", "Sunset cruise. Radar closes at 17:30", "Afterglow"],
  ["18:00", "Alongside, and the sealed envelope", "Afterglow"],
];

export default async function ExperiencesPage() {
  const { supabase } = await getMember();
  const [formats, filed] = await Promise.all([
    readFormats(supabase),
    readFiledSailings(supabase),
  ]);

  const byClass = (c: ExperienceClassId) => formats.filter((f) => f.experience_class === c);
  const sailingsFor = (slug: string) => filed.filter((v) => v.format === slug);

  return (
    <div className="act">
      <span className="mbr-eyebrow">Four classes · Open · Club · Premium · Exotic</span>
      {/* The h1 was Every way in, which named nothing a member could navigate
          back to. The name is the h1 now and the old line opens the standfirst,
          which is where it was doing its work anyway. */}
      <h1 className="mbr-h1">{SURFACES.series}.</h1>
      <p className="act-lede">
        Every way in. Open is the one door a member&rsquo;s guest may come through unvetted.
        Club is the members&rsquo; standard. Premium hands you the boat or the
        room. Exotic leaves home water. Every series below says whether it is
        afloat or ashore, what it holds, what it costs or why it has no price,
        and what it leaves out.
      </p>

      <section className="mbr-sec" aria-labelledby="act-anchor">
        <span className="mbr-eyebrow" id="act-anchor">
          The anchor series · the weekly episode · seven hours
        </span>
        <div className="act-arc">
          {ANCHOR_ARC.map(([time, what, phase]) => (
            <div className="act-arc__row" key={time}>
              <span className="act-arc__t">{time}</span>
              <span className="act-arc__what">{what}</span>
              <span className="act-arc__phase">{phase}</span>
            </div>
          ))}
        </div>
        <p className="act-lede">
          Forty people, one sandbar, and times read on the city&rsquo;s own
          clock. Weather decides the water plan; nothing else does.
        </p>
      </section>

      {EXPERIENCE_CLASS_IDS.map((klass) => {
        const inClass = byClass(klass);
        return (
          <section
            className="act-cat"
            key={klass}
            aria-labelledby={`act-cat-${klass}`}
            style={{ ["--act-accent" as string]: EXPERIENCE_ACCENT[klass] }}
          >
            <span className="act-cat__rule" aria-hidden="true" />
            <h2 className="act-cat__name" id={`act-cat-${klass}`}>
              {EXPERIENCE_CLASSES[klass].label}
            </h2>
            <p className="act-cat__line">{EXPERIENCE_CLASSES[klass].what}</p>
            {inClass.length ? (
              <div className="act-grid">
                {inClass.map((f) => (
                  <FormatTile key={f.slug} format={f} sailings={sailingsFor(f.slug)} />
                ))}
              </div>
            ) : (
              <p className="act-lede">Nothing on the calendar under this class yet.</p>
            )}
          </section>
        );
      })}

      <p className="act-note">
        A series that asks for no vetting is still a series a paused membership
        cannot book, and it is still counted against the day&rsquo;s capacity.
        {" "}
        {lockup("limited")} carries the premium series; {lockup("bound")}{" "}
        carries what happens ashore.
      </p>
    </div>
  );
}

function FormatTile({
  format,
  sailings,
}: {
  format: ActivityFormat;
  sailings: Array<{ id: string; slug: string; title: string; starts_at: string; time_zone: string }>;
}) {
  const price = formatPrice(format);
  return (
    <article className="act-tile">
      <div className="act-tile__head">
        <h3 className="act-tile__name">{format.label}</h3>
        <span className="act-tile__price">{price}</span>
      </div>
      <p className="act-tile__blurb">{format.blurb}</p>
      <div className="act-tile__facts">
        <span>{SETTING_LABEL[format.category]}</span>
        <span>{format.capacity ? `Holds ${format.capacity}` : "Rides the episode"}</span>
        <span>{format.requires_vetting ? "Vetting required" : "No vetting required"}</span>
      </div>
      {format.excludes.length ? (
        <ul className="act-tile__not">
          {format.excludes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="act-tile__filed">
        {sailings.length ? (
          sailings.map((v) => (
            <span key={v.id}>
              <Link href={`/episodes/${v.slug}`}>{v.title}</Link>
              {" · "}
              {logDate(v.starts_at, v.time_zone)}
            </span>
          ))
        ) : (
          <span>Nothing on the calendar under this series yet.</span>
        )}
      </div>
    </article>
  );
}
