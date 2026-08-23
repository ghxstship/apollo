import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, AvatarGroup, Badge, Tag } from "@/components/ds";
import { LinkButton } from "@/components/site/link-button";
import { CLASS_CODES, SUB_CLASSES } from "@/lib/brand";
import { EVENT_CLASS_LABEL, TIER_LABEL, logDate, logTime, price } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { vesselSpec } from "@/components/site/voyage-chips";
import { fleetFor, framesFor } from "@/components/site/voyage-data";

const SEAS: Record<string, string> = {
  day: "var(--sea-day)",
  dusk: "var(--sea-dusk)",
  dawn: "var(--sea-dawn)",
};

/* Per-class FAQ — what to bring, weather holds, guests. */
const FAQS: Record<string, Array<[string, string]>> = {
  sea: [
    [
      "What should I bring?",
      "Sunscreen, shoes that grip, and a layer for the wind. Life vests, wool layers on the cold runs, and coffee below deck are the club's doing.",
    ],
    [
      "What if the weather turns?",
      "Holds are called by 18:00 the night before — a word, not an apology. Your pass carries forward in full.",
    ],
    [
      "Can I bring a guest?",
      "Guests ride on Global passes, two per event. Everyone signs the manifest at the gangway.",
    ],
  ],
  shore: [
    [
      "What should I bring?",
      "A towel, a swimsuit, and nothing that minds sand. The long table, the umbrellas, and the provisions are set before you arrive.",
    ],
    [
      "What if the weather turns?",
      "Port days hold for rain, not for clouds. Holds are called by 18:00 the night before and your seat carries forward.",
    ],
    [
      "Can I bring a guest?",
      "Guests ride on Global passes, two per event. Everyone signs the manifest at the gangway.",
    ],
  ],
  sky: [
    [
      "What should I bring?",
      "Come as you are; leave the tie ashore. Night passages carry bedding and wool — the club carries the records.",
    ],
    [
      "What if the weather turns?",
      "Port Days carry on regardless. Night passages hold by 18:00 the night before, and your pass carries forward.",
    ],
    [
      "Can I bring a guest?",
      "Guests ride on Global passes, two per event. Everyone signs the manifest at the gangway.",
    ],
  ],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: voyage } = await supabase
    .from("voyages")
    .select("title, blurb")
    .eq("slug", slug)
    .maybeSingle();
  return {
    title: voyage?.title ?? "Voyages",
    description: voyage?.blurb ?? undefined,
  };
}

