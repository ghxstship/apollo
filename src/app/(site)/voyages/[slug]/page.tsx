import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, AvatarGroup, Badge } from "@/components/ds";
import { LinkButton } from "@/components/site/link-button";
import { EVENT_CLASS_LABEL, TIER_LABEL, logDate, logTime, price } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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
      "Holds are called by 18:00 the night before — a word, not an apology. Your berth carries forward in full.",
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
      "Come as you are; leave the tie ashore. Overnight passages carry bedding and wool — the salon carries the records.",
    ],
    [
      "What if the weather turns?",
      "Salons sail on regardless. Night passages hold by 18:00 the night before, and your berth carries forward.",
    ],
    [
      "Can I bring a guest?",
      "Guests ride on Global passes, two per event. Everyone signs the manifest at the gangway.",
    ],
  ],
};

/* Placeholder crew for the manifest preview — real names ride with consent
   in the member app. */
const PREVIEW_CREW: Array<[string, "brass" | "sea" | "ink" | "sand"]> = [
  ["Mara Voss", "brass"],
  ["Juno Reyes", "sea"],
  ["Theo Alexakis", "ink"],
  ["Nia Kostas", "sand"],
];

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

  const { data: cap } = await supabase
    .from("voyage_capacity")
    .select("*")
    .eq("voyage_id", voyage.id)
    .maybeSingle();

  const aboard = cap?.aboard ?? 0;
  const left = cap?.berths_left ?? null;
  const boards = new Date(new Date(voyage.starts_at).getTime() - 30 * 60 * 1000).toISOString();
  const paragraphs = (voyage.description ?? voyage.blurb ?? "")
    .split(/\n\n+/)
    .filter(Boolean);
  const faq = FAQS[voyage.class] ?? FAQS.sea;
  const seatsWord = voyage.kind === "salon" ? "seats" : "berths";
  const full = left === 0;

  return (
    <div data-theme={voyage.class}>
      <header className="ev-hero">
        <div className="ev-hero__bg" style={{ background: SEAS[voyage.media] ?? SEAS.dusk }}></div>
        <div className="ls-container ev-hero__in">
          <span className="ls-eyebrow">
            {EVENT_CLASS_LABEL[voyage.class]} · {voyage.kind === "salon" ? "Salon" : "Voyage"}
          </span>
          <h1>{voyage.title}</h1>
          <div className="ev-hero__meta">
            <span>{logDate(voyage.starts_at)}</span>
            <span>·</span>
            <span>{logTime(voyage.starts_at)}</span>
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
          <div className="ev-faq">
            <h3 style={{ fontSize: "var(--text-display-xs)", marginBottom: 12 }}>Asked often.</h3>
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
              {voyage.status === "weather_hold" ? (
                <Badge tone="clay">Weather hold</Badge>
              ) : voyage.status === "live" ? (
                <span className="ls-live ws-live-label">Underway</span>
              ) : full ? (
                <Badge tone="clay">Sailing full</Badge>
              ) : (
                <Badge tone="outline">Berths open</Badge>
              )}
            </div>
            {voyage.status === "weather_hold" ? (
              <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                A hold is a postponement, not a cancellation. The new date arrives by
                the Dispatch, and every reserved berth carries forward in full.
              </p>
            ) : voyage.status === "live" ? (
              <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                This one is on the water. Follow along in the Wardroom, or find the
                next sailing on the manifest.
              </p>
            ) : full ? (
              <>
                <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>
                  Berths release in order — join the waitlist at the gangway and
                  you&rsquo;ll get the word first.
                </p>
                <LinkButton
                  href={`/gangway?next=/voyages/${voyage.slug}`}
                  variant="outline"
                  fullWidth
                >
                  Join the waitlist
                </LinkButton>
              </>
            ) : (
              <LinkButton
                href={`/gangway?next=/voyages/${voyage.slug}`}
                variant="brass"
                fullWidth
              >
                Reserve a berth
              </LinkButton>
            )}
            <p className="ev-mono-note">
              {price(voyage.price_cents)} · {TIER_LABEL[voyage.min_tier]} tier and up
            </p>
          </div>

          <div className="ev-log">
            <div>
              <span>Date</span>
              <span>{logDate(voyage.starts_at)}</span>
            </div>
            <div>
              <span>Boards</span>
              <span>{logTime(boards)}</span>
            </div>
            <div>
              <span>Cast off</span>
              <span>{logTime(voyage.starts_at)}</span>
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
                {left != null ? `${left} OF ${cap?.berths_total ?? voyage.berths_total} LEFT` : voyage.berths_total}
              </span>
            </div>
            <div>
              <span>Tier</span>
              <span>{TIER_LABEL[voyage.min_tier]}+</span>
            </div>
          </div>

          <div className="ev-panel">
            <div className="ev-panel__label">Who&rsquo;s aboard</div>
            {aboard > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <AvatarGroup>
                  {PREVIEW_CREW.slice(0, Math.min(4, aboard)).map(([name, tone]) => (
                    <Avatar key={name} name={name} size="sm" tone={tone} />
                  ))}
                </AvatarGroup>
                <span className="ls-mono-data ws-upper" style={{ color: "var(--text-2)" }}>
                  {aboard} aboard
                </span>
              </div>
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
