import type { Metadata } from "next";
import { Suspense } from "react";
import { CameraConsent } from "./camera-consent";
import { ManifestConsent } from "./manifest-consent";
import Link from "next/link";
import { Avatar, Badge, Button, Stat, StateBlock, ThemeToggle, Wordmark, type LedgerEntry } from "@/components/ds";
import { CURRENCY, knots, LEAGUES } from "@/lib/brand";
import { logDate, logDateTime, logDateYear, roman, yearIn } from "@/lib/format";
import { PushControls } from "@/components/push-controls";
import { PhoneField } from "@/components/phone-field";
import { stripeEnabled } from "@/lib/stripe";
import { qrDataUrl } from "@/lib/commerce-qr";
import {
  STANDING_LABEL,
  STANDING_LINE,
  memberMark,
  type StandingState,
} from "@/lib/membership";
import { getMember } from "../data";
import { SettleCardButton } from "../portal/settle-card";
import { CopyCode } from "../portal/copy-code";
import { KnotsPanel, MintInvite } from "../portal/portal-client";
import { Credential } from "../membership/standing/credential";
import {
  ClosedPlaceNotice,
  ClubHoldNotice,
  DuesHoldNotice,
  NotificationMatrix,
  Offboarding,
  ProfileForm,
  ResumeBanner,
  type HeldPass,
} from "./you-client";
import { readPrefs } from "./prefs";
import { SignOutForm } from "@/components/sign-out-form";
import { InstallPrompt } from "@/components/member/install-prompt";
import { AgreementLists, latestStanding, type StandingRow } from "@/components/member/agreement-rows";
import { RaiseAGathering, type ProposalCard } from "@/components/member/raise-a-gathering";
import { moduleTables } from "@/lib/module-tables";
import "../membership/standing/standing.css";

export const metadata: Metadata = { title: "You" };

/* The rail's contents — the same words the section headings carry, in the same
   order. The install prompt keeps no entry: it renders nothing at all unless
   the browser has an install to offer, and a contents line that leads nowhere
   is worse than a section without one.

   Standing, Agreements, Knots and the invite folded in here on 2026-09-04 —
   they were three pages in a twenty-one-link nav, and each was one screen of
   settings about the same person. Their old addresses still answer and point
   here. */
const SECTIONS: Array<[string, string]> = [
  /* Was "The manifest reads". A manifest is the boarding list for ONE episode,
     and this section is the profile form — no episode is in view and none of
     these fields belong to one. The anchor id is untouched on purpose: it is
     plumbing, and a rename here would break any link already pointing at it. */
  ["you-manifest", "How you read"],
  /* The anchor id is plumbing and stays; the label is the show's own word. */
  ["you-cameras", "The show"],
  ["you-appearance", "Appearance"],
  ["you-word", "The word"],
  ["you-standing", "Standing"],
  ["you-agreements", "Agreements"],
  ["you-knots", "Knots"],
  ["you-invite", "Bring a good one"],
  ["you-gathering", "Raise a gathering"],
  ["you-membership", "Membership"],
  ["you-gangway", "The gangway out"],
];

/* The credential's tone per state, as the standing page set it. */
const STANDING_TONE: Record<StandingState, string> = {
  active: "var(--positive)",
  expiring: "var(--caution)",
  paused: "var(--caution)",
  lapsed: "var(--text-faint)",
  departed: "var(--text-faint)",
};

type LedgerRow = { id: string; created_at: string; reason: string; delta: number };

/* Everything below the name. Behind one boundary, because it is a dozen reads
   and the heading, the hold banners and the rail can paint without them. No
   loading.tsx under (member): the group is redirect-gated and a loading file
   answers 200 before the gate has said its 3xx. */
