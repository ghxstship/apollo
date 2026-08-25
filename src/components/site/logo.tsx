/* The site nav's lockup. There is no logo asset and no drawn mark: the wordmark
   is type-set, and it is set in exactly one place — the Wordmark primitive in
   components/ds/display.tsx, which is where the bracket, casing and colour
   invariants are enforced. This component is a placement, not a second setting;
   anything it did on its own (its own display face, its own rule colour) would
   be a mark the brand does not own. */
import { Wordmark } from "@/components/ds";

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
