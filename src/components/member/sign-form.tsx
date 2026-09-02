"use client";

import React from "react";
import { Button, Checkbox, Input } from "@/components/ds";

/* Signing, to WCAG 2.2 AA.

   The accessibility decision that matters here is the signature itself. A canvas
   you draw on with a pointer is unusable by keyboard, unusable with a screen
   reader, and fails 2.1.1 outright — so a drawn signature can never be the only
   way to sign. Typing your name is the default and is offered first; drawing is
   the alternative, not the reverse. Both produce a signature of equal legal
   weight, because ESIGN cares about intent and attribution rather than
   penmanship.

   Also here: an explicit consent checkbox (never pre-ticked), errors announced
   through a live region and tied to their field by aria-describedby (3.3.1),
   labels on every control (3.3.2), a visible focus ring inherited from the
   design system (2.4.7), and touch targets at 24px minimum (2.5.8). */

export type SignResult = { error?: string; signed?: boolean };

const CONSENT_TEXT =
  "I agree to sign this document electronically, and I understand that my " +
  "electronic signature is as binding as a signature in ink.";

export function SignForm({
  documentTitle,
  body,
  onSign,
  askGuardian = false,
  asGuest = false,
  askCamera = false,
}: {
  documentTitle: string;
  body: string;
  onSign: (input: {
    consent: boolean;
    consentText: string;
    kind: "typed" | "drawn";
    data: string;
    name: string;
    guardian: string;
    onCamera: boolean;
    userAgent: string;
  }) => Promise<SignResult>;
  askGuardian?: boolean;
  /* The guest waiver promises a camera choice and says a minor's default is
     off. Until this, the form offered no such control and the column defaulted
     to true — the signer agreed to a consent nobody collected. */
  askCamera?: boolean;
  /* A guest has no account and never will — the confirmation must not send
     them to a member card they do not have. ESIGN also expects a signer to be
     able to retain what they signed, so point them at the link they hold. */
  asGuest?: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [kind, setKind] = React.useState<"typed" | "drawn">("typed");
  const [typed, setTyped] = React.useState("");
  const [guardian, setGuardian] = React.useState("");
  /* Adults are on camera unless they say otherwise; a minor is off unless the
     signing adult says otherwise. Tracking whether the control was touched lets
     one piece of state carry both defaults without fighting the user. */
  const [cameraChoice, setCameraChoice] = React.useState<boolean | null>(null);
  const [consent, setConsent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [drawn, setDrawn] = React.useState<string | null>(null);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const errorId = React.useId();
  const bodyId = React.useId();

  function strokeStart(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    drawing.current = true;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const r = c.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
  }

  function strokeMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const r = c.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
    ctx.stroke();
  }

  function strokeEnd() {
    drawing.current = false;
    const c = canvasRef.current;
    if (c) setDrawn(c.toDataURL("image/png"));
  }

  function clearDrawing() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setDrawn(null);
  }

  function submit() {
    setError(null);
    const name = typed.trim();
    if (!consent) {
      setError("Tick the box to agree to sign electronically.");
      return;
    }
    if (kind === "typed" && name.length < 2) {
      setError("Type your full name as your signature.");
      return;
    }
    if (kind === "drawn" && !drawn) {
      setError("Draw your signature in the box, or switch to typing it.");
      return;
    }
    if (askGuardian && guardian.trim().length > 0 && guardian.trim().length < 2) {
      setError("Give the full name of the adult signing.");
      return;
    }

    startTransition(async () => {
      const res = await onSign({
        consent,
        consentText: CONSENT_TEXT,
        kind,
        data: kind === "typed" ? name : (drawn ?? ""),
        name,
        guardian: guardian.trim(),
        onCamera: cameraChoice ?? !(guardian.trim().length > 0),
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      });
      if (res.error) setError(res.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <div className="sgn-done" role="status">
        <h2>Signed.</h2>
        <p>
          {asGuest
            ? "A copy is kept with the episode, along with the exact wording you agreed to. This link stays good — keep it if you want to read it again."
            : "A copy is kept with your record, along with the exact wording you agreed to. You can read it again from your member card at any time."}
        </p>
      </div>
    );
  }

  return (
    <div className="sgn">
      <section aria-labelledby={bodyId} className="sgn-doc">
        <h2 id={bodyId} className="mbr-eyebrow">
          {documentTitle}
        </h2>
        {/* tabIndex makes a scrollable region keyboard-reachable — 2.1.1. */}
        <div className="sgn-body" tabIndex={0} role="region" aria-label={`${documentTitle}, full text`}>
          {body.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </section>

      <fieldset className="sgn-field">
        <legend>How would you like to sign?</legend>
        <div className="sgn-choices">
          <label className="sgn-choice">
            <input
              type="radio"
              name="signature-kind"
              value="typed"
              checked={kind === "typed"}
              onChange={() => setKind("typed")}
            />
            <span>Type my name</span>
          </label>
          <label className="sgn-choice">
            <input
              type="radio"
              name="signature-kind"
              value="drawn"
              checked={kind === "drawn"}
              onChange={() => setKind("drawn")}
            />
            <span>Draw it</span>
          </label>
        </div>
      </fieldset>

      {kind === "typed" ? (
        <Input
          label="Your full name"
          hint="Typing your name here is your signature."
          value={typed}
          autoComplete="name"
          onChange={(e) => setTyped(e.target.value)}
          aria-describedby={error ? errorId : undefined}
        />
      ) : (
        <div className="sgn-draw">
          <span className="sgn-draw__label" id="sgn-draw-label">
            Draw your signature
          </span>
          <canvas
            ref={canvasRef}
            width={520}
            height={140}
            className="sgn-canvas"
            aria-labelledby="sgn-draw-label"
            onPointerDown={strokeStart}
            onPointerMove={strokeMove}
            onPointerUp={strokeEnd}
            onPointerLeave={strokeEnd}
          />
          <div className="sgn-draw__acts">
            <Button type="button" variant="ghost" size="sm" onClick={clearDrawing}>
              Clear
            </Button>
            <span className="mbr-mono">
              Prefer the keyboard? <button type="button" className="sgn-link" onClick={() => setKind("typed")}>Type your name instead</button>
            </span>
          </div>
        </div>
      )}

      {askGuardian ? (
        <Input
          label="If the person aboard is under 18, the name of the adult signing for them"
          hint="Leave blank if this is you and you are over 18."
          value={guardian}
          autoComplete="name"
          onChange={(e) => setGuardian(e.target.value)}
        />
      ) : null}

      {askCamera ? (
        <Checkbox
          label="Happy to appear on camera."
          description={
            guardian.trim().length > 0
              ? "Off for anyone under eighteen unless you tick it — production keeps them out of frame."
              : "Untick and production keeps you out of frame. The crew sheet carries it either way."
          }
          checked={cameraChoice ?? !(guardian.trim().length > 0)}
          onChange={(e) => setCameraChoice(e.target.checked)}
        />
      ) : null}

      <div className="sgn-consent">
        <Checkbox
          label={CONSENT_TEXT}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      {/* Announced when it appears, and referenced from the fields it concerns. */}
      <div id={errorId} role="alert" aria-live="assertive" className="sgn-error">
        {error}
      </div>

      <Button variant="gold" disabled={pending} onClick={submit}>
        {pending ? "Signing…" : "Sign"}
      </Button>
    </div>
  );
}
