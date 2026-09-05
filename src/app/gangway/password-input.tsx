"use client";

import React from "react";
import { Input, TextButton } from "@/components/ds";

/* A password field with a show/hide affordance in the kit Input's adornEnd
   slot — the 44px square at the field's end, which the input pads itself
   past. Two fields on one form (the reset page's "new" and "once more") share
   one switch through `shown`/`onToggle`, so a member never reads one in the
   clear and the other in dots. */
type InputProps = React.ComponentProps<typeof Input>;

export function PasswordInput({
  shown,
  onToggle,
  ...rest
}: Omit<InputProps, "type" | "adornEnd"> & { shown?: boolean; onToggle?: () => void }) {
  const [own, setOwn] = React.useState(false);
  const isShown = shown ?? own;
  const toggle = onToggle ?? (() => setOwn((s) => !s));
  return (
    <Input
      {...rest}
      type={isShown ? "text" : "password"}
      adornEnd={
        <TextButton
          tone="quiet"
          size="sm"
          onClick={toggle}
          aria-pressed={isShown}
          aria-label={isShown ? "Hide password" : "Show password"}
        >
          {isShown ? "Hide" : "Show"}
        </TextButton>
      }
    />
  );
}
