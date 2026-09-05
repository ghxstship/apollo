/* — class names, in one place —

   Thirty-six hand-written `[a, b ? "x" : "", cls].filter(Boolean).join(" ")`
   chains stood in this kit, one per component, each retyped from the last.
   They are all the same expression, and a retyped expression is an expression
   that will eventually be typed differently: the four button components each
   built their own class string and had already drifted apart — one of them
   forgot the pending modifier, another forgot the disabled one, and neither
   omission is visible from a call site.

   `cx` is the chain, named. `buttonClass` is the button family's whole class
   string, owned once, so the next modifier is added in one place and every
   button gets it. */

/* Everything `a && "cls"` can evaluate to. `a` is often a ReactNode — an
   `error` prop, a `label` — whose falsy members include 0 and 0n as well as
   false, "" , null and undefined, so the type has to admit all of them or
   every call site has to write `!!error &&`. */
export type ClassPart = string | false | null | undefined | 0 | 0n;

/** Join the parts that are non-empty strings, drop the rest. */
export function cx(...parts: ClassPart[]): string {
  return parts.filter(Boolean).join(" ");
}

/** The three bases in the button family. `ls-textbtn` also carries the
    `ls-bare` reset, which is what gives it its focus ring and its 44px touch
    pseudo — it is part of the base, not of the caller's className. */
export type ButtonBase = "ls-btn" | "ls-iconbtn" | "ls-textbtn";

export interface ButtonClassOptions {
  base: ButtonBase;
  /** Variant or tone — whatever the family calls its face. */
  variant?: string;
  size?: string;
  inverse?: boolean;
  /** `ls-btn` only; the icon and text buttons have no full-width face. */
  fullWidth?: boolean;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
}

/* `disabled` and `pending` are mutually exclusive FACES even though a pending
   control is also a disabled one: pending owns the appearance while it runs,
   and a control that showed both would read as unavailable rather than as
   busy. That rule lived in four copies of a ternary; it lives here now. */
export function buttonClass({
  base, variant, size, inverse, fullWidth, disabled, pending, className,
}: ButtonClassOptions): string {
  return cx(
    base === "ls-textbtn" ? "ls-bare" : null,
    base,
    variant ? `${base}--${variant}` : null,
    size ? `${base}--${size}` : null,
    inverse ? `${base}--inverse` : null,
    fullWidth ? `${base}--full` : null,
    disabled && !pending ? `${base}--disabled` : null,
    pending ? `${base}--pending` : null,
    className
  );
}
