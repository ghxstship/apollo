/* [UN] has no logo — the kit is explicit: the wordmark is set in
   plain type, and a mark is never drawn or generated. This lockup is Marcellus
   with a hairline gold rule, nothing else. */
import { WORDMARK } from "@/lib/brand";

export function LockupHorizontal({ height = 34 }: { height?: number }) {
  const fontSize = Math.round(height * 0.52);
  return (
    <span
      role="img"
      aria-label={WORDMARK}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: Math.max(3, Math.round(height * 0.12)),
        lineHeight: 1,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize,
          letterSpacing: ".14em",
          /* Inherit: this sits inside an always-dark nav on a page whose --text-1
             flips with the theme, so pinning it made the wordmark identical to
             the nav background in light mode — invisible at 1.00:1. */
          color: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {WORDMARK}
      </span>
      <span
        aria-hidden
        style={{ height: 1, background: "var(--gold-500)", opacity: 0.8 }}
      />
    </span>
  );
}
