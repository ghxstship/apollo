import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, AvatarGroup, Badge, Tag } from "@/components/ds";
import { LinkButton } from "@/components/site/link-button";
import { SETTING_LABEL, TIER_LABEL, logDate, logTime, price } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { moduleTables } from "@/lib/module-tables";
import { durationChip, onSaleChip, vesselSpec } from "@/components/site/voyage-chips";
import { fleetFor, framesFor } from "@/components/site/voyage-data";
import { readLegs, readStops } from "@/app/(member)/charter/data";
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
      "Ashore, we hold for rain, not for clouds. Holds are called by 18:00 the night before and your seat carries forward.",
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
      "Anything ashore carries on regardless. Night passages hold by 18:00 the night before, and your pass carries forward.",
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
    alternates: { canonical: `/charters/${slug}` },
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

  const [{ data: cap }, { data: { user } }, { data: formatRow }] = await Promise.all([
    supabase.from("voyage_capacity").select("*").eq("voyage_id", voyage.id).maybeSingle(),
    supabase.auth.getUser(),
    /* The format decides the door. 'open' formats sell a pass; 'on_request'
       ones take an enquiry; 'invite' ones take nothing from this page. Another
       module's table, reached through the moduleTables seam and typed at the
       boundary. */
    voyage.format
      ? moduleTables(supabase)
          .from("activity_formats")
          .select("slug, label, access, category")
          .eq("slug", voyage.format)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const format = (formatRow ?? null) as
    | { slug: string; label: string; access: string; category: string }
    | null;
  const onRequest = format?.access === "on_request";
  const byInvitation = format?.access === "invite";
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

  /* The badge: the format's own name and the hours it runs — "SANDBAR SOCIAL ·
     7 HRS". A sailing with no format falls back to where it happens, and a
     sailing with no stated end drops the hours rather than inventing them. */
  const settingLabel = SETTING_LABEL[voyage.class] ?? "Afloat";
  const hours = durationChip(voyage.starts_at, voyage.ends_at);
  const badge = [format?.label ?? settingLabel, hours].filter(Boolean).join(" · ");

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
  /* The drop hour. Before it the sailing is announced, not on offer — the
     guard refuses the booking, so the page must not invite it. Deeper tiers
     walk in presale_hours earlier per step; the public hour is the one shown. */
  const notYetOnSale = !closed && !!voyage.sale_opens_at && Date.parse(voyage.sale_opens_at) > nowMs;
  const onSaleLine = notYetOnSale && voyage.sale_opens_at ? onSaleChip(voyage.sale_opens_at, zone) : null;

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
     absent rather than invented when there is nothing to show.

     Legs and stops are the charter module's operational record and are
     anon-readable by policy ("legs are anon-readable" / "stops are
     anon-readable", both `using (true)`) — an itinerary is the guest-facing
     artefact of a public voyage. Where legs exist they lead, because they are
     the copy the crew actually revises; the jsonb itinerary keeps feeding the
     boarding-time arithmetic above and stays as the fallback plan for voyages
     that have never been given rows. Two systems, one authority: rows when
     rows exist. */
  const [fleet, frames, legs, portStops, creditsRes, venueRes] = await Promise.all([
    fleetFor(voyage.id),
    framesFor(voyage.id),
    readLegs(supabase, voyage.id),
    readStops(supabase, voyage.id),
    /* The sponsor book is staff-sealed; this definer is the one window through
       it and returns only what the shore may read — names and tiers, ordered
       presenting partner first. A credit, never an ad, and never the money. */
    supabase.rpc("sponsor_credits", { p_voyage: voyage.id }),
    voyage.venue_id
      ? supabase.from("venues").select("name").eq("id", voyage.venue_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const credits = creditsRes.data ?? [];
  const venueName = venueRes.data?.name ?? null;

  return (
    <div data-theme={voyage.class}>
      <header className="ev-hero">
        <div className="ev-hero__bg" style={{ background: SEAS[voyage.media] ?? SEAS.dusk }}></div>
        <div className="ls-container ev-hero__in">
          <span className="ls-eyebrow">{badge}</span>
          <h1>{voyage.title}</h1>
          <div className="ev-hero__meta">
            <span>{settingLabel.toUpperCase()}</span>
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
          {legs.length > 0 ? (
            <div className="ev-plan">
              <h2 className="ev-h2">The plan.</h2>
              {legs.map((leg) => (
                <div className="ev-plan__row" key={leg.id}>
                  <span className="ev-plan__t">Day {String(leg.day).padStart(2, "0")}</span>
                  <div>
                    <div className="ev-plan__title">
                      {leg.port}
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
                <Badge tone="outline">Sailed</Badge>
              ) : voyage.status === "weather_hold" ? (
                <Badge tone="caution">Weather hold</Badge>
              ) : voyage.status === "live" ? (
                <span className="ls-live ws-live-label">Underway</span>
              ) : onRequest ? (
                <Badge tone="outline">On request</Badge>
              ) : byInvitation ? (
                <Badge tone="outline">By invitation</Badge>
              ) : onSaleLine ? (
                <Badge tone="outline">Not yet on sale</Badge>
              ) : full ? (
                <Badge tone="caution">Sailing full</Badge>
              ) : (
                <Badge tone="outline">Passes open</Badge>
              )}
            </div>
            {cancelled ? (
              <p className="ev-note">
                The club called this one off. Anything reserved against it was
                credited in full — the manifest holds the next open water.
              </p>
            ) : sailed ? (
              <p className="ev-note">
                This one is in the log. What the cameras kept is in Episodes.
              </p>
            ) : voyage.status === "weather_hold" ? (
              <p className="ev-note">
                A hold is a postponement, not a cancellation. The new date arrives in
                Episodes, and every reserved pass carries forward in full.
              </p>
            ) : voyage.status === "live" ? (
              <p className="ev-note">
                This one is on the water. Follow along on the Open Deck, or find the
                next sailing on the manifest.
              </p>
            ) : onRequest ? (
              /* No pass to reserve. A member asks from here; the shore is
                 told where members ask from, and given the gangway. */
              user ? (
                <Enquire
                  sailingTitle={voyage.title}
                  formatSlug={format?.slug ?? null}
                  formatLabel={format?.label ?? null}
                />
              ) : (
                <>
                  <p className="ev-note ev-note--above">
                    Members enquire from their manifest. Sign in and the form is here.
                  </p>
                  <LinkButton
                    href={`/gangway?next=/charters/${voyage.slug}`}
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
                  Passes open on the harbour&rsquo;s clock at that hour. Deeper tiers
                  walk in earlier — the manifest shows your own.
                </p>
                <LinkButton
                  href={user ? "/manifest" : `/gangway?next=/charters/${voyage.slug}`}
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
            {closed ? null : onRequest || byInvitation ? (
              /* "On request" is a complete answer, never a placeholder — no
                 price stands beside a door that is not a sale. */
              <p className="ev-mono-note">{TIER_LABEL[voyage.min_tier]} tier and up</p>
            ) : (
              <p className="ev-mono-note">
                {onSaleLine ? <>{onSaleLine} · </> : null}
                {price(voyage.price_cents)} · {TIER_LABEL[voyage.min_tier]} tier and up
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
                <span>{logTime(voyage.starts_at, zone)}</span>
              </div>
              <div>
                <span>{seatsWord}</span>
                <span>
                  {closed
                    ? `${aboard} ABOARD`
                    : onSaleLine
                      ? onSaleLine
                      : left != null
                        ? `${left} OF ${cap?.berths_total ?? voyage.berths_total} LEFT`
                        : voyage.berths_total}
                </span>
              </div>
            </div>
            <div>
              <span>Format</span>
              <span>{badge.toUpperCase()}</span>
            </div>
            <div>
              <span>Setting</span>
              <span>{settingLabel.toUpperCase()}</span>
            </div>
            <div>
              <span>Date</span>
              <span>{logDate(voyage.starts_at, zone)}</span>
            </div>
            <div>
              <span>Boards</span>
              <span>{logTime(boards, zone)}</span>
            </div>
            {voyage.coordinates ? (
              <div>
                <span>Position</span>
                <span>{voyage.coordinates}</span>
              </div>
            ) : null}
            {venueName ? (
              <div>
                <span>Venue</span>
                <span>{venueName}</span>
              </div>
            ) : null}
            {voyage.distance_nm != null ? (
              <div>
                <span>Distance</span>
                <span>{voyage.distance_nm} NM</span>
              </div>
            ) : null}
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
            {/* One quiet line, absent when no one is on it. */}
            {credits.length > 0 ? (
              <div>
                <span>Presented with</span>
                <span>{credits.map((c) => c.name).join(", ")}</span>
              </div>
            ) : null}
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
              <p className="ev-note">
                {aboard} aboard{user ? "" : " — sign in to see who's aboard"}.
              </p>
            ) : (
              <p className="ev-note">
                The manifest is open. First aboard sets the tone.
              </p>
            )}
            <p className="ev-note ev-note--fine">
              Shown with consent — members choose visibility per voyage.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
