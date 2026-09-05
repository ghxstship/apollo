"use client";
import React from "react";
import { Icon } from "./icon";
import { IconButton } from "./actions";

/* Error text used to render as a bare sibling span: visible, but invisible to
   a screen reader. The control never announced itself invalid, the message was
   never associated with it, and nothing was announced on submit — so someone
   filling in the membership application by ear was told nothing when it
   failed. Every field here now wires aria-invalid + aria-describedby and
   announces the message when it appears. WCAG 3.3.1 / 1.3.1. */
function describedBy(
  error: React.ReactNode,
  hint: React.ReactNode,
  errorId: string,
  hintId: string,
  own?: string
): string | undefined {
  const ids = [own, error ? errorId : hint ? hintId : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

function Message({
  error, hint, errorId, hintId,
}: { error: React.ReactNode; hint: React.ReactNode; errorId: string; hintId: string }) {
  if (error) {
    return (
      <span className="ls-field__error" id={errorId} role="alert">
        {error}
      </span>
    );
  }
  if (hint) {
    return (
      <span className="ls-field__hint" id={hintId}>
        {hint}
      </span>
    );
  }
  return null;
}

/* — field width —
   Three widths a field can ask for, so a form stops measuring them inline:
     narrow  a code, a quantity, a year — about 14 characters
     wide    a name, an email, a one-line answer — about 36 characters
     full    stretches to the row it sits in (flex:1)
   Omit for the default: the field fills its container as it always has. */
export type FieldWidth = "narrow" | "wide" | "full";

function fieldClass(error: React.ReactNode, width: FieldWidth | undefined, className: string, extra?: string) {
  return ["ls-field", error ? "ls-field--error" : "", width ? "ls-field--" + width : "", extra ?? "", className].filter(Boolean).join(" ");
}

/* — Input —
   `ref` reaches the <input> itself (React 19 passes it as a plain prop), so a
   caller can focus the field or read its value — the one-time-code form on
   the gangway needs to put the caret in the code field the moment it mounts.
   Textarea and Select take theirs the same way.

   `adornEnd` is the one slot for anything that sits INSIDE the field at its
   end — the gangway's Show/Hide password toggle, SearchField's clear button.
   It is absolutely positioned in a 44px square flush with the field's edge,
   and the input pads itself past it, so the control is a full touch target and
   never overlaps the text. Put a TextButton or an IconButton (ghost, md) in
   it; a bare glyph works too. `adornStart` is the same slot at the start, for
   a glyph that says what the field is (SearchField's magnifier); it does not
   take the pointer, so a click on it lands in the input.

   `labelHidden` keeps the label in the accessibility tree and takes it off
   the screen — for a field whose purpose the surrounding design already
   states (a search box under a heading that says Search). */
export function Input({
  label, labelHidden = false, hint, error, width, adornStart, adornEnd, id, className = "", style, ref, ...rest
}: {
  label?: React.ReactNode; labelHidden?: boolean; hint?: React.ReactNode; error?: React.ReactNode;
  width?: FieldWidth; adornStart?: React.ReactNode; adornEnd?: React.ReactNode;
  className?: string; style?: React.CSSProperties; ref?: React.Ref<HTMLInputElement>;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = React.useId();
  const iid = id || auto;
  const input = (
    <input
      ref={ref}
      id={iid}
      className={["ls-input", adornStart ? "ls-input--adorned-start" : "", adornEnd ? "ls-input--adorned" : ""].filter(Boolean).join(" ")}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(error, hint, `${iid}-err`, `${iid}-hint`, rest["aria-describedby"])}
      {...rest}
    />
  );
  return (
    <div className={fieldClass(error, width, className)} style={style}>
      {label ? <label className={labelHidden ? "ls-field__label ls-visually-hidden" : "ls-field__label"} htmlFor={iid}>{label}</label> : null}
      {adornStart || adornEnd ? (
        <div className="ls-input-wrap">
          {adornStart ? <span className="ls-input__adorn ls-input__adorn--start">{adornStart}</span> : null}
          {input}
          {adornEnd ? <span className="ls-input__adorn">{adornEnd}</span> : null}
        </div>
      ) : input}
      <Message error={error} hint={hint} errorId={`${iid}-err`} hintId={`${iid}-hint`} />
    </div>
  );
}

/* — Textarea — */
export function Textarea({
  label, labelHidden = false, hint, error, width, id, rows = 4, className = "", style, ref, ...rest
}: {
  label?: React.ReactNode; labelHidden?: boolean; hint?: React.ReactNode; error?: React.ReactNode; width?: FieldWidth;
  className?: string; style?: React.CSSProperties; ref?: React.Ref<HTMLTextAreaElement>;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = React.useId();
  const iid = id || auto;
  return (
    <div className={fieldClass(error, width, className)} style={style}>
      {label ? <label className={labelHidden ? "ls-field__label ls-visually-hidden" : "ls-field__label"} htmlFor={iid}>{label}</label> : null}
      <textarea
        ref={ref}
        id={iid}
        rows={rows}
        className="ls-textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(error, hint, `${iid}-err`, `${iid}-hint`, rest["aria-describedby"])}
        {...rest}
      ></textarea>
      <Message error={error} hint={hint} errorId={`${iid}-err`} hintId={`${iid}-hint`} />
    </div>
  );
}

/* — Select — */
export function Select({
  label, labelHidden = false, hint, error, width, options = [], placeholder, id, className = "", style, children, ref, ...rest
}: {
  label?: React.ReactNode; labelHidden?: boolean; hint?: React.ReactNode; error?: React.ReactNode; width?: FieldWidth;
  options?: Array<{ value: string; label: string }>; placeholder?: string;
  className?: string; style?: React.CSSProperties; children?: React.ReactNode;
  ref?: React.Ref<HTMLSelectElement>;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = React.useId();
  const iid = id || auto;
  return (
    <div className={fieldClass(error, width, className)} style={style}>
      {label ? <label className={labelHidden ? "ls-field__label ls-visually-hidden" : "ls-field__label"} htmlFor={iid}>{label}</label> : null}
      <div className="ls-select-wrap">
        <select
          ref={ref}
          id={iid}
          className="ls-select"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(error, hint, `${iid}-err`, `${iid}-hint`, rest["aria-describedby"])}
          defaultValue={rest.value === undefined && placeholder ? "" : undefined}
          {...rest}
        >
          {placeholder ? <option value="" disabled>{placeholder}</option> : null}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {children}
        </select>
      </div>
      <Message error={error} hint={hint} errorId={`${iid}-err`} hintId={`${iid}-hint`} />
    </div>
  );
}

/* — SearchField —
   An Input dressed for search: a leading glyph, type="search" with the
   browser's own cancel button suppressed, and — when `onClear` is given and
   there is something to clear — a 44px clear button in the adornEnd slot.
   `pending` marks the field aria-busy while results are being fetched and
   pulses the glyph. Controlled (`value` + `onChange`) or uncontrolled; in the
   uncontrolled case the clear button is always offered and `onClear` should
   reset the field through its ref.

   The label is visually hidden by default — a search box states its purpose
   by shape — but it is always there for the accessibility tree; pass
   `labelHidden={false}` to show it. */
export function SearchField({
  label = "Search", labelHidden = true, onClear, clearLabel = "Clear", pending = false, value, className = "", ...rest
}: {
  label?: React.ReactNode; labelHidden?: boolean;
  onClear?: () => void; clearLabel?: string; pending?: boolean;
  hint?: React.ReactNode; error?: React.ReactNode; width?: FieldWidth;
  className?: string; style?: React.CSSProperties; ref?: React.Ref<HTMLInputElement>;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const showClear = !!onClear && (value === undefined || value === null || String(value) !== "");
  return (
    <Input
      type="search"
      inputMode="search"
      enterKeyHint="search"
      autoComplete="off"
      label={label}
      labelHidden={labelHidden}
      value={value}
      className={["ls-searchfield", pending ? "ls-searchfield--pending" : "", className].filter(Boolean).join(" ")}
      aria-busy={pending || undefined}
      adornStart={<span className="ls-searchfield__glyph"><Icon name="Search" size={16} /></span>}
      adornEnd={showClear ? (
        <IconButton variant="ghost" size="md" label={clearLabel} onClick={onClear} className="ls-searchfield__clear">
          <Icon name="X" size={16} />
        </IconButton>
      ) : null}
      {...rest}
    />
  );
}

/* — OptionRow —
   A boxed, full-width choice: the whole row is the target, the mark sits at
   the start, the label and its description fill the middle and an optional
   figure (a price, a count, a date) sits at the end in mono. Radio or checkbox
   semantics by `kind`; the input is a real one, so name/value/checked/onChange
   and the form all behave as they would on a bare control, and the arrow keys
   move between radios in the same `name`.

   Checked and disabled faces are drawn from the input's own state (:has), so
   an uncontrolled row needs no prop to look checked. This is the "boxed"
   variant Radio and Checkbox render through when asked. */
export function OptionRow({
  kind = "radio", label, description, figure, error, disabled = false, id, className = "", style, ...rest
}: {
  kind?: "radio" | "checkbox";
  label: React.ReactNode; description?: React.ReactNode;
  /** Trailing figure — a price, a count, a date. Mono, tabular. */
  figure?: React.ReactNode;
  error?: React.ReactNode;
  className?: string; style?: React.CSSProperties;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "children">) {
  const auto = React.useId();
  const iid = id || auto;
  const markCls = kind === "radio" ? "ls-radio__dot" : "ls-check__box";
  const base = kind === "radio" ? "ls-radio" : "ls-check";
  return (
    <label
      className={[base, "ls-option", disabled ? "ls-option--disabled" : "", error ? "ls-option--error" : "", className].filter(Boolean).join(" ")}
      style={style}
    >
      <input
        id={iid}
        type={kind}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${iid}-err` : description ? `${iid}-desc` : undefined}
        {...rest}
      />
      <span className={markCls}></span>
      <span className="ls-option__text">
        <span className="ls-option__label">{label}</span>
        {error ? (
          <span className="ls-option__desc ls-option__desc--error" id={`${iid}-err`} role="alert">{error}</span>
        ) : description ? (
          <span className="ls-option__desc" id={`${iid}-desc`}>{description}</span>
        ) : null}
      </span>
      {figure != null ? <span className="ls-option__figure">{figure}</span> : null}
    </label>
  );
}

/* — Checkbox —
   The only blocking error on the public casting form lived here, and unlike
   Input/Select/Textarea this component had no `error` prop at all: the message
   was a coloured span with no role, no aria-invalid and no association, so a
   screen-reader user got nothing and the sole cue was colour (WCAG 1.4.1).

   `boxed` renders the same control as an OptionRow — a full-width bordered
   row — for a list of choices that should read as options rather than as a
   form's fine print. */
export function Checkbox({
  label, description, error, boxed = false, figure, disabled = false, id, className = "", style, ...rest
}: {
  label?: React.ReactNode; description?: React.ReactNode; error?: React.ReactNode;
  boxed?: boolean; figure?: React.ReactNode;
  className?: string; style?: React.CSSProperties;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = React.useId();
  const iid = id || auto;
  if (boxed) {
    return <OptionRow kind="checkbox" label={label} description={description} error={error} figure={figure} disabled={disabled} id={iid} className={className} style={style} {...rest} />;
  }
  return (
    <label
      className={["ls-check", disabled ? "ls-check--disabled" : "", error ? "ls-check--error" : "", className].filter(Boolean).join(" ")}
      style={style}
    >
      <input
        id={iid}
        type="checkbox"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${iid}-err` : undefined}
        {...rest}
      />
      <span className="ls-check__box"></span>
      {label ? (
        <span className="ls-check__label">
          {label}
          {error ? (
            <span className="ls-check__desc ls-check__desc--error" id={`${iid}-err`} role="alert">
              {error}
            </span>
          ) : description ? (
            <span className="ls-check__desc">{description}</span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}

/* — Radio —
   `boxed` renders through OptionRow: the same input, drawn as a full-width
   bordered row with room for a description and a trailing figure. */
export function Radio({
  label, description, figure, boxed = false, disabled = false, className = "", style, ...rest
}: {
  label?: React.ReactNode; description?: React.ReactNode; figure?: React.ReactNode; boxed?: boolean;
  className?: string; style?: React.CSSProperties;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  if (boxed) {
    return <OptionRow kind="radio" label={label} description={description} figure={figure} disabled={disabled} className={className} style={style} {...rest} />;
  }
  return (
    <label className={["ls-radio", disabled ? "ls-radio--disabled" : "", className].filter(Boolean).join(" ")} style={style}>
      <input type="radio" disabled={disabled} {...rest} />
      <span className="ls-radio__dot"></span>
      {label ? <span className="ls-radio__label">{label}</span> : null}
    </label>
  );
}

/* — Switch — */
export function Switch({
  label, disabled = false, className = "", style, ...rest
}: { label?: React.ReactNode; className?: string; style?: React.CSSProperties } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={["ls-switch", disabled ? "ls-switch--disabled" : "", className].filter(Boolean).join(" ")} style={style}>
      <input type="checkbox" role="switch" disabled={disabled} {...rest} />
      <span className="ls-switch__track"></span>
      {label ? <span className="ls-switch__label">{label}</span> : null}
    </label>
  );
}

/* — Stepper —
   `disabled` takes the whole control out: both buttons disabled, the group
   aria-disabled and faded — for a quantity that is fixed while an order is
   being placed, or a sold-out line. */
export function Stepper({
  value = 0, onChange, min = 0, max = 99, size = "md", inverse = false, disabled = false,
  decrementLabel = "Decrease", incrementLabel = "Increase", label, className = "", style,
}: {
  value?: number; onChange?: (n: number) => void; min?: number; max?: number;
  size?: "sm" | "md"; inverse?: boolean; disabled?: boolean; decrementLabel?: string; incrementLabel?: string;
  /** Names the group — what is being counted ("Guests", "Quantity"). */
  label?: string;
  className?: string; style?: React.CSSProperties;
}) {
  const set = (v: number) => { const n = Math.min(max, Math.max(min, v)); if (n !== value && onChange) onChange(n); };
  /* The value used to be its own aria-live region, so a table of steppers
     was a table of live regions and any one changing was read against the
     rest. The value rides on the buttons' labels instead: focus stays on
     the button that was pressed, and its label now says what it did. */
  return (
    <span
      className={["ls-stepper", "ls-stepper--" + size, inverse ? "ls-stepper--inverse" : "", disabled ? "ls-stepper--disabled" : "", className].filter(Boolean).join(" ")}
      style={style} role="group" aria-label={label} aria-disabled={disabled || undefined}
    >
      <button type="button" aria-label={`${decrementLabel}, now ${value}`} disabled={disabled || value <= min} onClick={() => set(value - 1)}>−</button>
      <span className="ls-stepper__val">{value}</span>
      <button type="button" aria-label={`${incrementLabel}, now ${value}`} disabled={disabled || value >= max} onClick={() => set(value + 1)}>+</button>
    </span>
  );
}
