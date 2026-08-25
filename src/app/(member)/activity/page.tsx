import type { Metadata } from "next";
import Link from "next/link";
import { getMember } from "../data";
import { ACTIVITY_CATEGORIES, lockup, type ActivityCategory } from "@/lib/brand";
import { logDate } from "@/lib/format";
import {
  CATEGORY_ACCENT,
  CATEGORY_LINE,
  formatPrice,
  readFiledSailings,
  readFormats,
  type ActivityFormat,
} from "./data";
import "./activity.css";

export const metadata: Metadata = { title: "Activity" };

/* Activity — Sea, Port and Premium, and what each format is on the hook for.

   The kit requires every format to state three things: its capacity, its price,
   and what it does not include. All three are columns, so all three render or
   the row is visibly incomplete — which is the point. The fourth fact is the
   one the kit only says in prose and this product enforces in the booking
   guard: whether the format asks for a Captain's Pass at all. */

/* operations.md §2, the seven-hour arc, with the guest-facing Five-A phase the
   activity kit prints beside each window. Deliberately NOT the run-of-show
   board: no staff lead, no BPM, no critical path. Those belong to the crew's
   surface and duplicating them here would put two versions of the same day on
   two screens, which is how one of them goes stale. */
const ANCHOR_ARC: Array<[string, string, string]> = [
  ["11:00", "Pre-boarding social in the marina lounge", "Arrival"],
  ["12:00", "Boarding, and the Intent Wristband", "Arrival"],
  ["12:45", "Departure, consent briefing, the Pod opens", "Atmosphere"],
  ["14:00", "Haulover Sandbar and the challenges", "Activity"],
  ["17:00", "Sunset cruise. Radar closes at 17:30", "Afterglow"],
  ["18:00", "Alongside, and the sealed envelope", "Afterglow"],
];

export default async function ActivityPage() {
  const { supabase } = await getMember();
  const [formats, filed] = await Promise.all([
    readFormats(supabase),
    readFiledSailings(supabase),
  ]);

  const byCategory = (c: ActivityCategory) => formats.filter((f) => f.category === c);
  const sailingsFor = (slug: string) => filed.filter((v) => v.format === slug);

  return (
    <div className="act">
      <span className="mbr-eyebrow">Three categories · Sea · Port · Premium</span>
      <h1 className="mbr-h1">Every way in</h1>
      <p className="act-lede">
        Sea leaves the dock. Port never does, and is the only door open to a
        member&rsquo;s guest who has not been vetted. Premium is either of those
        with the whole thing to yourself. Every format below states what it
        holds, what it costs or why it has no price, and what it leaves out.
      </p>

      <section className="mbr-sec" aria-labelledby="act-anchor">
        <span className="mbr-eyebrow" id="act-anchor">
          The anchor format · the weekly sailing · seven hours
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
          Forty people, one sandbar, and times read on the harbour&rsquo;s own
          clock. Weather decides the water plan; nothing else does.
        </p>
      </section>

      {ACTIVITY_CATEGORIES.map((category) => (
        <section
          className="act-cat"
          key={category}
          aria-labelledby={`act-cat-${category}`}
          style={{ ["--act-accent" as string]: CATEGORY_ACCENT[category] }}
        >
          <span className="act-cat__rule" aria-hidden="true" />
          <h2 className="act-cat__name" id={`act-cat-${category}`}>
            {category}
          </h2>
          <p className="act-cat__line">{CATEGORY_LINE[category]}</p>
          <div className="act-grid">
            {byCategory(category).map((f) => (
              <FormatTile key={f.slug} format={f} sailings={sailingsFor(f.slug)} />
            ))}
          </div>
        </section>
      ))}

      <p className="act-note">
        A format that asks for no pass is still a format a paused membership
        cannot book, and it is still counted against the day&rsquo;s capacity.
        What it does not ask for is vetting. {lockup("limited")} carries the
        premium formats; {lockup("bound")} carries Port.
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
        <span>{format.capacity ? `Holds ${format.capacity}` : "Rides the sailing"}</span>
        <span>{format.requires_vetting ? "Captain's Pass required" : "No pass required"}</span>
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
              <Link href={`/charters/${v.slug}`}>{v.title}</Link>
              {" · "}
              {logDate(v.starts_at, v.time_zone)}
            </span>
          ))
        ) : (
          <span>Nothing on the calendar under this format yet.</span>
        )}
      </div>
    </article>
  );
}
