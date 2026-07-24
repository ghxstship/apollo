"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button, Checkbox, Dialog, Stepper } from "@/components/ds";
import { confirmBerth, releaseBerth, setGuests, setRsvpStatus } from "./actions";

export type AddonOption = { id: string; name: string; price_cents: number };

const POLICY =
  "Weather holds are called by 18:00 the night before. Release your berth up to 48h out for full credit — it goes to the waitlist in order.";

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

export function RsvpControls({
  voyageId,
  voyageTitle,
  myStatus,
  guests,
  berthsLeft,
  weatherHold,
  locked,
  lockedNote,
  recommended,
  priceCents,
  depositRequired,
  addons,
  knotsOnCompletion,
  fullCredit,
  boardingCode,
}: {
  voyageId: string;
  voyageTitle: string;
  myStatus: "aboard" | "waitlist" | "not_going" | null;
  guests: number;
  berthsLeft: number;
  weatherHold: boolean;
  locked: boolean;
  lockedNote: string;
  recommended: boolean;
  priceCents: number;
  depositRequired: boolean;
  addons: AddonOption[];
  knotsOnCompletion: number | null;
  /* Computed shoreside: more than 48h out at render time. */
  fullCredit: boolean;
  boardingCode: string | null;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [offerWaitlist, setOfferWaitlist] = React.useState(false);
  const [checkout, setCheckout] = React.useState(false);
  const [releasing, setReleasing] = React.useState(false);
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());

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
  const qty = 1 + guests;
  const addonTotal = addons
    .filter((a) => chosen.has(a.id))
    .reduce((sum, a) => sum + a.price_cents * qty, 0);
  const total = priceCents + (depositRequired ? 5000 : 0) + addonTotal;

  const toggleAddon = (id: string) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
          <Badge tone="clay">Weather hold</Badge>
          <span className="voy-hold">
            Held for weather. We call it by 18:00 the night before.
          </span>
        </>
      ) : myStatus === "aboard" ? (
        <>
          <Badge tone="laurel">Aboard</Badge>
          <span className="mbr-mono">GUESTS</span>
          <Stepper
            size="sm"
            min={0}
            max={2}
            value={guests}
            onChange={(n) => run(() => setGuests(voyageId, n))}
          />
          {boardingCode ? (
            <Link href={`/stub/${boardingCode}`} className="ls-btn ls-btn--outline ls-btn--sm">
              Boarding stub
            </Link>
          ) : null}
          <span className="voy-foot__spacer"></span>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setReleasing(true)}
          >
            Release berth
          </Button>
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
        </>
      ) : berthsLeft <= 0 ? (
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
            variant={recommended ? "brass" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() =>
              needsReview
                ? (setError(null), setOfferWaitlist(false), setCheckout(true))
                : run(() => setRsvpStatus(voyageId, "aboard"))
            }
          >
            Confirm RSVP
          </Button>
        </>
      )}

      {error && !checkout ? (
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
              variant="brass"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => confirmBerth(voyageId, Array.from(chosen)),
                  () => setCheckout(false)
                )
              }
            >
              Confirm the berth
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 13 }}>
          <div style={{ ...rowStyle, borderTop: "none" }}>
            <span>Berth</span>
            <span className="mbr-mono" style={{ fontSize: 12 }}>
              {money(priceCents)}
            </span>
          </div>
          {depositRequired ? (
            <div style={rowStyle}>
              <span>
                <Badge tone="brass">Deposit</Badge>{" "}
                <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                  credited to the galley aboard, forfeited on no-show
                </span>
              </span>
              <span className="mbr-mono" style={{ fontSize: 12 }}>
                {money(5000)}
              </span>
            </div>
          ) : null}
          {addons.map((a) => (
            <div key={a.id} style={rowStyle}>
              <Checkbox
                label={a.name}
                description={qty > 1 ? `${money(a.price_cents)} × ${qty} (you and ${guests} guest${guests > 1 ? "s" : ""})` : undefined}
                checked={chosen.has(a.id)}
                onChange={() => toggleAddon(a.id)}
              />
              <span className="mbr-mono" style={{ fontSize: 12 }}>
                {money(a.price_cents * qty)}
              </span>
            </div>
          ))}
          <div style={{ ...rowStyle, borderTop: "1px solid var(--line-strong)" }}>
            <span className="mbr-mono">DUE TO MEMBER ACCOUNT</span>
            <span className="mbr-mono" style={{ fontSize: 13, color: "var(--text-1)" }}>
              {money(total)}
            </span>
          </div>
          {knotsOnCompletion != null ? (
            <div style={rowStyle}>
              <span style={{ color: "var(--text-2)" }}>On completion</span>
              <span className="mbr-mono" style={{ fontSize: 12, color: "var(--laurel)" }}>
                +{knotsOnCompletion} KN
              </span>
            </div>
          ) : null}
          <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-3)" }}>{POLICY}</p>
          {error ? (
            <p className="voy-hold" role="alert" style={{ marginTop: 10 }}>
              {error}
              {offerWaitlist ? (
                <>
                  {" "}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => setRsvpStatus(voyageId, "waitlist"),
                        () => setCheckout(false)
                      )
                    }
                  >
                    Join the waitlist
                  </Button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </Dialog>

      {/* — Release, with the credit terms up front — */}
      <Dialog
        open={releasing}
        onClose={() => setReleasing(false)}
        width={380}
        eyebrow="The manifest"
        title="Release this berth?"
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
              Release the berth
            </Button>
          </>
        }
      >
        {fullCredit
          ? "More than 48 hours out — every charge credits back in full, and the berth goes to the waitlist in order."
          : "Inside 48 hours the berth releases without credit. It still goes to the waitlist in order."}
      </Dialog>
    </div>
  );
}
