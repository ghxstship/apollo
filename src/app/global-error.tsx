"use client";

/* The last net: a throw in the root layout itself, where no shell or stylesheet
   is guaranteed. It has to carry its own html and body tags.

   Which is also why the three colours below are raw hex rather than var(): this
   component replaces the whole document, so no stylesheet is loaded and no
   custom property resolves. They were #0b0f14, #e8e6e1 and #c8a656 — the
   retired Lyre navy-and-antique-gold — still being painted on the one screen a
   member sees when everything else has already failed. They are now the current
   palette, transcribed: ink ground, ivory type, and the ink theme's accent,
   which under Option C is that same ivory. Re-transcribe when the palette moves. */
const INK = "#141414"; /* --noir-900 */
const IVORY = "#F1F1ED"; /* --ivory-100 — and, on ink, --accent */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: INK,
          color: IVORY,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          margin: 0,
          padding: "96px 24px",
        }}
      >
        <p style={{ letterSpacing: "0.18em", fontSize: 12, opacity: 0.7 }}>[un]</p>
        <h1 style={{ marginTop: 12, fontSize: 36 }}>That didn&rsquo;t land.</h1>
        <p style={{ maxWidth: 460, marginTop: 12, lineHeight: 1.6 }}>
          Our end, not yours. Reload, and if it keeps happening write to us.
        </p>
        <button
          onClick={reset}
          type="button"
          style={{
            marginTop: 24,
            padding: "12px 20px",
            background: IVORY,
            color: INK,
            border: 0,
            borderRadius: 2,
            cursor: "pointer",
            letterSpacing: "0.08em",
          }}
        >
          Try again
        </button>
        {error.digest ? (
          <p style={{ marginTop: 24, fontSize: 12, opacity: 0.6 }}>REF {error.digest}</p>
        ) : null}
      </body>
    </html>
  );
}
