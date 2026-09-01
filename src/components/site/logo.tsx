/* The site nav's lockup. There is no logo asset and no drawn mark: the wordmark
   is type-set, and it is set in exactly one place — the Wordmark primitive in
   components/ds/display.tsx, which is where the bracket, casing and colour
   invariants are enforced. This component is a placement, not a second setting;
   anything it did on its own (its own display face, its own rule colour) would
   be a mark the brand does not own. */
import { Wordmark } from "@/components/ds";
import { ANCHOR, TAGLINE } from "@/lib/brand";

export function LockupHorizontal({ height = 34 }: { height?: number }) {
  return (
    <Wordmark
      /* System A. brand-architecture.md: the parent wins wherever both would
         work, because it compounds recognition across every division instead
         of splitting it five ways — and a site nav is the umbrella speaking. */
      suffix={null}
      size={Math.round(height * 0.52)}
      /* .ws-nav paints --surface-deep in BOTH themes, so the anchor is set on
         its knockout step rather than on --text-body. A wordmark that follows
         the theme instead of its own ground is how this went to 1.00:1 against
         the nav in light mode once already. */
      inverse
    />
  );
}

/* The tagline lockup — brand-architecture §Tagline, Option 1 "Active Rule",
   the master form for web headlines. Like the Wordmark, it is set in exactly
   one place so the invariants hold by construction rather than by review:

   - [UN] in Anton caps; the phrase in Space Mono LOWERCASE at .65 of the
     bracket size — "lowercase, always, in mono. It is not a sentence and
     takes no full stop." The lowercase is enforced in ws-tagline__line's CSS
     transform, so the phrase stays lowercase even inside the uppercased
     h1–h4 base rule (owner ruling 2026-08-31: the hero moves to this lockup
     and base.css takes the blanket uppercase).
   - One full character space after the closing bracket — .61em of the
     TAGLINE size, which is one Space Mono advance.
   - The continuous 1.5pt rule runs the exact length of the phrase — an
     active form field, not decorative underlining — and keeps .06em clear
     of the descenders on g and y.

   Sized in em: one font-size on the surrounding element scales the whole
   mark, so the hero and a 22px page tag are the same setting at two sizes. */
export function TaglineMark({ className = "" }: { className?: string }) {
  return (
    <span className={["ws-tagline", className].filter(Boolean).join(" ")}>
      <span className="ws-tagline__anchor">{ANCHOR}</span>
      <span className="ws-tagline__line">{TAGLINE}</span>
    </span>
  );
}
