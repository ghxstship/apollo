"use client";

/* Ticketing polish, kept in its own file so the Review & confirm dialog in
   rsvp-controls.tsx stays legible: waitlist auto-claim, member-to-member
   hand-offs, per-guest stubs, codes at checkout, and crew forming. */

import React from "react";
import Link from "next/link";
import { CopyLink } from "@/components/copy-link";
import { Button, Input, Select, Switch, Textarea, Dialog } from "@/components/ds";
import {
  applyPromo,
  offerPass,
  postCrewRequest,
  setAutoClaim,
  withdrawCrewRequest,
  withdrawOffer,
  type PromoKind,
} from "./actions";

export type MemberOption = { id: string; label: string };
export type GuestStub = { name: string; code: string | null; signToken: string; signed: boolean };
export type StandingOffer = { id: string; name: string };
export type CrewSeeker = { id: string; name: string; handle: string | null; note: string | null };
export type AppliedPromo = { code: string; kind: PromoKind; value: number; passCents: number };

const monoLine: React.CSSProperties = { display: "block", marginTop: 6 };
const noteStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-3)",
  marginTop: 6,
  maxWidth: "46ch",
};
const blockStyle: React.CSSProperties = { width: "100%", marginTop: 4 };

function Problem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="voy-hold" role="alert" style={{ marginTop: 8 }}>
      {message}
    </p>
  );
}

/* — 1. Waitlist: where you stand, and whether we claim for you — */

export function WaitlistClaim({
  voyageId,
  position,
  autoClaim,
}: {
  voyageId: string;
  position: number | null;
  autoClaim: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [on, setOn] = React.useState(autoClaim);
  const [error, setError] = React.useState<string | null>(null);

  const flip = (next: boolean) => {
    setOn(next);
    setError(null);
    startTransition(async () => {
      const res = await setAutoClaim(voyageId, next);
      if (res.error) {
        setOn(!next);
        setError(res.error);
      }
    });
  };

  return (
    <div style={blockStyle}>
      {position != null ? (
        <span className="mbr-mono" style={monoLine}>
          {position} IN ORDER
        </span>
      ) : null}
      {position === 1 ? (
        <span className="mbr-mono" style={monoLine}>
          NEXT IN ORDER
        </span>
      ) : null}
      <Switch
        label="Claim it automatically"
        checked={on}
        disabled={pending}
        onChange={(e) => flip(e.target.checked)}
        style={{ marginTop: 10 }}
      />
      <p style={noteStyle}>
        We take the pass the moment one frees. Release it within 48 hours if the
        tide has turned.
      </p>
      <Problem message={error} />
    </div>
  );
}

/* — 2. Hand-off: a pass moves between members, never for cash — */

export function HandOff({
  rsvpId,
  voyageTitle,
  members,
  offer,
}: {
  rsvpId: string | null;
  voyageTitle: string;
  members: MemberOption[];
  offer: StandingOffer | null;
}) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (offer) {
    return (
      <>
        <span className="mbr-mono" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          OFFERED TO {offer.name.toUpperCase()} —
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await withdrawOffer(offer.id);
                if (res.error) setError(res.error);
              });
            }}
          >
            Withdraw
          </Button>
        </span>
        {error ? (
          <span className="voy-hold" role="alert" style={{ width: "100%" }}>
            {error}
          </span>
        ) : null}
      </>
    );
  }

  if (!rsvpId) return null;

  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        Hand it to a member
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        width={400}
        eyebrow="Hand it on"
        title={voyageTitle}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={pending || !choice}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await offerPass(rsvpId, choice);
                  if (res.error) setError(res.error);
                  else {
                    setOpen(false);
                    setChoice("");
                  }
                });
              }}
            >
              Offer the pass
            </Button>
          </>
        }
      >
        <div style={{ fontSize: "var(--text-sm)" }}>
          <Select
            label="Who takes it"
            placeholder="Choose a member"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            options={members.map((m) => ({ value: m.id, label: m.label }))}
          />
          <p style={{ ...noteStyle, marginTop: 12 }}>
            Passes move between members, never for cash — the code of conduct is
            the code of conduct. They accept on their own manifest; your account
            squares the moment they do.
          </p>
          <Problem message={error} />
        </div>
      </Dialog>
    </>
  );
}

/* — 3. Per-guest stubs, cut by the manifest as soon as names are saved — */

/* The second head on a couple pass rides the same stub, code and waiver
   machinery as a guest and is listed here with them — under its own line,
   because it is not a companion and must not read as one. */
