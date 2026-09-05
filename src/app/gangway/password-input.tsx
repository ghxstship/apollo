"use client";

import React from "react";
import { Input } from "@/components/ds";

/* A password field with a show/hide affordance. The kit's Input has no slot
   for a trailing control, so the toggle sits over the field's end, sized to
   the 44px the input already is. Two fields on one form (the reset page's
   "new" and "once more") share one switch through `shown`/`onToggle`, so a
   member never reads one in the clear and the other in dots. */
type InputProps = React.ComponentProps<typeof Input>;

export function PasswordInput({
  shown,
  onToggle,
  ...rest
}: Omit<InputProps, "type"> & { shown?: boolean; onToggle?: () => void }) {
  const [own, setOwn] = React.useState(false);
  const isShown = shown ?? own;
  const toggle = onToggle ?? (() => setOwn((s) => !s));
  return (
    <div className="gw-pw">
      <Input {...rest} type={isShown ? "text" : "password"} />
      <button
        type="button"
        className="gw-pw__eye"
        onClick={toggle}
        aria-pressed={isShown}
        aria-label={isShown ? "Hide password" : "Show password"}
      >
        {isShown ? "Hide" : "Show"}
      </button>
    </div>
  );
}
