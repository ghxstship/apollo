import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, AvatarGroup, Badge, Tag } from "@/components/ds";
import { LinkButton } from "@/components/site/link-button";
import { SURFACES } from "@/lib/brand";
import { SETTING_LABEL, TIER_LABEL, logDate, logTime, price } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { moduleTables } from "@/lib/module-tables";
import { durationChip, onSaleChip, vesselSpec } from "@/components/site/episode-chips";
import { fleetFor, framesFor } from "@/components/site/episode-data";
import { readLegs, readStops } from "@/app/(member)/itinerary/data";
import { Enquire } from "@/components/member/enquire";

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
      "What do I wear?",
      "Riviera Chic — linen over logos, salt-fade colours, nothing that fears spray. Shoes come off at the gangway; the deck decides the rest.",
    ],
    [
      "What if the weather turns?",
      "Holds are called by 18:00 the night before — a word, not an apology. Your pass carries forward in full.",
    ],
    [
      "Can I bring a guest?",
      "Guests ride on Global passes, two per episode. Everyone signs the manifest at the gangway.",
    ],
  ],
  shore: [
    [
      "What should I bring?",
      "A towel, a swimsuit, and nothing that minds sand. The long table, the umbrellas, and the provisions are set before you arrive.",
    ],
    [
      "What if the weather turns?",
      "Ashore, we hold for rain, not for clouds. Holds are called by 18:00 the night before and your pass carries forward.",
    ],
    [
      "Can I bring a guest?",
      "Guests ride on Global passes, two per episode. Everyone signs the manifest at the gangway.",
    ],
  ],
  sky: [
    [
      "What should I bring?",
      "Come as you are; leave the tie ashore. Night passages carry bedding and wool — the club carries the records.",
    ],
    [
      "What if the weather turns?",
      "Anything ashore carries on regardless. Night passages hold by 18:00 the night before, and your pass carries forward.",
    ],
    [
      "Can I bring a guest?",
      "Guests ride on Global passes, two per episode. Everyone signs the manifest at the gangway.",
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
  const { data: episode } = await supabase
    .from("episodes")
    .select("title, blurb")
    .eq("slug", slug)
    .maybeSingle();
  return {
    alternates: { canonical: `/episodes/${slug}` },
    title: episode?.title ?? "Episodes",
    description: episode?.blurb ?? undefined,
  };
}

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: episode } = await supabase
    .from("episodes")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!episode) notFound();

  const [{ data: cap }, { data: { user } }, { data: formatRow }] = await Promise.all([
    supabase.from("episode_capacity").select("*").eq("episode_id", episode.id).maybeSingle(),
    supabase.auth.getUser(),
    /* The format decides the door. 'open' formats sell a pass; 'on_request'
       ones take an enquiry; 'invite' ones take nothing from this page. Another
       module's table, reached through the moduleTables seam and typed at the
       boundary. */
    episode.series
      ? moduleTables(supabase)
          .from("series")
          .select("slug, label, access, category")
          .eq("slug", episode.series)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const format = (formatRow ?? null) as
    | { slug: string; label: string; access: string; category: string }
    | null;
  const onRequest = format?.access === "on_request";
  const byInvitation = format?.access === "invite";
  /* An episode is announced on its city's clock, which it carries itself. */
  const zone = episode.time_zone;

  /* Real names ride with consent, and only for signed-in members —
     profiles aren't readable from the shore. */
  let crew: Array<{ name: string; tone: "gold" | "sea" | "ink" | "sand" }> = [];
  let guestCount = 0;
  if (user) {
    /* Through a definer, because passes is `profile_id = auth.uid()`: reading
       the roster directly returned only the viewer's own row, so this list was
       empty for every member and guestCount was always 0 — the feature had
       never worked for anyone but staff. Consent is the gate here, not
       ownership; show_on_manifest is the member saying yes. */
    const { data: aboard } = await supabase.rpc("episode_manifest", { p_episode: episode.id });
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

  /* Who is WORKING it, which is a different question from who is aboard — and
     a public one. The manifest of members is gated on sign-in and on each
     member's own consent; the crew billing is gated on the crew member having
     opted in, and then it is for everybody, because it is a reason to book.

     The policy on crew_assignments admits a row to anon exactly when it is
     confirmed and the person is public and active, so an offer nobody answered
     cannot leak through this query and the page never has to filter for it. */
  const { data: billed } = await supabase
    .from("crew_assignments")
    .select("id, crew_id, position_slug, crew!inner(slug, display_name, role_title, avatar_tone)")
    .eq("episode_id", episode.id)
    .eq("status", "confirmed");

  const working = ((billed ?? []) as unknown as Array<{
    id: string;
    crew_id: string;
    position_slug: string;
    crew: { slug: string; display_name: string; role_title: string; avatar_tone: string } | null;
  }>)
    .filter((b) => b.crew)
    .map((b) => ({
      id: b.id,
      crewId: b.crew_id,
      slug: b.crew!.slug,
      name: b.crew!.display_name,
      role: b.crew!.role_title,
      tone: (["gold", "sea", "ink", "sand"].includes(b.crew!.avatar_tone)
        ? b.crew!.avatar_tone
        : "ink") as "gold" | "sea" | "ink" | "sand",
    }));

  /* Whether this member already knows anyone working tonight. Naming the crew
     is a reason to book; remembering that you know them is a reason to come
     back — and unlike most personalisation it is a fact the club actually has
     rather than an inference about somebody.

     Only asked when there is somebody to ask about and somebody to ask for. */
  let known = new Map<string, number>();
  if (user && working.length > 0) {
    const { data: history } = await supabase
      .from("member_crew_history")
      .select("crew_id, together")
      .eq("profile_id", user.id);
    known = new Map(
      ((history ?? []) as Array<{ crew_id: string | null; together: number | null }>)
        .filter((h) => h.crew_id && (h.together ?? 0) > 0)
        .map((h) => [h.crew_id as string, h.together as number])
    );
  }

  const aboard = cap?.aboard ?? 0;
  const left = cap?.passes_left ?? null;
  /* Boarding was pinned at thirty minutes before cast off regardless of the
     episode's own plan, so an episode whose first stop is at −15 published two
     different boarding times on one page — and the ICS repeated the wrong one.
     The itinerary leads when it has something to say. */
  const firstStopOffset = (Array.isArray(episode.itinerary) ? episode.itinerary : [])
    .map((raw) =>
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as { offset?: unknown }).offset
        : undefined
    )
    .filter((o): o is number => typeof o === "number" && o < 0)
    .sort((a, b) => a - b)[0];
  const boardsOffsetMin = firstStopOffset ?? -30;
  const boards = new Date(
    new Date(episode.starts_at).getTime() + boardsOffsetMin * 60 * 1000
  ).toISOString();
  const paragraphs = (episode.description ?? episode.blurb ?? "")
    .split(/\n\n+/)
    .filter(Boolean);
  const faq = FAQS[episode.setting] ?? FAQS.sea;
  const seatsWord = "passes";
  const full = left === 0;

  /* The badge: the series' own name and the hours it runs — "SANDBAR SOCIAL ·
     7 HRS". Where the episode has no series the badge names the setting
     instead. Special was tried here and on the three listings, and it marked
     every episode in the catalogue, because a null series means unfiled today
     rather than deliberately standalone — the two are different facts and the
     page cannot tell them apart. The word stays in the Bridge, where blanking
     the series is a choice an operator makes on purpose. An episode with no
     stated end drops the hours rather than inventing them. */
  const settingLabel = SETTING_LABEL[episode.setting] ?? "Afloat";
  const hours = durationChip(episode.starts_at, episode.ends_at);
  const badge = [format?.label ?? settingLabel, hours].filter(Boolean).join(" · ");

  /* An episode in the past, or one the club called off, is a log entry — not a
     pass on sale. The panel below branched only on weather_hold/live/full, so
     fourteen episodes advertised "Reserve a pass" with a live pass count. */
  /* Server-rendered per request, so "now" is request time — captured once,
     the way the listing does it. */
  const nowMs = new Date().getTime();
  const cancelled = episode.status === "cancelled";
  const sailed =
    !cancelled &&
    (episode.status === "completed" || new Date(episode.starts_at).getTime() < nowMs);
  const closed = cancelled || sailed;
  /* The drop hour. Before it the episode is announced, not on offer — the
     guard refuses the booking, so the page must not invite it. Deeper tiers
     walk in presale_hours earlier per step; the public hour is the one shown. */
  const notYetOnSale = !closed && !!episode.sale_opens_at && Date.parse(episode.sale_opens_at) > nowMs;
  const onSaleLine = notYetOnSale && episode.sale_opens_at ? onSaleChip(episode.sale_opens_at, zone) : null;

  /* The plan — itinerary stops as offsets (minutes) from cast off. */
  const stops = (Array.isArray(episode.itinerary) ? episode.itinerary : []).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const s = raw as { [key: string]: unknown };
    return typeof s.offset === "number" && typeof s.title === "string"
      ? [{ offset: s.offset, title: s.title, note: typeof s.note === "string" ? s.note : null }]
      : [];
  });
  const stopTime = (offset: number) =>
    logTime(new Date(new Date(episode.starts_at).getTime() + offset * 60 * 1000).toISOString(), zone);

  const firstNames = crew.map((c) => c.name.split(" ")[0]);

  /* Flotilla and frames sit behind members-only RLS — read server-side, and
     absent rather than invented when there is nothing to show.

     Legs and stops are the charter module's operational record and are
     anon-readable by policy ("legs are anon-readable" / "stops are
     anon-readable", both `using (true)`) — an itinerary is the guest-facing
     artefact of a public episode. Where legs exist they lead, because they are
     the copy the crew actually revises; the jsonb itinerary keeps feeding the
     boarding-time arithmetic above and stays as the fallback plan for episodes
     that have never been given rows. Two systems, one authority: rows when
     rows exist. */
  const [fleet, frames, legs, portStops, creditsRes, venueRes] = await Promise.all([
    fleetFor(episode.id),
    framesFor(episode.id),
    readLegs(supabase, episode.id),
    readStops(supabase, episode.id),
    /* The sponsor book is staff-sealed; this definer is the one window through
       it and returns only what the shore may read — names and tiers, ordered
       presenting partner first. A credit, never an ad, and never the money. */
    supabase.rpc("sponsor_credits", { p_episode: episode.id }),
    episode.venue_id
      ? supabase.from("venues").select("name").eq("id", episode.venue_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const credits = creditsRes.data ?? [];
  const venueName = venueRes.data?.name ?? null;

  /* The wrapper used to be <div data-theme={episode.setting}>, which overloaded
     the light/ink attribute to carry the afloat/ashore taxonomy and repointed
     the accent by SETTING rather than by division — see the deleted block in
     site.css for the full argument. The division is spoken by the eyebrow and
     the lockup, so the wrapper had nothing left to do and is a fragment. */
  return (
    <>
      <header className="ev-hero">
        <div className="ev-hero__bg" style={{ background: SEAS[episode.media] ?? SEAS.dusk }}></div>
        <div className="ls-container ev-hero__in">
          <span className="ls-eyebrow">{badge}</span>
          <h1>{episode.title}</h1>
          <div className="ev-hero__meta">
            <span>{settingLabel.toUpperCase()}</span>
            <span>·</span>
            <span>{logDate(episode.starts_at, zone)}</span>
            <span>·</span>
            <span>{logTime(episode.starts_at, zone)}</span>
            {episode.coordinates ? (
              <>
                <span>·</span>
                <span>{episode.coordinates}</span>
              </>
            ) : null}
            {episode.distance_nm != null ? (
              <>
                <span>·</span>
                <span>{episode.distance_nm} NM</span>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="ls-container ev-body">
        <div>
          {episode.blurb ? (
            <p style={{ fontSize: "var(--text-body-l)", maxWidth: "56ch" }}>{episode.blurb}</p>
          ) : null}
          <div className="ev-desc">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {legs.length > 0 ? (
            <div className="ev-plan">
              <h2 className="ev-h2">The plan.</h2>
              {legs.map((leg) => (
                <div className="ev-plan__row" key={leg.id}>
                  <span className="ev-plan__t">Day {String(leg.day).padStart(2, "0")}</span>
                  <div>
                    <div className="ev-plan__title">
                      {leg.place}
                      {leg.starts_at ? ` — ${logTime(leg.starts_at, zone)}` : ""}
                    </div>
                    {leg.note ? <p className="ev-plan__note">{leg.note}</p> : null}
                    {leg.status === "held" ? (
                      /* The kit's copy rule, in the kit's order: the reason,
                         the new plan, and what is unchanged — the database
                         refuses a hold missing any of the three. */
                      <p className="ev-plan__note">
                        Weather hold — {leg.hold_reason} {leg.hold_new_plan}{" "}
                        {leg.hold_unchanged}
                      </p>
                    ) : leg.status === "revised" ? (
                      <p className="ev-plan__note">
                        Revised · posted {logDate(leg.posted_at, zone)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
              {portStops.length > 0 ? (
                <>
                  <h2 className="ev-h2 ev-h2--mid">
                    Ports.
                  </h2>
                  {portStops.map((s) => (
                    <div className="ev-plan__row" key={s.id}>
                      <span className="ev-plan__t">
                        Stop {String(s.position).padStart(2, "0")}
                      </span>
                      <div>
                        <div className="ev-plan__title">{s.name}</div>
                        {s.tender_at || s.last_return || s.notes ? (
                          <p className="ev-plan__note">
                            {[
                              s.tender_at ? `Tender leaves at ${s.tender_at.slice(0, 5)}` : null,
                              s.last_return ? `Last return ${s.last_return.slice(0, 5)}` : null,
                              s.notes,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
              <p className="ev-plan__note" style={{ marginTop: 14 }}>
                Weather may revise any leg. Crew post changes by 08:00 daily.
              </p>
            </div>
          ) : stops.length > 0 ? (
            <div className="ev-plan">
              <h2 className="ev-h2">The plan.</h2>
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
              <h2 className="ev-h2">The fleet.</h2>
              {fleet.map((v) => (
                <div className="ev-fleet__row" key={v.id}>
                  <span className="ev-fleet__name">{v.name}</span>
                  <span className="ev-fleet__spec">{vesselSpec(v)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="ev-frames">
            <h2 className="ev-h2">Frames.</h2>
            {frames.length > 0 ? (
              <div className="ev-frames__strip">
                {frames.map((f) => (
                  // eslint-disable-next-line @next/next/no-img-element -- member frames are Supabase storage URLs; the image loader has no remote pattern for them
                  <img
                    key={f.id}
                    className="ev-frames__img"
                    src={f.url}
                    alt={f.caption ?? `${episode.title} — a frame from the episode`}
                  />
                ))}
              </div>
            ) : (
              <div
                className="ev-frames__tk"
                style={{ background: SEAS[episode.media] ?? SEAS.dusk }}
              >
                <span>Imagery TK — frames post after the episode, credited by name.</span>
              </div>
            )}
          </div>
          <div className="ev-faq">
            <h2 className="ev-h2">Asked often.</h2>
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
                /* Wrapped, not Sailed — the series page's word, true ashore
                   as well as afloat. */
                <Badge tone="outline">Wrapped</Badge>
              ) : episode.status === "weather_hold" ? (
                <Badge tone="caution">Weather hold</Badge>
              ) : episode.status === "live" ? (
                <span className="ls-live ws-live-label">Underway</span>
              ) : onRequest ? (
                <Badge tone="outline">On request</Badge>
              ) : byInvitation ? (
                <Badge tone="outline">By invitation</Badge>
              ) : onSaleLine ? (
                <Badge tone="outline">Not yet on sale</Badge>
              ) : full ? (
                <Badge tone="caution">Episode full</Badge>
              ) : (
                <Badge tone="outline">Passes open</Badge>
              )}
            </div>
            {cancelled ? (
              <p className="ev-note">
                The club called this one off. Anything reserved against it was
                credited in full — the season holds the next open water.
              </p>
            ) : sailed ? (
              <p className="ev-note">
                This one has run. What happened is in The Log.
              </p>
            ) : episode.status === "weather_hold" ? (
              <p className="ev-note">
                A hold is a postponement, not a cancellation. The new date arrives in
                The Log, and every reserved pass carries forward in full.
              </p>
            ) : episode.status === "live" ? (
              <p className="ev-note">
                This one is underway. Follow along on the Open Deck, or find the
                next episode of the season.
              </p>
            ) : onRequest ? (
              /* No pass to reserve. A member asks from here; the shore is
                 told where members ask from, and given the gangway. */
              user ? (
                <Enquire
                  sailingTitle={episode.title}
                  formatSlug={format?.slug ?? null}
                  seriesLabel={format?.label ?? null}
                />
              ) : (
                <>
                  <p className="ev-note ev-note--above">
                    Members enquire from their manifest. Sign in and the form is here.
                  </p>
                  <LinkButton
                    href={`/gangway?next=/episodes/${episode.slug}`}
                    variant="outline"
                    fullWidth
                  >
                    Sign in to enquire
                  </LinkButton>
                </>
              )
            ) : byInvitation ? (
              <p className="ev-note">
                Passes for this one go out by invitation. When the Bridge has your
                name, the word arrives with the pass.
              </p>
            ) : onSaleLine ? (
              <>
                <p className="ev-note ev-note--above">
                  Passes open on the city&rsquo;s clock at that hour. Deeper tiers
                  walk in earlier — the manifest shows your own.
                </p>
                <LinkButton
                  href={user ? "/passes" : `/gangway?next=/episodes/${episode.slug}`}
                  variant="outline"
                  fullWidth
                >
                  {user ? "Watch it on the manifest" : "Sign in ahead of the hour"}
                </LinkButton>
              </>
            ) : full ? (
              <>
                <p className="ev-note ev-note--above">
                  Passes release in order — join the waitlist{user ? " on the manifest" : " at the gangway"} and
                  you&rsquo;ll get the word first.
                </p>
                <LinkButton
                  href={user ? "/passes" : `/gangway?next=/episodes/${episode.slug}`}
                  variant="outline"
                  fullWidth
                >
                  Join the waitlist
                </LinkButton>
              </>
            ) : user ? (
              <LinkButton href="/passes" variant="gold" fullWidth>
                Confirm your pass
              </LinkButton>
            ) : (
              <LinkButton
                href={`/gangway?next=/episodes/${episode.slug}`}
                variant="gold"
                fullWidth
              >
                Reserve a pass
              </LinkButton>
            )}
            {closed ? null : onRequest || byInvitation ? (
              /* "On request" is a complete answer, never a placeholder — no
                 price stands beside a door that is not a sale. */
              <p className="ev-mono-note">{TIER_LABEL[episode.min_tier]} tier and up</p>
            ) : (
              <p className="ev-mono-note">
                {onSaleLine ? <>{onSaleLine} · </> : null}
                {price(episode.price_cents)} · {TIER_LABEL[episode.min_tier]} tier and up
              </p>
            )}
          </div>

          <div className="ev-log">
            {/* The two the reader acts on lead the log: the hour it leaves, and
                whether there is still a pass. The record follows below the
                rule, in the order the log has always kept it. */}
            <div className="ev-log__lead">
              <div>
                <span>Cast off</span>
                <span>{logTime(episode.starts_at, zone)}</span>
              </div>
              <div>
                <span>{seatsWord}</span>
                <span>
                  {closed
                    ? `${aboard} ABOARD`
                    : onSaleLine
                      ? onSaleLine
                      : left != null
                        ? `${left} OF ${cap?.passes_total ?? episode.passes_total} LEFT`
                        : episode.passes_total}
                </span>
              </div>
            </div>
            {/* The Series row appears only when there is a series to name.
                Printing the badge here unconditionally restated the Setting
                row directly beneath it — AFLOAT above AFLOAT — because the
                badge falls back to the setting when an episode is unfiled. A
                spec table that says the same fact twice teaches a reader the
                rows are decoration. */}
            {format?.label ? (
              <div>
                <span>{SURFACES.series}</span>
                <span>{format.label.toUpperCase()}</span>
              </div>
            ) : null}
            <div>
              <span>Setting</span>
              <span>{settingLabel.toUpperCase()}</span>
            </div>
            <div>
              <span>Date</span>
              <span>{logDate(episode.starts_at, zone)}</span>
            </div>
            <div>
              <span>Boards</span>
              <span>{logTime(boards, zone)}</span>
            </div>
            {episode.coordinates ? (
              <div>
                <span>Position</span>
                <span>{episode.coordinates}</span>
              </div>
            ) : null}
            {venueName ? (
              <div>
                <span>Venue</span>
                <span>{venueName}</span>
              </div>
            ) : null}
            {episode.distance_nm != null ? (
              <div>
                <span>Distance</span>
                <span>{episode.distance_nm} NM</span>
              </div>
            ) : null}
            <div>
              <span>Tier</span>
              <span>{TIER_LABEL[episode.min_tier]}+</span>
            </div>
            <div>
              <span>Calendar</span>
              <span>
                <a
                  href={`/api/calendar/episode/${episode.slug}`}
                  style={{ color: "inherit", textDecoration: "underline" }}
                >
                  Add to calendar
                </a>
              </span>
            </div>
            {/* One quiet line, absent when no one is on it. */}
            {credits.length > 0 ? (
              <div>
                <span>Presented with</span>
                <span>{credits.map((c) => c.name).join(", ")}</span>
              </div>
            ) : null}
          </div>

          {working.length > 0 ? (
            <div className="ev-panel">
              <div className="ev-panel__label">Your crew</div>
              <div className="ev-crew">
                {working.map((w) => (
                  <Link key={w.id} href={`/crew/${w.slug}`} className="ev-crew__one">
                    <Avatar name={w.name} size="sm" tone={w.tone} />
                    <span className="ev-crew__who">
                      <b>{w.name}</b>
                      <span>
                        {w.role}
                        {known.get(w.crewId) ? (
                          <em className="ev-crew__met">
                            · {known.get(w.crewId)} {known.get(w.crewId) === 1 ? "episode" : "episodes"} together
                          </em>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

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
              <p className="ev-note">
                {aboard} aboard{user ? "" : " — sign in to see who's aboard"}.
              </p>
            ) : (
              <p className="ev-note">
                The manifest is open. First aboard sets the tone.
              </p>
            )}
            <p className="ev-note ev-note--fine">
              Shown with consent — members choose visibility per episode.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