export function GuestStubs({ guests, partner = null }: { guests: GuestStub[]; partner?: GuestStub | null }) {
  const cut = guests.filter((g) => g.code);
  const head = partner?.code ? partner : null;
  if (cut.length === 0 && !head) return null;
  const unsigned = [...(head ? [head] : []), ...cut].filter((g) => !g.signed);
  return (
    <div style={blockStyle}>
      {head ? (
        <span style={monoLine}>
          <Link
            href={`/stub/${head.code}`}
            className="mbr-mono"
            style={{ color: "var(--text-link)", textDecoration: "none" }}
          >
            SECOND HEAD — {head.name.toUpperCase()} · CODE {head.code}
          </Link>
          <span className="mbr-mono" style={{ marginInlineStart: 10 }}>
            {head.signed ? "WAIVER SIGNED" : "WAIVER OUTSTANDING"}
          </span>
        </span>
      ) : null}
      {cut.length > 0 ? (
        <span className="mbr-mono" style={head ? { ...monoLine, marginTop: 10 } : monoLine}>
          GUEST STUBS
        </span>
      ) : null}
      {cut.map((g) => (
        <span key={g.code} style={monoLine}>
          <Link
            href={`/stub/${g.code}`}
            className="mbr-mono"
            style={{ color: "var(--text-link)", textDecoration: "none" }}
          >
            {g.name.toUpperCase()} — {g.code}
          </Link>
          <span className="mbr-mono" style={{ marginInlineStart: 10 }}>
            {g.signed ? "WAIVER SIGNED" : "WAIVER OUTSTANDING"}
          </span>
        </span>
      ))}
      {/* A guest cannot board unsigned, and only the member who invited them can
          pass on the link — so it lives here, next to their stub. */}
      {unsigned.length > 0 ? (
        <span style={{ ...monoLine, marginTop: 10 }}>
          <span className="mbr-mono" style={{ display: "block", marginBottom: 6 }}>
            SEND THEM THIS TO SIGN
          </span>
          {unsigned.map((g) => (
            <CopyLink
              key={g.signToken}
              value={`${typeof window === "undefined" ? "" : window.location.origin}/sign/${g.signToken}`}
              label={`Copy ${g.name}'s link`}
              toast={`${g.name}'s signing link copied.`}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

/* — 4. A code at checkout. The Bridge issues them; we only ever check. — */

export function PromoField({
  voyageId,
  applied,
  onApplied,
  onCleared,
}: {
  voyageId: string;
  applied: AppliedPromo | null;
  onApplied: (promo: AppliedPromo) => void;
  onCleared: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [raw, setRaw] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (applied) {
    return (
      <div style={{ paddingTop: 10 }}>
        <span className="mbr-mono" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          CODE {applied.code} APPLIED
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRaw("");
              setError(null);
              onCleared();
            }}
          >
            Remove
          </Button>
        </span>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await applyPromo(raw, voyageId);
      if (res.ok) {
        onApplied({ code: res.code, kind: res.kind, value: res.value, passCents: res.passCents });
        setRaw("");
      } else {
        setError(res.reason);
      }
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, paddingTop: 10 }}>
      <Input
        label="Have a code?"
        value={raw}
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (raw.trim()) submit();
          }
        }}
        error={error ?? undefined}
        style={{ flex: 1 }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={pending || !raw.trim()}
        onClick={submit}
        style={{ marginBottom: error ? 22 : 2 }}
      >
        Apply
      </Button>
    </div>
  );
}

/* — 5. Crew forming: say you're sailing solo, or find who else is — */

export function CrewCall({
  voyageId,
  mine,
  seekers,
  canPost = true,
}: {
  voyageId: string;
  /* The member's own open request on this sailing, if they posted one. */
  mine: CrewSeeker | null;
  /* Everyone else's open requests — shown once you're aboard. */
  seekers: CrewSeeker[];
  /* Putting your name up is for sailings you aren't aboard yet. */
  canPost?: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const withdraw = () => {
    setError(null);
    startTransition(async () => {
      const res = await withdrawCrewRequest(voyageId);
      if (res.error) setError(res.error);
    });
  };

  return (
    <div style={blockStyle}>
      {seekers.length > 0 ? (
        <>
          <span className="mbr-mono" style={monoLine}>
            {seekers.length} LOOKING FOR CREW
          </span>
          {seekers.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                padding: "7px 0",
                borderTop: "1px solid var(--line-faint)",
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--text-2)" }}>
                {s.name}
                {s.note ? <span style={{ color: "var(--text-3)" }}> — {s.note}</span> : null}
              </span>
              {s.handle ? (
                <Link href={`/directory/${s.handle}`} style={{ color: "var(--text-link)" }}>
                  Send a word
                </Link>
              ) : null}
            </div>
          ))}
        </>
      ) : null}

      {mine ? (
        <span className="mbr-mono" style={{ ...monoLine, display: "inline-flex", alignItems: "center", gap: 8 }}>
          LOOKING FOR CREW
          <Button variant="ghost" size="sm" disabled={pending} onClick={withdraw}>
            Withdraw
          </Button>
        </span>
      ) : canPost ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(true)}>
          Sailing solo?
        </Button>
      ) : null}
      <Problem message={error} />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        width={400}
        eyebrow="Crew forming"
        title="Sailing solo?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await postCrewRequest(voyageId, note);
                  if (res.error) setError(res.error);
                  else {
                    setOpen(false);
                    setNote("");
                  }
                });
              }}
            >
              Put your name up
            </Button>
          </>
        }
      >
        <div style={{ fontSize: "var(--text-sm)" }}>
          <p style={{ color: "var(--text-2)" }}>
            Members aboard this sailing will see your name and can send you a
            word. Withdraw it any time.
          </p>
          <Textarea
            label="A line about you, if you like"
            rows={3}
            value={note}
            maxLength={140}
            onChange={(e) => setNote(e.target.value)}
            style={{ marginTop: 12 }}
          />
          <Problem message={error} />
        </div>
      </Dialog>
    </div>
  );
}