async function YouBody() {
  const { supabase, user, profile, onHold, zone } = await getMember();
  const nowIso = new Date().toISOString();
  const db = moduleTables(supabase);
  const [
    { data: cities },
    { data: account },
    { data: proposals },
    { data: formats },
    { data: aboard },
    { data: plan },
    { data: pauseUsed },
    { data: pauseCap },
    { data: standingRows },
    { data: counterRows },
    { data: credential },
    { data: knotsBal },
    { data: ledgerRows },
    { data: rewards },
    { data: league },
    { data: invite },
  ] = await Promise.all([
    supabase.from("cities").select("*").order("position", { ascending: true }),
    supabase.from("account_balance").select("*").eq("profile_id", user.id).maybeSingle(),
    /* RLS narrows this to the member's own rows; newest raised, first read. */
    supabase.from("member_event_proposals").select("*").order("created_at", { ascending: false }),
    /* The two shapes a member may raise. series is another
       module's table, reached through the moduleTables seam. */
    db.from("series").select("slug, label").in("slug", ["gathering", "mixer"]).order("position"),
    /* Every pass this member holds. Which of them departing would release is
       decided below against the episode's hour — RLS narrows this to their
       own rows already. */
    supabase.from("passes").select("id, episode_id").eq("profile_id", user.id).eq("status", "aboard"),
    /* The plan is the member's standing. profiles.tier is the geography axis
       and stays on the home-city line; what a member has bought is the plan's
       own label. */
    profile?.plan_id
      ? supabase.from("membership_plans").select("label, guest_allowance").eq("id", profile.plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    /* What the member has left of their own pause allowance. Self-scoped by
       the function itself: it refuses a profile that is not yours unless you
       are staff, so this cannot be asked on anyone else's behalf. */
    supabase.rpc("membership_pause_days_used", { p_profile: user.id }),
    /* pause_days_a_year is the dial guard_the_pause_budget reads. This page
       asked for pause_days_per_year, a twin the 2026-09-04 migration struck as
       "read by nothing" — so the allowance line and the day count in the pause
       dialog vanished for every member while the guard kept enforcing 90. */
    supabase.rpc("club_setting", { p_key: "pause_days_a_year" }),
    /* Agreements: the state is computed, not stored, so a new published
       version moves everyone to out of date the moment it lands. */
    supabase.rpc("signature_standing", { p_profile_id: user.id }),
    /* agreement_standing is a definer view that scopes itself to the caller.
       The eq is belt-and-braces for a staff viewer, whom it does not scope. */
    supabase.from("agreement_standing").select("*").eq("profile_id", user.id),
    /* The rotating credential — the gangway's own code, sixty seconds a turn. */
    db.rpc("issue_member_qr"),
    supabase.from("knots_balance").select("*").eq("profile_id", user.id).maybeSingle(),
    supabase
      .from("knots_ledger")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("rewards").select("*").eq("active", true).order("position", { ascending: true }),
    supabase.from("member_league").select("*").eq("profile_id", user.id).maybeSingle(),
    supabase
      .from("invites")
      .select("*")
      .eq("inviter_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  /* Aboard passes on episodes still ahead: the ones set_own_standing('departed')
     releases with full credit. Listed in the depart dialog before the member
     confirms, so the manifest does not empty behind their back. */
  const aboardEpisodeIds = (aboard ?? []).map((r) => r.episode_id);
  const { data: aheadEpisodes } = aboardEpisodeIds.length
    ? await supabase
        .from("episodes")
        .select("id, title, starts_at, time_zone")
        .in("id", aboardEpisodeIds)
        .gt("starts_at", nowIso)
        .order("starts_at", { ascending: true })
    : { data: [] };
  const heldPasses: HeldPass[] = (aheadEpisodes ?? []).map((v) => ({
    id: v.id,
    title: v.title,
    when: logDateTime(v.starts_at, v.time_zone),
  }));

  const formatLabels = new Map(
    ((formats ?? []) as Array<{ slug: string; label: string }>).map((f) => [f.slug, f.label])
  );

  /* An approved proposal carries the episode the Bridge raised from it. Named
     on the card, with its hour on the city's clock, so "On the calendar"
     points at something. */
  const linkedIds = (proposals ?? [])
    .map((p) => p.episode_id)
    .filter((id): id is string => !!id);
  const { data: linkedEpisodes } = linkedIds.length
    ? await supabase.from("episodes").select("id, title, slug, starts_at, time_zone").in("id", linkedIds)
    : { data: [] };
  const sailingById = new Map(
    (linkedEpisodes ?? []).map((v) => [
      v.id,
      { title: v.title, slug: v.slug, when: logDateTime(v.starts_at, v.time_zone) },
    ])
  );

  const proposalCards: ProposalCard[] = (proposals ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    seriesLabel: p.series ? (formatLabels.get(p.series) ?? p.series) : null,
    proposedFor: p.proposed_for,
    status: p.status,
    decisionNote: p.decision_note,
    sailing: p.episode_id ? (sailingById.get(p.episode_id) ?? null) : null,
  }));

  const status = profile?.status ?? "active";
  const pause = {
    used: typeof pauseUsed === "number" ? pauseUsed : 0,
    cap: typeof pauseCap === "number" ? pauseCap : 0,
  };
  const balanceCents = account?.balance_cents ?? 0;
  const joinedYear = yearIn(profile?.joined_at ?? nowIso, zone);
  const prefs = readPrefs(profile?.notification_prefs);

  /* The plan's own word for what the member holds. A member with no plan on
     file is told so rather than shown a geography. */
  const planLabel = plan?.label ?? null;
  /* Dues waived by the Bridge until a date still ahead. */
  const compedUntil =
    profile?.comped_until && Date.parse(profile.comped_until) > Date.parse(nowIso) ? profile.comped_until : null;

  /* Standing: the state the credential reads, and the code itself. */
  const standingState: StandingState =
    status === "departed" ? "departed" : status === "paused" ? "paused" : "active";
  const first = (Array.isArray(credential) ? credential[0] : credential) as
    | { token: string; expires_at: string }
    | undefined;
  const initialQr = first?.token ? await qrDataUrl(first.token) : null;

  /* Agreements. */
  const agreementRows: StandingRow[] = Array.isArray(standingRows) ? standingRows : [];
  const standingOf = latestStanding(counterRows);
  const outstanding = agreementRows.filter((r) => r.state !== "signed").length;

  /* Knots. The minus is the kit's U+2212, which it colors muted. */
  const knotsBalance = knotsBal?.balance ?? 0;
  const entries: LedgerEntry[] = ((ledgerRows ?? []) as LedgerRow[]).map((r) => ({
    reason: r.reason,
    delta: (r.delta < 0 ? "−" : "+") + knots(Math.abs(r.delta)),
    date: logDate(r.created_at, zone),
  }));
  const leagueName = league?.league_name ?? LEAGUES[0].name;

  return (
    <>
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
          {/* The plan's label, not the geography tier: Regional, National and
              Global are where a member may sail from, and what they hold is
              the plan they pay for. */}
          {planLabel ? <Badge tone="gold">{planLabel}</Badge> : <Badge tone="outline">No plan on file</Badge>}
        </div>
      </div>

      <section id="you-manifest">
        <div className="you-h">How you read</div>
        <div className="you-sec" style={{ padding: 18 }}>
          <ProfileForm
            fullName={profile?.full_name ?? ""}
            handle={profile?.handle ?? ""}
            homeCity={profile?.home_city ?? ""}
            avatarTone={profile?.avatar_tone ?? "ink"}
            cities={(cities ?? []).map((h) => ({ value: h.id, label: h.name }))}
            bio={profile?.bio ?? ""}
            interests={profile?.interests ?? []}
            inDirectory={profile?.in_directory ?? true}
          />
        </div>
      </section>

      <section id="you-cameras">
        <div className="you-h">The show</div>
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
          {/* Every key missing from the stored object reads TRUE at every
              reader — the column default and every trigger coalesce it true —
              so a member who never touched a switch is shown what is actually
              sent. readPrefs holds that rule in one place. */}
          <NotificationMatrix prefs={prefs} phoneVerified={profile?.phone_verified ?? false} />
          <PushControls />
          {/* Weather holds are the one message that must not wait in an inbox. */}
          <PhoneField defaultValue={profile?.phone ?? null} verified={profile?.phone_verified ?? false} />
        </div>
      </section>

      <section id="you-standing">
        <div className="you-h">Standing</div>
        <div className="you-sec" style={{ padding: 18 }}>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", maxWidth: "52ch" }}>
            One card, two media. The printed one is static and gate-checked; this
            one rotates. Both carry the same number, and the number stays yours
            through a pause.
          </p>
          <div className="crd-card crd-card--wide std-card" style={{ marginTop: 16 }}>
            <div className="std-card__id">
              <Wordmark size="sm" suffix="Hinged" inverse />
              <span className="std-card__no">Member {memberMark(profile?.member_no)}</span>
              <span className="std-card__name">{profile?.full_name ?? "A member"}</span>
              <span className="std-card__est">Est. {roman(joinedYear)}</span>
            </div>
            <Credential initialQr={initialQr} initialExpiry={first?.expires_at ?? null} />
          </div>
          <div className="std-state" style={{ ["--std-tone" as string]: STANDING_TONE[standingState], marginTop: 16 }}>
            <span className="std-state__name">{STANDING_LABEL[standingState]}</span>
            <p className="std-state__line">{STANDING_LINE[standingState]}</p>
            {pause.cap > 0 ? (
              <p className="std-state__budget">
                {pause.used} of {pause.cap} pause days used this year. The club stops a
                pause that would run past the allowance, and says so.
              </p>
            ) : null}
            <Link className="std-state__link" href="#you-gangway">
              Pause or resume below
            </Link>
          </div>
        </div>
      </section>

      <section id="you-agreements">
        <div className="you-h">Agreements</div>
        <div className="you-sec" style={{ padding: 18 }}>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", maxWidth: "58ch" }}>
            Each one is kept with the exact wording you agreed to and the date you
            agreed to it. When the wording changes, you&rsquo;ll be asked again — the
            old copy stays as it was.
          </p>
          {outstanding > 0 ? (
            <p role="status" style={{ marginTop: 12, font: "var(--type-heading)", color: "var(--caution)" }}>
              {outstanding === 1 ? "One agreement needs your signature." : `${outstanding} agreements need your signature.`}
            </p>
          ) : null}
          {agreementRows.length === 0 ? (
            <StateBlock
              status="empty"
              icon="FilePenLine"
              bare
              title="Nothing to sign yet."
              detail="Agreements land here when an episode calls for one. Nothing is waiting on you."
            />
          ) : (
            <div style={{ marginTop: 12 }}>
              <AgreementLists rows={agreementRows} standingOf={standingOf} zone={zone} />
            </div>
          )}
        </div>
      </section>

      <section id="you-knots">
        <div className="you-h">Knots</div>
        <div className="you-sec" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <Stat label={CURRENCY.name} value={knots(knotsBalance)} sub="MORE KNOTS, FARTHER WATER" />
            <div>
              <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{leagueName}</div>
              <p className="mbr-mono" style={{ marginTop: 4 }}>
                MEMBER SINCE {roman(joinedYear)} — LEAGUES ONLY DEEPEN
              </p>
            </div>
          </div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", marginTop: 12, maxWidth: "46ch" }}>
            Knots are earned under sail, ashore, and by bringing good people. {CURRENCY.line}
          </p>
          {entries.length === 0 && (rewards ?? []).length === 0 ? (
            <StateBlock
              status="empty"
              icon="Anchor"
              bare
              title="A clean slate."
              detail="Your first entry lands when you step aboard. The rewards shelf is being restocked."
            />
          ) : (
            <div style={{ marginTop: 16 }}>
              <KnotsPanel
                onHold={onHold}
                balance={knotsBalance}
                entries={entries}
                rewards={(rewards ?? []).map((r) => ({
                  id: r.id,
                  name: r.name,
                  cost: knots(r.cost_fm),
                  costValue: r.cost_fm,
                }))}
              />
            </div>
          )}
        </div>
      </section>

      <section id="you-invite">
        <div className="you-h">Bring a good one</div>
        <div className="you-sec" style={{ padding: 18 }}>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", marginBottom: 14 }}>
            Good for one night ashore as your guest. The rest is on them.
          </p>
          {invite ? (
            <>
              <CopyCode code={invite.code} />
              <p className="mbr-mono" style={{ marginTop: 10 }}>
                {invite.uses} OF {invite.max_uses} SIGNATURES OUT
              </p>
            </>
          ) : (
            <MintInvite />
          )}
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
              <b>{planLabel ?? "No plan on file"}</b>
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
                {compedUntil ? ` · COMPLIMENTARY UNTIL ${logDateYear(compedUntil, zone)}` : ""}
              </p>
              {plan ? (
                <p className="mbr-mono" style={{ marginTop: 4 }}>
                  {plan.guest_allowance > 0
                    ? `${plan.guest_allowance} GUEST${plan.guest_allowance === 1 ? "" : "S"} PER PASS`
                    : "NO GUEST PASSES ON THIS PLAN"}
                </p>
              ) : null}
            </div>
            <Link href="/account" className="ls-btn ls-btn--outline ls-btn--sm">
              Manage membership
            </Link>
          </div>
          {balanceCents < 0 && stripeEnabled() ? (
            <div className="you-row">
              <div>
                <b>Settle the account</b>
                <p>Card payments post to the ledger when the card clears.</p>
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
            <Offboarding status={status} heldPasses={heldPasses} pause={pause} />
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
    </>
  );
}

export default async function YouPage() {
  const { profile } = await getMember();
  const status = profile?.status ?? "active";
  /* set_own_standing refuses a member who tries to lift a hold they did not
     place. The interface should not offer them the button. */
  const heldByTheClub = status === "paused" && profile?.status_set_by !== profile?.id;

  return (
    <div className="you-page">
      <div className="you-col">
      <div>
        {/* Name in the h1, editorial line in the eyebrow — see the note on
            Account. The nav says You and so must the heading. */}
        <span className="mbr-eyebrow">The ship&apos;s papers</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          You.
        </h1>
      </div>

      {/* Three different states, three different exits. A departed member used
          to see none of these while the layout banner told them to resume here,
          and a member the club had held could see a Resume button that would
          only ever refuse them. */}
      {/* A dues hold is read before the generic club hold: it is the club's,
          but a payment lifts it, so the door it points at is the account page
          and not Shoreside's inbox. */}
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

      <Suspense
        fallback={
          <div className="you-sec" style={{ marginTop: 0 }}>
            <StateBlock status="loading" bare />
          </div>
        }
      >
        <YouBody />
      </Suspense>
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
