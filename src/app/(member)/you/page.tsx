import type { Metadata } from "next";
import { CameraConsent } from "./camera-consent";
import { ManifestConsent } from "./manifest-consent";
import Link from "next/link";
import { Avatar, Badge, Button, ThemeToggle } from "@/components/ds";
import { TIER_LABEL, logDateTime, roman } from "@/lib/format";
import { PushControls } from "@/components/push-controls";
import { PhoneField } from "@/components/phone-field";
import { stripeEnabled } from "@/lib/stripe";
import { memberMark } from "@/lib/membership";
import { getMember } from "../data";
import { SettleCardButton } from "../portal/settle-card";
import {
  ClosedPlaceNotice,
  ClubHoldNotice,
  DuesHoldNotice,
  NotificationPrefsForm,
  Offboarding,
  ProfileForm,
  ResumeBanner,
  type HeldPass,
} from "./you-client";
import { SignOutForm } from "@/components/sign-out-form";
import { InstallPrompt } from "@/components/member/install-prompt";
import { RaiseAGathering, type ProposalCard } from "@/components/member/raise-a-gathering";
import { moduleTables } from "@/lib/module-tables";

export const metadata: Metadata = { title: "You" };

/* The rail's contents — the same words the section headings carry, in the same
   order. The install prompt keeps no entry: it renders nothing at all unless
   the browser has an install to offer, and a contents line that leads nowhere
   is worse than a section without one. */
const SECTIONS: Array<[string, string]> = [
  ["you-manifest", "The manifest reads"],
  ["you-cameras", "The cameras"],
  ["you-appearance", "Appearance"],
  ["you-word", "The word"],
  ["you-gathering", "Raise a gathering"],
  ["you-membership", "Membership"],
  ["you-gangway", "The gangway out"],
];

