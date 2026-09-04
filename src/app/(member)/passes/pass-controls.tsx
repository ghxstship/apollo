"use client";

import React from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Input,
  Select,
  Stepper,
  Switch,
  Tag,
  Toast,
} from "@/components/ds";
import { price } from "@/lib/format";
import { SEGMENTS, SEGMENT_CHOICE, type Segment } from "@/lib/vetting";
import { OfferClock } from "@/components/member/offer-clock";
import { claimYourPlace, leaveTheLine } from "../vetting/actions";
import {
  chooseCabin,
  claimDaybed,
  confirmBerth,
  improvePass,
  releasePass,
  requestAPlace,
  setGuests,
  setPassStatus,
  takeStandby,
} from "./actions";
import {
  CrewCall,
  GuestStubs,
  HandOff,
  PromoField,
  WaitlistClaim,
  type AppliedPromo,
  type CrewSeeker,
  type GuestStub,
  type MemberOption,
  type StandingOffer,
} from "./pass-extras";

export type AddonOption = { id: string; name: string; price_cents: number };

/* The bow daybed as the club_products row states it — price, how many it
   seats, how many go per episode. Null when the water does not carry one. */
export type DaybedOffer = { priceCents: number; cap: number; party: number };

/* The member's standing in the numbered line on a by-request episode. Never a
   number: the Bridge decides, and the door says requested or offered. */
export type RequestState = {
  entryId: string;
  /* A live offer — written, not claimed, not released, not yet lapsed. */
  offered: boolean;
  claimExpiresAt: string | null;
  /* The lapse hour on the member's clock, formatted shoreside. */
  claimUntilLabel: string | null;
};

/* The release window is the club's own figure (club_setting
   'release_credit_hours'), so the policy line reads it rather than saying 48. */
function policyLine(hours: number): string {
  return `Weather holds are called by 18:00 the night before. Release your pass more than ${hours} hours out for full credit — it goes to the waitlist in order.`;
}

/* The lock's default door — every lock but the missing-city one. The portal
   folded into You on 2026-09-04; a plan is changed on the account page. */
const MANAGE_MEMBERSHIP = { href: "/account", label: "Manage membership" };

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  padding: "8px 0",
  borderTop: "1px solid var(--line-faint)",
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

