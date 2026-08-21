"use client";

import React from "react";
import Link from "next/link";
import { chooseCabin } from "./actions";
import { Badge, Button, Checkbox, Dialog, Input, Stepper, Tag } from "@/components/ds";
import { price } from "@/lib/format";
import { confirmBerth, improvePass, releaseBerth, setGuests, setRsvpStatus } from "./actions";
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

const POLICY =
  "Weather holds are called by 18:00 the night before. Release your pass up to 48h out for full credit — it goes to the waitlist in order.";

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

export function RsvpControls({
  voyageId,
  voyageTitle,
  myStatus,
  guests,
  guestNames,
  passesLeft,
  weatherHold,
  locked,
  lockedNote,
  windowNote,
  recommended,
  priceCents,
  depositRequired,
  addons,
  attachedAddonIds,
  addonWindowOpen,
  knotsOnCompletion,
  fullCredit,
  boardingCode,
  rsvpId,
  waitlistPosition,
  autoClaim,
  members,
  standingOffer,
  guestStubs,
  cabins,
  cabinId,
  crewMine,
  crewSeekers,
  splitOffered,
}: {
  voyageId: string;
  voyageTitle: string;
  myStatus: "aboard" | "waitlist" | "not_going" | null;
  guests: number;
  guestNames: string[];
  passesLeft: number;
  weatherHold: boolean;
  locked: boolean;
  lockedNote: string;
  /* Set when the plan's booking window hasn't opened yet — replaces the CTA. */
  windowNote: string | null;
  recommended: boolean;
  priceCents: number;
  depositRequired: boolean;
  addons: AddonOption[];
  attachedAddonIds: string[];
  /* Add-ons may be added until 18:00 the night before departure. */
  addonWindowOpen: boolean;
  knotsOnCompletion: number | null;
  /* Computed shoreside: more than 48h out at render time. */
  fullCredit: boolean;
  boardingCode: string | null;
  /* — ticketing polish — */
  rsvpId: string | null;
  /* Place in the waitlist for this sailing, 1 = next. */
  waitlistPosition: number | null;
  autoClaim: boolean;
  /* Active members other than you, for a hand-off. */
  members: MemberOption[];
  /* A hand-off you have already offered on this pass. */
  standingOffer: StandingOffer | null;
  /* Guest stubs cut by the manifest once names are saved. */
  guestStubs: GuestStub[];
  cabins: Array<{ id: string; name: string; premiumCents: number; left: number }>;
  cabinId: string | null;
  /* Your own open crew request on this sailing. */
  crewMine: CrewSeeker | null;
  /* Other members looking for crew — shown once you are aboard. */
  crewSeekers: CrewSeeker[];
  /* Set shoreside when the club can carry split draws on this pass. */
  splitOffered: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [offerWaitlist, setOfferWaitlist] = React.useState(false);
  const [checkout, setCheckout] = React.useState(false);
  const [releasing, setReleasing] = React.useState(false);
  const [improving, setImproving] = React.useState(false);
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

  const needsReview = priceCents > 0 || depositRequired;
  const checkoutNames = sizeNames(coGuests, coNames);
  const namesMissing = checkoutNames.some((n) => !n.trim());
  const qty = 1 + coGuests;
  const addonTotal = addons
    .filter((a) => chosen.has(a.id))
    .reduce((sum, a) => sum + a.price_cents * qty, 0);
  /* A code trims the pass alone — the deposit and add-ons stand. */
  const passDue = promo ? promo.passCents : priceCents;
  const total = passDue + (depositRequired ? 5000 : 0) + addonTotal;

  /* Split it — anything over $200 may be drawn in 2, 3, or 4 goes. The first
     draw is today; the rest come monthly, at no interest. */
  const splitEligible = splitOffered && total > 20000;
  const splitDraws = splitEligible && split ? split : null;
  const perDraw = splitDraws ? Math.floor(total / splitDraws) : 0;
  const dueToday = splitDraws ? total - perDraw * (splitDraws - 1) : total;

  const unattached = addons.filter((a) => !attachedAddonIds.includes(a.id));
  const aboardQty = 1 + guests;
  const improveTotal = unattached
    .filter((a) => improveChosen.has(a.id))
    .reduce((sum, a) => sum + a.price_cents * aboardQty, 0);

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

  const openCheckout = () => {
    setError(null);
    setOfferWaitlist(false);
    setCoGuests(guests);
    setCoNames(guestNames);
    setPromo(null);
    setSplit(null);
    setCheckout(true);
  };

  const onGuestStep = (n: number) => {
    if (n <= guests) {
      /* Shrinking the party — truncate the names to match. */
      run(() => setGuests(voyageId, n, guestNames.slice(0, n)));
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
        {offerWaitlist ? (
          <>
            {" "}
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setRsvpStatus(voyageId, "waitlist"), onWaitlist)}
            >
              Join the waitlist
            </Button>
          </>
        ) : null}
      </p>
    ) : null;

  if (locked) {
    return (
      <div className="voy-foot">
        <span className="voy-lock">
          {lockedNote} <Link href="/portal">Manage membership</Link>
        </span>
      </div>
    );
  }

  return (
    <div className="voy-foot">
      {weatherHold ? (
        <>
          <Badge tone="caution">Weather hold</Badge>
          <span className="voy-hold">
            Held for weather. We call it by 18:00 the night before.
          </span>
        </>
      ) : myStatus === "aboard" ? (
        <>
          <Badge tone="positive">Aboard</Badge>
          <span className="mbr-mono">GUESTS</span>
          <Stepper size="sm" min={0} max={2} value={guests} onChange={onGuestStep} />
          {boardingCode ? (
            <Link href={`/stub/${boardingCode}`} className="ls-btn ls-btn--outline ls-btn--sm">
              Boarding stub
            </Link>
          ) : null}
          <span className="voy-foot__spacer"></span>
          <HandOff
            rsvpId={rsvpId}
            voyageTitle={voyageTitle}
            members={members}
            offer={standingOffer}
          />
          {addonWindowOpen && unattached.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
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
            onClick={() => setReleasing(true)}
          >
            Release pass
          </Button>
          <GuestStubs guests={guestStubs} />
          {cabins.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <span className="mbr-mono" style={{ display: "block", marginBottom: 6 }}>
                YOUR CABIN
              </span>
              <select
                aria-label="Choose a cabin"
                className="ls-input"
                defaultValue={cabinId ?? ""}
                style={{ minHeight: 44, width: "100%" }}
                onChange={(e) => {
                  const v = e.target.value || null;
                  void chooseCabin(voyageId, v).then((r) => {
                    if (r.error) alert(r.error);
                  });
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
              </select>
            </div>
          ) : null}
          {crewSeekers.length > 0 || crewMine ? (
            <CrewCall
              voyageId={voyageId}
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
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => releaseBerth(voyageId))}
          >
            Leave the list
          </Button>
          <WaitlistClaim
            voyageId={voyageId}
            position={waitlistPosition}
            autoClaim={autoClaim}
          />
          <CrewCall voyageId={voyageId} mine={crewMine} seekers={[]} />
        </>
      ) : windowNote ? (
        <span className="mbr-mono">{windowNote}</span>
      ) : passesLeft <= 0 ? (
        <>
          <Badge tone="outline">Full</Badge>
          <span className="voy-foot__spacer"></span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => setRsvpStatus(voyageId, "waitlist"))}
          >
            Join waitlist
          </Button>
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
              onClick={() => run(() => setRsvpStatus(voyageId, "not_going"))}
            >
              Not this one
            </Button>
          ) : null}
          <Button
            variant={recommended ? "gold" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() =>
              needsReview ? openCheckout() : run(() => setRsvpStatus(voyageId, "aboard"))
            }
          >
            Confirm your pass
          </Button>
          <CrewCall voyageId={voyageId} mine={crewMine} seekers={[]} />
        </>
      )}

      {error && !checkout && !improving && !guestEdit ? (
        <span className="voy-hold" role="alert" style={{ width: "100%" }}>
          {error}
          {offerWaitlist ? (
            <>
              {" "}
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => setRsvpStatus(voyageId, "waitlist"))}
              >
                Join waitlist
              </Button>
            </>
          ) : null}
        </span>
      ) : null}

      {/* — Review & confirm: priced voyages — */}
      <Dialog
        open={checkout}
        onClose={() => setCheckout(false)}
        width={440}
        eyebrow="Review & confirm"
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
                      voyageId,
                      Array.from(chosen),
                      coGuests,
                      checkoutNames,
                      promo?.code ?? null,
                      splitDraws
                    ),
                  () => setCheckout(false)
                )
              }
            >
              Confirm your pass
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 13 }}>
          <div style={{ ...rowStyle, borderTop: "none" }}>
            <span>Pass</span>
            <span className="mbr-mono" style={{ fontSize: 12 }}>
              {price(passDue)}
            </span>
          </div>
          {depositRequired ? (
            <div style={rowStyle}>
              <span>
                <Badge tone="gold">Deposit</Badge>{" "}
                <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                  credited to the galley aboard, forfeited on no-show
                </span>
              </span>
              <span className="mbr-mono" style={{ fontSize: 12 }}>
                {money(5000)}
              </span>
            </div>
          ) : null}
          <div style={rowStyle}>
            <span className="mbr-mono">GUESTS</span>
            <Stepper
              size="sm"
              min={0}
              max={2}
              value={coGuests}
              onChange={(n) => {
                setCoGuests(n);
                setCoNames((prev) => sizeNames(n, prev));
              }}
            />
          </div>
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
                label={a.name}
                description={qty > 1 ? `${money(a.price_cents)} × ${qty} (you and ${coGuests} guest${coGuests > 1 ? "s" : ""})` : undefined}
                checked={chosen.has(a.id)}
                onChange={() => toggleAddon(a.id)}
              />
              <span className="mbr-mono" style={{ fontSize: 12 }}>
                {money(a.price_cents * qty)}
              </span>
            </div>
          ))}
          <PromoField
            voyageId={voyageId}
            applied={promo}
            onApplied={setPromo}
            onCleared={() => setPromo(null)}
          />
          {splitEligible ? (
            <div style={{ ...rowStyle, alignItems: "center" }}>
              <span>
                <b style={{ fontWeight: 600 }}>Split it</b>
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
          <div style={{ ...rowStyle, borderTop: "1px solid var(--line-strong)" }}>
            <span className="mbr-mono">
              {splitDraws ? "DUE TODAY" : "DUE TO MEMBER ACCOUNT"}
            </span>
            <span className="mbr-mono" style={{ fontSize: 13, color: "var(--text-1)" }}>
              {price(dueToday)}
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
          <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-3)" }}>{POLICY}</p>
          {errorBlock(() => setCheckout(false))}
        </div>
      </Dialog>

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
                  () => setGuests(voyageId, guestEdit.count, guestEdit.names),
                  () => setGuestEdit(null)
                )
              }
            >
              Save guest names
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 13 }}>
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
                  () => improvePass(voyageId, Array.from(improveChosen)),
                  () => setImproving(false)
                )
              }
            >
              Add to your pass
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 13 }}>
          {unattached.map((a, i) => (
            <div key={a.id} style={i === 0 ? { ...rowStyle, borderTop: "none" } : rowStyle}>
              <Checkbox
                label={a.name}
                description={aboardQty > 1 ? `${money(a.price_cents)} × ${aboardQty} (you and ${guests} guest${guests > 1 ? "s" : ""})` : undefined}
                checked={improveChosen.has(a.id)}
                onChange={() => toggleImprove(a.id)}
              />
              <span className="mbr-mono" style={{ fontSize: 12 }}>
                {money(a.price_cents * aboardQty)}
              </span>
            </div>
          ))}
          <div style={{ ...rowStyle, borderTop: "1px solid var(--line-strong)" }}>
            <span className="mbr-mono">DUE TO MEMBER ACCOUNT</span>
            <span className="mbr-mono" style={{ fontSize: 13, color: "var(--text-1)" }}>
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
        eyebrow="The manifest"
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
                  () => releaseBerth(voyageId),
                  () => setReleasing(false)
                )
              }
            >
              Release the pass
            </Button>
          </>
        }
      >
        {fullCredit
          ? "More than 48 hours out — every charge credits back in full, and the pass goes to the waitlist in order."
          : "Inside 48 hours the pass releases without credit. It still goes to the waitlist in order."}
      </Dialog>
    </div>
  );
}