export default async function YouPage() {
  const { supabase, user, profile } = await getMember();
  const nowIso = new Date().toISOString();
  const [{ data: harbors }, { data: account }, { data: proposals }, { data: formats }, { data: aboard }] =
    await Promise.all([
      supabase.from("harbors").select("*").order("position", { ascending: true }),
      supabase.from("account_balance").select("*").eq("profile_id", user.id).maybeSingle(),
      /* RLS narrows this to the member's own rows; newest raised, first read. */
      supabase
        .from("member_event_proposals")
        .select("*")
        .order("created_at", { ascending: false }),
      /* The two shapes a member may raise. activity_formats is another
         module's table, reached through the moduleTables seam. */
      moduleTables(supabase)
        .from("activity_formats")
        .select("slug, label")
        .in("slug", ["gathering", "mixer"])
        .order("position"),
      /* Every pass this member holds. Which of them departing would release is
         decided below against the sailing's hour — RLS narrows this to their
         own rows already. */
      supabase.from("rsvps").select("id, voyage_id").eq("profile_id", user.id).eq("status", "aboard"),
    ]);

  /* Aboard passes on sailings still ahead: the ones set_own_standing('departed')
     releases with full credit. Listed in the depart dialog before the member
     confirms, so the manifest does not empty behind their back. */
  const aboardVoyageIds = (aboard ?? []).map((r) => r.voyage_id);
  const { data: aheadVoyages } = aboardVoyageIds.length
    ? await supabase
        .from("voyages")
        .select("id, title, starts_at, time_zone")
        .in("id", aboardVoyageIds)
        .gt("starts_at", nowIso)
        .order("starts_at", { ascending: true })
    : { data: [] };
  const heldPasses: HeldPass[] = (aheadVoyages ?? []).map((v) => ({
    id: v.id,
    title: v.title,
    when: logDateTime(v.starts_at, v.time_zone),
  }));

  const formatLabels = new Map(
    ((formats ?? []) as Array<{ slug: string; label: string }>).map((f) => [f.slug, f.label])
  );

  /* An approved proposal carries the sailing the Bridge raised from it. Named
     on the card, with its hour on the harbour's clock, so "On the calendar"
     points at something. */
  const linkedIds = (proposals ?? [])
    .map((p) => p.voyage_id)
    .filter((id): id is string => !!id);
  const { data: linkedVoyages } = linkedIds.length
    ? await supabase.from("voyages").select("id, title, slug, starts_at, time_zone").in("id", linkedIds)
    : { data: [] };
  const sailingById = new Map(
    (linkedVoyages ?? []).map((v) => [
      v.id,
      { title: v.title, slug: v.slug, when: logDateTime(v.starts_at, v.time_zone) },
    ])
  );

  const proposalCards: ProposalCard[] = (proposals ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    formatLabel: p.format ? (formatLabels.get(p.format) ?? p.format) : null,
    proposedFor: p.proposed_for,
    status: p.status,
    decisionNote: p.decision_note,
    sailing: p.voyage_id ? (sailingById.get(p.voyage_id) ?? null) : null,
  }));

  const tier = profile?.tier ?? "regional";
  const status = profile?.status ?? "active";
  /* set_own_standing refuses a member who tries to lift a hold they did not
     place. The interface should not offer them the button. */
  const heldByTheClub = status === "paused" && profile?.status_set_by !== profile?.id;
  const balanceCents = account?.balance_cents ?? 0;
  const joinedYear = profile?.joined_at
    ? new Date(profile.joined_at).getFullYear()
    : new Date().getFullYear();

  const prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
  const prefOn = (key: string, fallback: boolean) =>
    typeof prefs[key] === "boolean" ? (prefs[key] as boolean) : fallback;

  return (
    <div className="you-page">
      <div className="you-col">
      <div>
        <span className="mbr-eyebrow">You</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          The ship&apos;s papers.
        </h1>
      </div>

      {/* Three different states, three different exits. A departed member used
          to see none of these while the layout banner told them to resume here,
          and a member the club had held could see a Resume button that would
          only ever refuse them. */}
      {/* A dues hold is read before the generic club hold: it is the club's,
          but a payment lifts it, so the door it points at is the portal and
          not Shoreside's inbox. */}
      {status === "departed" ? (
        <ClosedPlaceNotice />
      ) : status === "paused" ? (
        profile?.hold_reason === "dues" ? (
          <DuesHoldNotice />
        ) : heldByTheClub ? (
          <ClubHoldNotice />
        ) : (
          <ResumeBanner />
        )
      ) : null}

      <div className="you-sec" style={{ marginTop: 0 }}>
        <div className="you-row">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar
              name={profile?.full_name ?? "A member"}
              tone={(profile?.avatar_tone ?? "ink") as "ink" | "sea" | "gold" | "sand"}
              size="lg"
              ring
            />
            <div>
              {/* A member's own name, so sentence case — which puts it below
                  Anton's 22px floor, where the type system says Archivo 700. */}
              <b style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "var(--text-lg)" }}>
                {profile?.full_name ?? "A member"}
              </b>
              {profile?.handle ? (
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-2)", marginTop: 2 }}>
                  @{profile.handle}
                </p>
              ) : null}
              <p className="mbr-mono" style={{ marginTop: 4 }}>
                {memberMark(profile?.member_no) || "UNISSUED"} · MEMBER SINCE {roman(joinedYear)}
              </p>
            </div>
          </div>
          <Badge tone="gold">{TIER_LABEL[tier]}</Badge>
        </div>
      </div>

      <section id="you-manifest">
        <div className="you-h">The manifest reads</div>
        <div className="you-sec" style={{ padding: 18 }}>
          <ProfileForm
            fullName={profile?.full_name ?? ""}
            handle={profile?.handle ?? ""}
            homeHarbor={profile?.home_harbor ?? ""}
            avatarTone={profile?.avatar_tone ?? "ink"}
            harbors={(harbors ?? []).map((h) => ({ value: h.id, label: h.name }))}
            bio={profile?.bio ?? ""}
            interests={profile?.interests ?? []}
            inDirectory={profile?.in_directory ?? true}
          />
        </div>
      </section>

      <section id="you-cameras">
        <div className="you-h">The cameras</div>
        <div className="you-sec">
          <CameraConsent onCamera={profile?.on_camera ?? true} />
          <ManifestConsent onManifest={profile?.on_manifest ?? true} />
        </div>
      </section>

      {/* Renders nothing until the browser offers an install, and nothing at
          all when the app is already on the home screen or the member said
          not now. The heading lives inside the component for that reason. */}
      <InstallPrompt />

      <section id="you-appearance">
        <div className="you-h">Appearance</div>
        <div className="you-sec">
          <div className="you-row">
            <div>
              <b>Theme</b>
              <p>Dark, light, or follow the sky.</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </section>

      <section id="you-word">
        <div className="you-h">The word</div>
        <div className="you-sec">
          {/* fathoms unset reads TRUE: the column default and every trigger
              that sends the word coalesce it true, so a member who never
              touched the switch was being told it was off while the word
              kept arriving. The screen now agrees with what is sent. */}
          <NotificationPrefsForm
            weather={prefOn("weather", true)}
            berths={prefOn("berths", true)}
            fathoms={prefOn("fathoms", true)}
            digest={prefOn("digest", true)}
          />
          <PushControls />
          {/* Weather holds are the one message that must not wait in an inbox. */}
          <PhoneField defaultValue={profile?.phone ?? null} verified={profile?.phone_verified ?? false} />
        </div>
      </section>

      <section id="you-gathering">
        <div className="you-h">Raise a gathering</div>
        <div className="you-sec" style={{ padding: 18 }}>
          <RaiseAGathering
            formats={((formats ?? []) as Array<{ slug: string; label: string }>).map((f) => ({
              value: f.slug,
              label: f.label,
            }))}
            proposals={proposalCards}
          />
        </div>
      </section>

      <section id="you-membership">
        <div className="you-h">Membership</div>
        <div className="you-sec">
          <div className="you-row">
            <div>
              <b>{TIER_LABEL[tier]} tier</b>
              <p className="mbr-mono" style={{ marginTop: 4 }}>
                {status === "paused"
                  ? profile?.hold_reason === "dues"
                    ? "HELD — DUES LAPSED · "
                    : "PAUSED · "
                  : ""}
                {balanceCents < 0 ? (
                  <span style={{ color: "var(--siren)" }}>
                    ACCOUNT — ${(Math.abs(balanceCents) / 100).toFixed(2)} DUE
                  </span>
                ) : (
                  "ACCOUNT — SETTLED"
                )}
              </p>
            </div>
            <Link href="/portal" className="ls-btn ls-btn--outline ls-btn--sm">
              Manage membership
            </Link>
          </div>
          {balanceCents < 0 && stripeEnabled() ? (
            <div className="you-row">
              <div>
                <b>Settle the account</b>
                <p>Card payments post to the ledger when the processor confirms.</p>
              </div>
              <SettleCardButton
                amountLabel={`$${(Math.abs(balanceCents) / 100).toFixed(2)}`}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section id="you-gangway">
        <div className="you-h">The gangway out</div>
        <div className="you-sec">
          <div className="you-row">
            <div>
              <b>Pause or depart</b>
              <p>No exit surveys, no retention calls, no games.</p>
            </div>
            <Offboarding status={status} heldPasses={heldPasses} />
          </div>
          <div className="you-row">
            <div>
              <b>Sign out</b>
              <p>This device only.</p>
            </div>
            <SignOutForm>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </SignOutForm>
          </div>
        </div>
      </section>
      </div>

      {/* The contents, in the gutter the 720px column was already leaving
          empty. Above 960 only — below it the rail is gone and the sections
          stay stacked in the order they are read. */}
      <nav className="you-rail" aria-label="On this page">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}
