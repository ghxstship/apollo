"use client";

/* The last net: a throw in the root layout itself, where no shell or stylesheet
   is guaranteed. It has to carry its own html and body tags. */
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
          background: "#0b0f14",
          color: "#e8e6e1",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          margin: 0,
          padding: "96px 24px",
        }}
      >
        <p style={{ letterSpacing: "0.18em", fontSize: 12, opacity: 0.7 }}>[UN]</p>
        <h1 style={{ marginTop: 12, fontSize: 32 }}>That didn&rsquo;t land.</h1>
        <p style={{ maxWidth: 460, marginTop: 12, lineHeight: 1.6 }}>
          Our end, not yours. Reload, and if it keeps happening write to us.
        </p>
        <button
          onClick={reset}
          type="button"
          style={{
            marginTop: 24,
            padding: "12px 20px",
            background: "#c8a656",
            color: "#0b0f14",
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