/* Small counts in words, the way the daybed line always read them. */
const WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/* "the pass, the deposit and the bow daybed" — a list that reads as prose. */
function prose(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* One name slot per guest, sized to the count. */
function sizeNames(count: number, base: string[]): string[] {
  return Array.from({ length: count }, (_, i) => base[i] ?? "");
}

function GuestNameInputs({
  names,
  onChange,
}: {
  names: string[];
  onChange: (index: number, value: string) => void;
}) {
  return (
    <>
      {names.map((name, i) => (
        <Input
          key={i}
          label={
            names.length > 1
              ? `Guest ${i + 1} — as the manifest reads it`
              : "Guest name — as the manifest reads it"
          }
          required
          value={name}
          onChange={(e) => onChange(i, e.target.value)}
          style={{ marginTop: 10 }}
        />
      ))}
    </>
  );
}

export function PassControls({
  episodeId,
  voyageTitle,
  myStatus,
  guests,
  guestNames,
  passesLeft,
  weatherHold,
  locked,
  lockedNote,
  lockedLink = MANAGE_MEMBERSHIP,
  windowNote,
  recommended,
  priceCents,
  creditLeftCents = 0,
  depositRequired,
  depositCents,
  addons,
  attachedAddonIds,
  addonWindowOpen,
  knotsOnCompletion,
  fullCredit,
  creditHours,
  boardingCode,
  passId,
  waitlistPosition,
  autoClaim,
  members,
  standingOffer,
  guestStubs,
  partner,
  cabins,
  cabinId,
  crewMine,
  crewSeekers,
  splitOffered,
  guestsAllowed,
  guestAllowance,
  standby,
  standbyOpen,
  byRequest,
  request,
  claimHours,
  daybedHeld,
  daybed,
  paused,
  composition,
  enquiryHref,
  inviteOnly,
}: {
  episodeId: string;
  voyageTitle: string;
  /* Guest passes ride on paid plans — membership_plans.guest_allowance > 0.
     The control is hidden otherwise rather than offered and refused at submit. */
  guestsAllowed: boolean;
  /* The plan's own number: the stepper's ceiling and every sentence about
     guests. The guard reads the same column. */
  guestAllowance: number;
  /* This pass is a standby pass — outside the count, boards into a free seat. */
  standby: boolean;
  /* The episode sells standby passes and the manifest is full, so the door
     may offer one. Whether standby itself is full is the guard's to say. */
  standbyOpen: boolean;
  /* Places are requested and the Bridge decides — the door never says a
     number, and no pass is claimed until an offer stands. */
  byRequest: boolean;
  request: RequestState | null;
  /* club_setting('waitlist_claim_hours') — how long an offer stands. Null
     when the setting could not be read; the copy then says "the window" and
     never a typed number. */
  claimHours: number | null;
  myStatus: "aboard" | "waitlist" | "not_going" | null;
  guests: number;
  guestNames: string[];
  passesLeft: number;
  weatherHold: boolean;
  locked: boolean;
  lockedNote: string;
  /* Where the lock sends the member. Most locks are a membership question and
     go to the portal; a Regional member with no home city chosen is sent to
     their page, where the picker is. */
  lockedLink?: { href: string; label: string };
  /* Set when the plan's booking window or the drop hour hasn't opened yet —
     replaces the CTA. */
  windowNote: string | null;
  recommended: boolean;
  priceCents: number;
  /* This month's unspent plan credit. The database draws it down against the
     pass, deposit and add-ons together, so the dialog says so before the
     member confirms rather than after the statement does. */
  creditLeftCents?: number;
  depositRequired: boolean;
  /* The episode's own figure — episodes.deposit_cents, no longer club-wide. */
  depositCents: number;
  addons: AddonOption[];
  attachedAddonIds: string[];
  /* Add-ons may be added until 18:00 the night before departure. */
  addonWindowOpen: boolean;
  knotsOnCompletion: number | null;
  /* Computed shoreside: more than creditHours out at render time. */
  fullCredit: boolean;
  /* club_setting('release_credit_hours') — the window the copy names. */
  creditHours: number;
  boardingCode: string | null;
  /* — ticketing polish — */
  passId: string | null;
  /* Place in the waitlist for this episode, 1 = next. */
  waitlistPosition: number | null;
  autoClaim: boolean;
  /* Active members other than you, for a hand-off. */
  members: MemberOption[];
  /* A hand-off you have already offered on this pass. */
  standingOffer: StandingOffer | null;
  /* Guest stubs cut by the manifest once names are saved — companions only. */
  guestStubs: GuestStub[];
  /* The second head on a couple pass. Not a companion: it never counts toward
     `guests` and the stepper never touches it. */
  partner: GuestStub | null;
  cabins: Array<{ id: string; name: string; premiumCents: number; left: number }>;
  cabinId: string | null;
  /* Your own open crew request on this episode. */
  crewMine: CrewSeeker | null;
  /* Other members looking for crew — shown once you are aboard. */
  crewSeekers: CrewSeeker[];
  /* Set shoreside when the club can carry split draws on this pass. */
  splitOffered: boolean;
  /* True when a bow daybed already rides on this pass. */
  daybedHeld: boolean;
  /* The daybed on offer, from club_products; null when this water has none. */
  daybed: DaybedOffer | null;
  /* profile.status !== 'active'. passes UPDATE is refused for a paused member
     (WITH CHECK is_active()), so every control that would update is disabled
     with the one line that says why. Release is a DELETE and still works. */
  paused: boolean;
  /* An episode with segment caps — its door is the vetting page. Nothing here
     may upsert an rsvp without a segment. */
  composition: boolean;
  /* Set when the format is on request: the door is an enquiry, not a pass. */
  enquiryHref: string | null;
  /* Set when the format is by invitation — no door on this page at all. */
  inviteOnly: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [offerWaitlist, setOfferWaitlist] = React.useState(false);
  const [checkout, setCheckout] = React.useState(false);
  const [releasing, setReleasing] = React.useState(false);
  const [improving, setImproving] = React.useState(false);
  const [claimingDaybed, setClaimingDaybed] = React.useState(false);
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());
  const [improveChosen, setImproveChosen] = React.useState<Set<string>>(new Set());
  /* Checkout guest party — local until the pass is confirmed. */
  const [coGuests, setCoGuests] = React.useState(0);
  const [coNames, setCoNames] = React.useState<string[]>([]);
  /* Aboard-row guest edit: growing the party prompts for the new names. */
  const [guestEdit, setGuestEdit] = React.useState<{ count: number; names: string[] } | null>(
    null
  );
  /* A code checked against the Bridge's list — re-checked on confirm. */
  const [promo, setPromo] = React.useState<AppliedPromo | null>(null);
  /* Draws chosen at review — null is the whole thing, today. */
  const [split, setSplit] = React.useState<number | null>(null);
  /* Review opened for a standby pass rather than a seat. */
  const [coStandby, setCoStandby] = React.useState(false);
  /* The seat a by-request ask is for — the line is numbered per segment. */
  const [segment, setSegment] = React.useState<Segment | null>(null);
  /* One line of receipt, said once and gone. */
  const [toast, setToast] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const run = (fn: () => Promise<{ error?: string; full?: boolean }>, after?: () => void) => {
    setError(null);
    setOfferWaitlist(false);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        if (res.full) setOfferWaitlist(true);
      } else if (after) {
        after();
      }
    });
  };

  /* A deposit of nothing is not a deposit — the row is hidden rather than
     shown as "$0", and adds nothing to the total either way. */
  const depositDue = depositRequired && depositCents > 0;
  const needsReview = priceCents > 0 || depositDue;
  const checkoutNames = sizeNames(coGuests, coNames);
  const namesMissing = checkoutNames.some((n) => !n.trim());
  const qty = 1 + coGuests;
  const addonTotal = addons
    .filter((a) => chosen.has(a.id))
    .reduce((sum, a) => sum + a.price_cents * qty, 0);
  /* A code trims the pass alone — the deposit and add-ons stand. */
  const passDue = promo ? promo.passCents : priceCents;
  const total = passDue + (depositDue ? depositCents : 0) + addonTotal;

  /* Split it — anything over $200 may be drawn in 2, 3, or 4 goes. The first
     draw is today; the rest come monthly, at no interest. */
  const splitEligible = splitOffered && total > 20000;
  const splitDraws = splitEligible && split ? split : null;
  const perDraw = splitDraws ? Math.floor(total / splitDraws) : 0;
  const dueToday = splitDraws ? total - perDraw * (splitDraws - 1) : total;
  /* What the credit will cover of this booking. Shown against the account
     figure only — a split is built server-side off the ledger charge. */
  const creditApplied = Math.min(creditLeftCents, total);

  const unattached = addons.filter((a) => !attachedAddonIds.includes(a.id));
  const aboardQty = 1 + guests;
  const improveTotal = unattached
    .filter((a) => improveChosen.has(a.id))
    .reduce((sum, a) => sum + a.price_cents * aboardQty, 0);

  /* The cabin premium riding on this pass, if a premium cabin was chosen. */
  const cabinPremiumCents = cabins.find((c) => c.id === cabinId)?.premiumCents ?? 0;

  /* What goes with the pass inside the window — named, not implied. */
  const forfeits = [
    "the pass",
    depositDue ? `the ${money(depositCents)} deposit` : null,
    daybedHeld ? "the bow daybed" : null,
    cabinPremiumCents > 0 ? `the ${money(cabinPremiumCents)} cabin premium` : null,
  ].filter((f): f is string => !!f);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) => {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAddon = toggle(setChosen);
  const toggleImprove = toggle(setImproveChosen);

  const openCheckout = (asStandby = false) => {
    setError(null);
    setOfferWaitlist(false);
    setCoGuests(guests);
    setCoNames(guestNames);
    setPromo(null);
    setSplit(null);
    setCoStandby(asStandby);
    setCheckout(true);
  };

  /* Take a standby pass: reviewed like any priced pass, straight in when free. */
  const takeStandbyPass = () =>
    needsReview ? openCheckout(true) : run(() => takeStandby(episodeId));

  /* The door on a full manifest, offered wherever the guard has just said
     "full": the waitlist, and a standby pass when the episode sells one. */
  const fullDoors = (onWaitlist?: () => void) => (
    <>
      {" "}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setPassStatus(episodeId, "waitlist"), onWaitlist)}
      >
        Join the waitlist
      </Button>
      {standbyOpen ? (
        <>
          {" "}
          <Button variant="ghost" size="sm" disabled={pending} onClick={takeStandbyPass}>
            Take a standby pass
          </Button>
        </>
      ) : null}
    </>
  );

  const onGuestStep = (n: number) => {
    if (n <= guests) {
      /* Shrinking the party — truncate the names to match. */
      run(() => setGuests(episodeId, n, guestNames.slice(0, n)));
    } else {
      /* Growing it — ask for the new names before writing. */
      setError(null);
      setGuestEdit({ count: n, names: sizeNames(n, guestNames) });
    }
  };

  const errorBlock = (onWaitlist?: () => void) =>
    error ? (
      <p className="voy-hold" role="alert" style={{ marginTop: 10 }}>
        {error}
        {offerWaitlist ? fullDoors(onWaitlist) : null}
      </p>
    ) : null;

  const pausedLine = `Your membership is paused — resume it on the You page to change this pass. Release still works, and the ${creditHours}-hour clock is running.`;

  /* A lock governs claiming a NEW pass. It must never swallow one the member
     already holds — otherwise a waitlister cannot see their place or leave the
     list, and a member who puts their own membership on hold loses the Release
     control while the credit window runs out on them. When there is a pass on
     this episode, the note rides alongside the standing instead. */
  const holdsAPass = myStatus === "aboard" || myStatus === "waitlist";
  /* A live offer on a by-request episode. */
  const offerLive = !!request?.offered && !!request.claimExpiresAt;
  if (locked && !holdsAPass) {
    return (
      <div className="voy-foot">
        <span className="voy-lock">
          {lockedNote} <Link href={lockedLink.href}>{lockedLink.label}</Link>
        </span>
      </div>
    );
  }

  const dialogOpen = checkout || improving || !!guestEdit || releasing || claimingDaybed;

  return (
    <div className="voy-foot">
      {locked ? (
        <span className="voy-lock" style={{ flexBasis: "100%" }}>
          {/* One line for a paused member, in place of the lock's own: it
              names what still works and the clock that is running. */}
          {paused ? pausedLine : lockedNote}
        </span>
      ) : null}
      {weatherHold ? (
        <>
          <Badge tone="caution">Weather hold</Badge>
          <span className="voy-hold" style={holdsAPass ? { flexBasis: "100%" } : undefined}>
            Held for weather. We call it by 18:00 the night before.
          </span>
        </>
      ) : null}
      {weatherHold && !holdsAPass ? null : myStatus === "aboard" ? (
        <>
          {/* A standby pass is aboard in the record and outside the count on
              the water; the badge says which, and the release rules are the
              same either way. */}
          {standby ? <Badge tone="caution">Standby</Badge> : <Badge tone="positive">Aboard</Badge>}
          {standby ? (
            <span className="voy-hold" style={{ flexBasis: "100%" }}>
              You board if a seat comes free by muster. If none does, the pass releases and credits in full.
            </span>
          ) : null}
          {guestsAllowed ? (
            <>
              <span className="mbr-mono">GUESTS · UP TO {guestAllowance} ON YOUR PLAN</span>
              {/* Pinned to the current count while paused — the stepper has
                  no disabled prop, and a range of one is the same thing. */}
              <Stepper
                size="sm"
                min={paused ? guests : 0}
                max={paused ? guests : guestAllowance}
                value={guests}
                onChange={onGuestStep}
              />
            </>
          ) : null}
          {boardingCode ? (
            <Link href={`/stub/${boardingCode}`} className="ls-btn ls-btn--outline ls-btn--sm">
              Boarding stub
            </Link>
          ) : null}
          <span className="voy-foot__spacer"></span>
          {/* A standing offer stays visible to be withdrawn; a fresh one is
              not offered while paused. */}
          {standingOffer || !paused ? (
            <HandOff
              passId={passId}
              voyageTitle={voyageTitle}
              members={members}
              offer={standingOffer}
            />
          ) : passId ? (
            <Button variant="ghost" size="sm" disabled>
              Hand it to a member
            </Button>
          ) : null}
          {addonWindowOpen && unattached.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || paused}
              onClick={() => {
                setError(null);
                setImproveChosen(new Set());
                setImproving(true);
              }}
            >
              Improve your pass
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              setReleasing(true);
            }}
          >
            Release pass
          </Button>
          <GuestStubs guests={guestStubs} partner={partner} />
          {cabins.length > 0 ? (
            <Select
              label="Your cabin"
              defaultValue={cabinId ?? ""}
              disabled={paused || pending}
              style={{ marginTop: 14, width: "100%" }}
              onChange={(e) => {
                const v = e.target.value || null;
                /* Refusals land in the card's own error line, not a browser
                   alert the page cannot style or a reader cannot find again. */
                run(() => chooseCabin(episodeId, v));
              }}
            >
              <option value="">Assigned at the dock</option>
              {cabins.map((c) => (
                <option key={c.id} value={c.id} disabled={c.left <= 0 && c.id !== cabinId}>
                  {c.name}
                  {c.premiumCents > 0 ? ` — +$${(c.premiumCents / 100).toFixed(0)}` : ""}
                  {c.left <= 0 && c.id !== cabinId ? " — taken" : ""}
                </option>
              ))}
            </Select>
          ) : null}
          {/* — The bow daybed. One claim per pass, the cap per episode — the
              RPC holds both lines and answers refusals in its own voice. The
              figures are the product's own; the block is absent off Sea. */}
          {passId && daybed ? (
            <div style={{ marginTop: 14 }}>
              <span className="mbr-mono" style={{ display: "block", marginBottom: 6 }}>
                BOW DAYBED
              </span>
              {daybedHeld ? (
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>
                  Bow daybed held — the steward knows your name
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span className="mbr-mono" style={{ fontSize: 12 }}>
                    {price(daybed.priceCents)} · group of {countWord(daybed.party)} ·{" "}
                    {countWord(daybed.cap)} per episode
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending || paused}
                    onClick={() => {
                      setError(null);
                      setClaimingDaybed(true);
                    }}
                  >
                    Claim the daybed
                  </Button>
                </span>
              )}
            </div>
          ) : null}
          {crewSeekers.length > 0 || crewMine ? (
            <CrewCall
              episodeId={episodeId}
              mine={crewMine}
              seekers={crewSeekers}
              canPost={false}
            />
          ) : null}
        </>
      ) : myStatus === "waitlist" ? (
        <>
          <Badge tone="outline">Waitlisted</Badge>
          <span className="voy-foot__spacer"></span>
          {/* Auto-claim off means first come, first aboard — so a pass that
              has freed needs a button, and this is it. A priced pass still
              goes through Review & confirm. Never on a composition episode,
              whose seat is taken with a segment on the vetting page. */}
          {!autoClaim && !composition && passesLeft > 0 ? (
            <Button
              variant="gold"
              size="sm"
              disabled={pending || paused}
              onClick={() =>
                needsReview ? openCheckout() : run(() => setPassStatus(episodeId, "aboard"))
              }
            >
              Confirm your pass
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => releasePass(episodeId))}
          >
            Leave the waitlist
          </Button>
          {paused ? (
            /* The switch is an passes UPDATE, refused while paused — shown as
               it stands, and not offered. */
            <div style={{ width: "100%", marginTop: 4 }}>
              {waitlistPosition != null ? (
                <span className="mbr-mono" style={{ display: "block", marginTop: 6 }}>
                  {waitlistPosition} IN ORDER
                </span>
              ) : null}
              <Switch
                label="Claim it automatically"
                checked={autoClaim}
                readOnly
                disabled
                style={{ marginTop: 10 }}
              />
            </div>
          ) : (
            <WaitlistClaim
              episodeId={episodeId}
              position={waitlistPosition}
              autoClaim={autoClaim}
              creditHours={creditHours}
            />
          )}
          <CrewCall episodeId={episodeId} mine={crewMine} seekers={[]} />
        </>
      ) : composition ? (
        <>
          {/* A composition episode seats by segment. The manifest never
              writes that rsvp — the vetting page does, with the segment. */}
          <span className="mbr-mono">SEATED BY SEGMENT</span>
          <span className="voy-foot__spacer"></span>
          <Link
            href="/vetting"
            className={`ls-btn ls-btn--${recommended ? "gold" : "outline"} ls-btn--sm`}
          >
            Take a seat on the vetting page →
          </Link>
        </>
      ) : enquiryHref ? (
        <>
          <span className="mbr-mono">ON REQUEST</span>
          <span className="voy-foot__spacer"></span>
          <Link href={enquiryHref} className="ls-btn ls-btn--outline ls-btn--sm">
            Enquire
          </Link>
        </>
      ) : inviteOnly ? (
        <span className="mbr-mono">BY INVITATION — THE WORD ARRIVES WITH THE PASS</span>
      ) : byRequest ? (
        /* Places are requested; the Bridge offers them the night before. The
           door says requested, never a number — and when an offer stands it
           shows the one clock that matters and the button that claims it. */
        request && offerLive ? (
          <>
            <Badge tone="gold">A place is yours</Badge>
            <span className="voy-hold" style={{ flexBasis: "100%" }}>
              The Bridge offered you a place. It stands{" "}
              {claimHours != null ? `for ${claimHours} hours from the offer` : "for the claim window"}, then
              passes to the next in line.
            </span>
            {request.claimExpiresAt && request.claimUntilLabel ? (
              <OfferClock
                className="mbr-mono"
                expiresAt={request.claimExpiresAt}
                untilLabel={request.claimUntilLabel}
              />
            ) : null}
            <span className="voy-foot__spacer"></span>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => leaveTheLine(request.entryId))}
            >
              Let it pass
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={pending || paused}
              onClick={() => run(() => claimYourPlace(request.entryId))}
            >
              Claim your place
            </Button>
          </>
        ) : request ? (
          <>
            <Badge tone="outline">Requested</Badge>
            <span className="voy-hold" style={{ flexBasis: "100%" }}>
              Asked for. The Bridge decides the night before and writes once; an offer
              stands {claimHours != null ? `for ${claimHours} hours` : "for the claim window"}.
            </span>
            <span className="voy-foot__spacer"></span>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => leaveTheLine(request.entryId))}
            >
              Withdraw the request
            </Button>
          </>
        ) : (
          <>
            <span className="mbr-mono">BY REQUEST</span>
            <span className="voy-hold" style={{ flexBasis: "100%" }}>
              Ask for a place and the Bridge writes back the night before. No queue number — a
              yes or a no.
            </span>
            <span className="voy-seats" role="group" aria-label="Which seat">
              {SEGMENTS.map((sg) => (
                <Tag key={sg} active={segment === sg} onClick={() => setSegment(sg)}>
                  {SEGMENT_CHOICE[sg]}
                </Tag>
              ))}
            </span>
            <span className="voy-foot__spacer"></span>
            <Button
              variant={recommended ? "gold" : "outline"}
              size="sm"
              disabled={pending || paused || !segment}
              onClick={() => segment && run(() => requestAPlace(episodeId, segment))}
            >
              Request a place
            </Button>
          </>
        )
      ) : windowNote ? (
        <span className="mbr-mono">{windowNote}</span>
      ) : passesLeft <= 0 ? (
        <>
          <Badge tone="outline">Full</Badge>
          {standbyOpen ? (
            <span className="voy-hold" style={{ flexBasis: "100%" }}>
              Take a standby pass — you board if a seat comes free by muster. It stands outside
              the count, and it releases and credits in full if no seat does.
            </span>
          ) : null}
          <span className="voy-foot__spacer"></span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => setPassStatus(episodeId, "waitlist"))}
          >
            Join the waitlist
          </Button>
          {standbyOpen ? (
            <Button variant="ghost" size="sm" disabled={pending || paused} onClick={takeStandbyPass}>
              Take a standby pass
            </Button>
          ) : null}
        </>
      ) : (
        <>
          {myStatus === "not_going" ? <Badge tone="outline">Passed</Badge> : null}
          <span className="voy-foot__spacer"></span>
          {myStatus !== "not_going" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setPassStatus(episodeId, "not_going"))}
            >
              Not this one
            </Button>
          ) : null}
          <Button
            variant={recommended ? "gold" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() =>
              needsReview ? openCheckout() : run(() => setPassStatus(episodeId, "aboard"))
            }
          >
            Confirm your pass
          </Button>
          <CrewCall episodeId={episodeId} mine={crewMine} seekers={[]} />
        </>
      )}

      {error && !dialogOpen ? (
        <span className="voy-hold" role="alert" style={{ width: "100%" }}>
          {error}
          {offerWaitlist ? fullDoors() : null}
        </span>
      ) : null}

      {toast ? (
        <Toast fixed tone="positive" message={toast} onDismiss={() => setToast(null)} />
      ) : null}

      {/* — Review & confirm: priced episodes — */}
      <Dialog
        open={checkout}
        onClose={() => setCheckout(false)}
        width={440}
        eyebrow={coStandby ? "Review & confirm · standby" : "Review & confirm"}
        title={voyageTitle}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCheckout(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={pending || namesMissing}
              onClick={() =>
                run(
                  () =>
                    confirmBerth(
                      episodeId,
                      Array.from(chosen),
                      coGuests,
                      checkoutNames,
                      promo?.code ?? null,
                      splitDraws,
                      coStandby
                    ),
                  () => setCheckout(false)
                )
              }
            >
              {coStandby ? "Take the standby pass" : "Confirm your pass"}
            </Button>
          </>
        }
      >
        <div style={{ fontSize: "var(--text-sm)" }}>
          {coStandby ? (
            <p style={{ marginBottom: 10, color: "var(--text-2)" }}>
              A standby pass stands outside the count. You board if a seat comes free by
              muster; if none does, the pass releases and every charge credits back in full.
            </p>
          ) : null}
          <div style={{ ...rowStyle, borderTop: "none" }}>
            <span>{coStandby ? "Standby pass" : "Pass"}</span>
            <span className="mbr-mono" style={{ fontSize: 12 }}>
              {price(passDue)}
            </span>
          </div>
          {depositDue ? (
            <div style={rowStyle}>
              <span>
                <Badge tone="gold">Deposit</Badge>{" "}
                <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                  credited to the galley aboard, forfeited on no-show
                </span>
              </span>
              <span className="mbr-mono" style={{ fontSize: 12 }}>
                {money(depositCents)}
              </span>
            </div>
          ) : null}
          {guestsAllowed ? (
            <div style={rowStyle}>
              <span className="mbr-mono">
                GUESTS · UP TO {guestAllowance} ON YOUR PLAN
              </span>
              <Stepper
                size="sm"
                min={0}
                max={guestAllowance}
                value={coGuests}
                onChange={(n) => {
                  setCoGuests(n);
                  setCoNames((prev) => sizeNames(n, prev));
                }}
              />
            </div>
          ) : null}
          {coGuests > 0 ? (
            <GuestNameInputs
              names={checkoutNames}
              onChange={(i, v) =>
                setCoNames((prev) => sizeNames(coGuests, prev).map((x, j) => (j === i ? v : x)))
              }
            />
          ) : null}
          {addons.map((a) => (
            <div key={a.id} style={rowStyle}>
              <Checkbox
                /* The price sat in a sibling span outside the <label>, so the
                   accessible name of this box was the add-on's name and
                   nothing else — at qty 1 there is no description either, and
                   a reader was asked to tick a charge whose amount was never
                   said. Repeated silently for the screen, read aloud once. */
                label={
                  <>
                    {a.name}
                    <span className="ls-visually-hidden">{`, ${money(a.price_cents * qty)}`}</span>
                  </>
                }
                description={qty > 1 ? `${money(a.price_cents)} × ${qty} (you and ${coGuests} guest${coGuests > 1 ? "s" : ""})` : undefined}
                checked={chosen.has(a.id)}
                onChange={() => toggleAddon(a.id)}
              />
              <span className="mbr-mono" style={{ fontSize: 12 }} aria-hidden="true">
                {money(a.price_cents * qty)}
              </span>
            </div>
          ))}
          <PromoField
            episodeId={episodeId}
            applied={promo}
            onApplied={setPromo}
            onCleared={() => setPromo(null)}
          />
          {splitEligible ? (
            <div style={{ ...rowStyle, alignItems: "center" }}>
              <span>
                <b style={{ fontWeight: 700 }}>Split it</b>
                <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>
                  No interest. The rest is drawn monthly.
                </span>
              </span>
              <span style={{ display: "flex", gap: 6 }}>
                {[2, 3, 4].map((n) => (
                  <Tag
                    key={n}
                    active={split === n}
                    onClick={() => setSplit(split === n ? null : n)}
                  >
                    {n} draws
                  </Tag>
                ))}
              </span>
            </div>
          ) : null}
          {creditApplied > 0 ? (
            <div style={rowStyle}>
              <span>Plan credit</span>
              <span className="mbr-mono" style={{ fontSize: 12 }}>
                −{price(creditApplied)}
              </span>
            </div>
          ) : null}
          <div style={{ ...rowStyle, borderTop: "1px solid var(--line-strong)" }}>
            <span className="mbr-mono">
              {splitDraws ? "DUE TODAY" : "DUE TO MEMBER ACCOUNT"}
            </span>
            <span className="mbr-mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-1)" }}>
              {splitDraws || dueToday - creditApplied > 0 ? price(splitDraws ? dueToday : dueToday - creditApplied) : "$0"}
            </span>
          </div>
          {splitDraws ? (
            <div style={rowStyle}>
              <span style={{ color: "var(--text-2)" }}>Then</span>
              <span className="mbr-mono" style={{ fontSize: 12 }}>
                {splitDraws - 1} × {money(perDraw)}
              </span>
            </div>
          ) : null}
          {knotsOnCompletion != null ? (
            <div style={rowStyle}>
              <span style={{ color: "var(--text-2)" }}>On completion</span>
              <span className="mbr-mono" style={{ fontSize: 12, color: "var(--laurel)" }}>
                +{knotsOnCompletion} KN
              </span>
            </div>
          ) : null}
          <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-3)" }}>
            {policyLine(creditHours)}
          </p>
          {errorBlock(() => setCheckout(false))}
        </div>
      </Dialog>

      {/* — Review & confirm: the bow daybed, the same way the pass is — */}
      {daybed ? (
        <Dialog
          open={claimingDaybed}
          onClose={() => setClaimingDaybed(false)}
          width={400}
          eyebrow="Review & confirm"
          title="The bow daybed"
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setClaimingDaybed(false)}>
                Not yet
              </Button>
              <Button
                variant="gold"
                size="sm"
                disabled={pending || !passId}
                onClick={() =>
                  passId &&
                  run(
                    () => claimDaybed(passId),
                    () => {
                      setClaimingDaybed(false);
                      setToast("Bow daybed held — the steward knows your name.");
                    }
                  )
                }
              >
                Claim the daybed
              </Button>
            </>
          }
        >
          <div style={{ fontSize: "var(--text-sm)" }}>
            <div style={{ ...rowStyle, borderTop: "none" }}>
              <span>
                Bow daybed
                <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>
                  {voyageTitle}
                </span>
              </span>
              <span className="mbr-mono" style={{ fontSize: 12 }}>
                {price(daybed.priceCents)}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={{ color: "var(--text-2)" }}>
                Room for {countWord(daybed.party)}. {countWord(daybed.cap).replace(/^./, (c) => c.toUpperCase())}{" "}
                per episode, one per pass.
              </span>
            </div>
            <div style={{ ...rowStyle, borderTop: "1px solid var(--line-strong)" }}>
              <span className="mbr-mono">DUE TO MEMBER ACCOUNT</span>
              <span className="mbr-mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-1)" }}>
                {price(daybed.priceCents)}
              </span>
            </div>
            <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-3)" }}>
              It rides on your pass. Release the pass and the daybed goes with it —
              credited in full more than {creditHours} hours out, forfeit inside.
            </p>
            {errorBlock()}
          </div>
        </Dialog>
      ) : null}

      {/* — Guest names, prompted when the party grows on an aboard row — */}
      <Dialog
        open={!!guestEdit}
        onClose={() => setGuestEdit(null)}
        width={380}
        eyebrow="Guest passes"
        title="Who's coming aboard?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setGuestEdit(null)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={pending || !guestEdit || guestEdit.names.some((n) => !n.trim())}
              onClick={() =>
                guestEdit &&
                run(
                  () => setGuests(episodeId, guestEdit.count, guestEdit.names),
                  () => setGuestEdit(null)
                )
              }
            >
              Save guest names
            </Button>
          </>
        }
      >
        <div style={{ fontSize: "var(--text-sm)" }}>
          {guestEdit ? (
            <GuestNameInputs
              names={guestEdit.names}
              onChange={(i, v) =>
                setGuestEdit((prev) =>
                  prev ? { ...prev, names: prev.names.map((x, j) => (j === i ? v : x)) } : prev
                )
              }
            />
          ) : null}
          {errorBlock()}
        </div>
      </Dialog>

      {/* — Improve your pass: add-ons after the fact, until 18:00 the night before — */}
      <Dialog
        open={improving}
        onClose={() => setImproving(false)}
        width={420}
        eyebrow="Improve your pass"
        title={voyageTitle}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setImproving(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={pending || improveChosen.size === 0}
              onClick={() =>
                run(
                  () => improvePass(episodeId, Array.from(improveChosen)),
                  () => setImproving(false)
                )
              }
            >
              Add to your pass
            </Button>
          </>
        }
      >
        <div style={{ fontSize: "var(--text-sm)" }}>
          {unattached.map((a, i) => (
            <div key={a.id} style={i === 0 ? { ...rowStyle, borderTop: "none" } : rowStyle}>
              <Checkbox
                label={
                  <>
                    {a.name}
                    <span className="ls-visually-hidden">{`, ${money(a.price_cents * aboardQty)}`}</span>
                  </>
                }
                description={aboardQty > 1 ? `${money(a.price_cents)} × ${aboardQty} (you and ${guests} guest${guests > 1 ? "s" : ""})` : undefined}
                checked={improveChosen.has(a.id)}
                onChange={() => toggleImprove(a.id)}
              />
              <span className="mbr-mono" style={{ fontSize: 12 }} aria-hidden="true">
                {money(a.price_cents * aboardQty)}
              </span>
            </div>
          ))}
          <div style={{ ...rowStyle, borderTop: "1px solid var(--line-strong)" }}>
            <span className="mbr-mono">DUE TO MEMBER ACCOUNT</span>
            <span className="mbr-mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-1)" }}>
              {money(improveTotal)}
            </span>
          </div>
          <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-3)" }}>
            Add-ons stay open until 18:00 the night before departure.
          </p>
          {errorBlock()}
        </div>
      </Dialog>

      {/* — Release, with the credit terms up front — */}
      <Dialog
        open={releasing}
        onClose={() => setReleasing(false)}
        width={380}
        eyebrow="Passes"
        title="Release this pass?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setReleasing(false)}>
              Keep it
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => releasePass(episodeId),
                  () => setReleasing(false)
                )
              }
            >
              Release the pass
            </Button>
          </>
        }
      >
        <div style={{ fontSize: "var(--text-sm)" }}>
          {fullCredit
            ? `More than ${creditHours} hours out — every charge credits back in full, and the pass goes to the waitlist in order.`
            : /* Inside the window, what goes is named: the pass, the deposit,
                 the daybed if held, the cabin premium if any. */
              `Inside ${creditHours} hours the pass releases without credit — ${prose(forfeits)} ${
                forfeits.length > 1 ? "are" : "is"
              } forfeit. It still goes to the waitlist in order.`}
          {errorBlock()}
        </div>
      </Dialog>
    </div>
  );
}