export default async function VoyagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: voyage } = await supabase
    .from("voyages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!voyage) notFound();

  const [{ data: cap }, { data: { user } }] = await Promise.all([
    supabase.from("voyage_capacity").select("*").eq("voyage_id", voyage.id).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  /* A sailing is announced on its harbor's clock, which it carries itself. */
  const zone = voyage.time_zone;

  /* Real names ride with consent, and only for signed-in members —
     profiles aren't readable from the shore. */
  let crew: Array<{ name: string; tone: "gold" | "sea" | "ink" | "sand" }> = [];
  let guestCount = 0;
  if (user) {
    /* Through a definer, because rsvps is `profile_id = auth.uid()`: reading
       the roster directly returned only the viewer's own row, so this list was
       empty for every member and guestCount was always 0 — the feature had
       never worked for anyone but staff. Consent is the gate here, not
       ownership; show_on_manifest is the member saying yes. */
    const { data: aboard } = await supabase.rpc("voyage_manifest", { p_voyage: voyage.id });
    guestCount = (aboard ?? []).reduce((sum, r) => sum + (r.guests ?? 0), 0);
    crew = (aboard ?? [])
      .slice(0, 12)
      .map((r) => ({
        name: r.full_name,
        tone: (["gold", "sea", "ink", "sand"].includes(r.avatar_tone)
          ? r.avatar_tone
          : "ink") as "gold" | "sea" | "ink" | "sand",
      }));
  }

  const aboard = cap?.aboard ?? 0;
  const left = cap?.berths_left ?? null;
  /* Boarding was pinned at thirty minutes before cast off regardless of the
     sailing's own plan, so a voyage whose first stop is at −15 published two
     different boarding times on one page — and the ICS repeated the wrong one.
     The itinerary leads when it has something to say. */
  const firstStopOffset = (Array.isArray(voyage.itinerary) ? voyage.itinerary : [])
    .map((raw) =>
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as { offset?: unknown }).offset
        : undefined
    )
    .filter((o): o is number => typeof o === "number" && o < 0)
    .sort((a, b) => a - b)[0];
  const boardsOffsetMin = firstStopOffset ?? -30;
  const boards = new Date(
    new Date(voyage.starts_at).getTime() + boardsOffsetMin * 60 * 1000
  ).toISOString();
  const paragraphs = (voyage.description ?? voyage.blurb ?? "")
    .split(/\n\n+/)
    .filter(Boolean);
  const faq = FAQS[voyage.class] ?? FAQS.sea;
  const seatsWord = "passes";
  const full = left === 0;

  /* Class meta in the mono data register: "SEA · EXPEDITION · 4–8 HRS". */
  const sub = voyage.sub_class ? SUB_CLASSES[voyage.sub_class] : null;
  const classMeta = [
    CLASS_CODES[voyage.class],
    sub?.label.toUpperCase(),
    sub?.note.toUpperCase().replace("HOURS", "HRS"),
  ]
    .filter(Boolean)
    .join(" · ");

  /* A sailing in the past, or one the club called off, is a log entry — not a
     pass on sale. The panel below branched only on weather_hold/live/full, so
     fourteen voyages advertised "Reserve a pass" with a live pass count. */
  /* Server-rendered per request, so "now" is request time — captured once,
     the way the manifest does it. */
  const nowMs = new Date().getTime();
  const cancelled = voyage.status === "cancelled";
  const sailed =
    !cancelled &&
    (voyage.status === "completed" || new Date(voyage.starts_at).getTime() < nowMs);
  const closed = cancelled || sailed;

  /* The plan — itinerary stops as offsets (minutes) from cast off. */
  const stops = (Array.isArray(voyage.itinerary) ? voyage.itinerary : []).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const s = raw as { [key: string]: unknown };
    return typeof s.offset === "number" && typeof s.title === "string"
      ? [{ offset: s.offset, title: s.title, note: typeof s.note === "string" ? s.note : null }]
      : [];
  });
  const stopTime = (offset: number) =>
    logTime(new Date(new Date(voyage.starts_at).getTime() + offset * 60 * 1000).toISOString(), zone);

  const firstNames = crew.map((c) => c.name.split(" ")[0]);

  /* Flotilla and frames sit behind members-only RLS — read server-side, and
     absent rather than invented when there is nothing to show. */
  const [fleet, frames] = await Promise.all([fleetFor(voyage.id), framesFor(voyage.id)]);

  return (
    <div data-theme={voyage.class}>
      <header className="ev-hero">
        <div className="ev-hero__bg" style={{ background: SEAS[voyage.media] ?? SEAS.dusk }}></div>
        <div className="ls-container ev-hero__in">
          <span className="ls-eyebrow">
            {EVENT_CLASS_LABEL[voyage.class]}
            {sub ? <> · {sub.label}</> : null}
          </span>
          <h1>{voyage.title}</h1>
          <div className="ev-hero__meta">
            <span>{classMeta}</span>
            <span>·</span>
            <span>{logDate(voyage.starts_at, zone)}</span>
            <span>·</span>
            <span>{logTime(voyage.starts_at, zone)}</span>
            {voyage.coordinates ? (
              <>
                <span>·</span>
                <span>{voyage.coordinates}</span>
              </>
            ) : null}
            {voyage.distance_nm != null ? (
              <>
                <span>·</span>
                <span>{voyage.distance_nm} NM</span>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="ls-container ev-body">
        <div>
          {voyage.blurb ? (
            <p style={{ fontSize: "var(--text-body-l)", maxWidth: "56ch" }}>{voyage.blurb}</p>
          ) : null}
          <div className="ev-desc">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {stops.length > 0 ? (
            <div className="ev-plan">
              <h2 style={{ fontSize: "var(--text-display-xs)", marginBottom: 12 }}>The plan.</h2>
              {stops.map((s) => (
                <div className="ev-plan__row" key={`${s.offset}-${s.title}`}>
                  <span className="ev-plan__t">{stopTime(s.offset)}</span>
                  <div>
                    <div className="ev-plan__title">{s.title}</div>
                    {s.note ? <p className="ev-plan__note">{s.note}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {fleet.length > 0 ? (
            <div className="ev-fleet">
              <h2 style={{ fontSize: "var(--text-display-xs)", marginBottom: 12 }}>The fleet.</h2>
              {fleet.map((v) => (
                <div className="ev-fleet__row" key={v.id}>
                  <span className="ev-fleet__name">{v.name}</span>
                  <span className="ev-fleet__spec">{vesselSpec(v)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="ev-frames">
            <h2 style={{ fontSize: "var(--text-display-xs)", marginBottom: 12 }}>Frames.</h2>
            {frames.length > 0 ? (
              <div className="ev-frames__strip">
                {frames.map((f) => (
                  // eslint-disable-next-line @next/next/no-img-element -- member frames are Supabase storage URLs; the image loader has no remote pattern for them
                  <img
                    key={f.id}
                    className="ev-frames__img"
                    src={f.url}
                    alt={f.caption ?? `${voyage.title} — a frame from the sail`}
                  />
                ))}
              </div>
            ) : (
              <div
                className="ev-frames__tk"
                style={{ background: SEAS[voyage.media] ?? SEAS.dusk }}
              >
                <span>Imagery TK — frames post after the sail, credited by name.</span>
              </div>
            )}
          </div>
          <div className="ev-faq">
            <h2 style={{ fontSize: "var(--text-display-xs)", marginBottom: 12 }}>Asked often.</h2>
            {faq.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>

        <aside className="ev-side">
          <div className="ev-panel">
            <div className="ev-panel__label">Passage</div>
            <div style={{ marginBottom: 16 }}>
              {cancelled ? (
                <Badge tone="caution">Cancelled</Badge>
              ) : sailed ? (
                <Badge tone="outline">Sailed</Badge>
              ) : voyage.status === "weather_hold" ? (
                <Badge tone="caution">Weather hold</Badge>
              ) : voyage.status === "live" ? (
                <span className="ls-live ws-live-label">Underway</span>
              ) : full ? (
                <Badge tone="caution">Sailing full</Badge>
              ) : (
                <Badge tone="outline">Passes open</Badge>
              )}
            </div>
            {cancelled ? (
              <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                The club called this one off. Anything reserved against it was
                credited in full — the manifest holds the next open water.
              </p>
            ) : sailed ? (
              <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                This one is in the log. What the cameras kept is in Episodes.
              </p>
            ) : voyage.status === "weather_hold" ? (
              <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                A hold is a postponement, not a cancellation. The new date arrives in
                Episodes, and every reserved pass carries forward in full.
              </p>
            ) : voyage.status === "live" ? (
              <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                This one is on the water. Follow along on the Open Deck, or find the
                next sailing on the manifest.
              </p>
            ) : full ? (
              <>
                <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>
                  Passes release in order — join the waitlist{user ? " on the manifest" : " at the gangway"} and
                  you&rsquo;ll get the word first.
                </p>
                <LinkButton
                  href={user ? "/manifest" : `/gangway?next=/charters/${voyage.slug}`}
                  variant="outline"
                  fullWidth
                >
                  Join the waitlist
                </LinkButton>
              </>
            ) : user ? (
              <LinkButton href="/manifest" variant="gold" fullWidth>
                Confirm your pass
              </LinkButton>
            ) : (
              <LinkButton
                href={`/gangway?next=/charters/${voyage.slug}`}
                variant="gold"
                fullWidth
              >
                Reserve a pass
              </LinkButton>
            )}
            {closed ? null : (
              <p className="ev-mono-note">
                {price(voyage.price_cents)} · {TIER_LABEL[voyage.min_tier]} tier and up
              </p>
            )}
          </div>

          <div className="ev-log">
            <div>
              <span>Class</span>
              <span>{classMeta}</span>
            </div>
            <div>
              <span>Date</span>
              <span>{logDate(voyage.starts_at, zone)}</span>
            </div>
            <div>
              <span>Boards</span>
              <span>{logTime(boards, zone)}</span>
            </div>
            <div>
              <span>Cast off</span>
              <span>{logTime(voyage.starts_at, zone)}</span>
            </div>
            {voyage.coordinates ? (
              <div>
                <span>Position</span>
                <span>{voyage.coordinates}</span>
              </div>
            ) : null}
            {voyage.distance_nm != null ? (
              <div>
                <span>Distance</span>
                <span>{voyage.distance_nm} NM</span>
              </div>
            ) : null}
            <div>
              <span>{seatsWord}</span>
              <span>
                {closed
                  ? `${aboard} ABOARD`
                  : left != null
                    ? `${left} OF ${cap?.berths_total ?? voyage.berths_total} LEFT`
                    : voyage.berths_total}
              </span>
            </div>
            <div>
              <span>Tier</span>
              <span>{TIER_LABEL[voyage.min_tier]}+</span>
            </div>
            <div>
              <span>Calendar</span>
              <span>
                <a
                  href={`/api/calendar/voyage/${voyage.slug}`}
                  style={{ color: "inherit", textDecoration: "underline" }}
                >
                  Add to calendar
                </a>
              </span>
            </div>
          </div>

          <div className="ev-panel">
            <div className="ev-panel__label">Who&rsquo;s aboard</div>
            {user && crew.length > 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <AvatarGroup>
                    {crew.slice(0, 4).map((c) => (
                      <Avatar key={c.name} name={c.name} size="sm" tone={c.tone} />
                    ))}
                  </AvatarGroup>
                  <span className="ls-mono-data ws-upper" style={{ color: "var(--text-2)" }}>
                    {aboard} aboard
                  </span>
                </div>
                <p className="ev-crew-names">
                  {firstNames.join(", ")}
                  {guestCount > 0 ? (
                    <>
                      {" "}
                      <Tag>+{guestCount} {guestCount === 1 ? "guest" : "guests"}</Tag>
                    </>
                  ) : null}
                </p>
              </>
            ) : aboard > 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                {aboard} aboard{user ? "" : " — sign in to see who's aboard"}.
              </p>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                The manifest is open. First aboard sets the tone.
              </p>
            )}
            <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 10 }}>
              Shown with consent — members choose visibility per voyage.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
