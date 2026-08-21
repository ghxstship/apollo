/* SYRIUS SOCIAL has no logo — the kit is explicit: the wordmark is set in
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
          color: "var(--text-1)",
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
