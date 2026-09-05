"use client";
import React from "react";
import { cx } from "./class";
import { Icon } from "./icon";
import { IconButton } from "./actions";

/* Error text used to render as a bare sibling span: visible, but invisible to
   a screen reader. The control never announced itself invalid, the message was
   never associated with it, and nothing was announced on submit — so someone
   filling in the membership application by ear was told nothing when it
   failed. Every field here now wires aria-invalid + aria-describedby and
   announces the message when it appears. WCAG 3.3.1 / 1.3.1.

   The merge below was being thrown away. Every field computed it and then
   spread `{...rest}` AFTER the attribute, so a caller who described a field
   themselves — the gangway's code field, the search slate's combobox — silently
   replaced the error and hint association with their own id and the message
   went back to being invisible. `rest` is now spread FIRST and the two computed
   attributes are set last, over the top of it, with the caller's own
   aria-describedby destructured out and merged in rather than overwritten. */
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

function fieldClass(error: React.ReactNode, width: FieldWidth | undefined, className: string) {
  return cx("ls-field", error && "ls-field--error", width && "ls-field--" + width, className);
}

/* — Field —
   The shell every text control wears: the ruled block, its label, and the one
   line under it that is either the hint or the error. Input, Textarea and
   Select each rebuilt it — three copies of the same label element, the same
   `ls-visually-hidden` swap and the same Message call — and three copies is
   how a fourth control ends up shipping without a label association at all.

   The CONTROL is the caller's, and so is everything that goes on it:
   `aria-invalid`, `aria-describedby` and the ids they point at are computed
   beside the element they belong to, because that is the association the H5
   fix is about and it must not become something a wrapper does at a distance.
   This owns the box; the control owns its own semantics. */
function Field({
  id, label, labelHidden = false, hint, error, width, className = "", style, children,
}: {
  id: string;
  label?: React.ReactNode; labelHidden?: boolean;
  hint?: React.ReactNode; error?: React.ReactNode;
  width?: FieldWidth;
  className?: string; style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className={fieldClass(error, width, className)} style={style}>
      {label ? (
        <label className={labelHidden ? "ls-field__label ls-visually-hidden" : "ls-field__label"} htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children}
      <Message error={error} hint={hint} errorId={`${id}-err`} hintId={`${id}-hint`} />
    </div>
  );
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
export type InputProps = {
  label?: React.ReactNode; labelHidden?: boolean; hint?: React.ReactNode; error?: React.ReactNode;
  width?: FieldWidth; adornStart?: React.ReactNode; adornEnd?: React.ReactNode;
  /** Shown and read, not editable — a value the reader may copy but not
      change. It rides `...rest` onto the input, where `:read-only` gives it a
      face of its own: distinct from `disabled`, which is a control that is
      not there for you at all. */
  readOnly?: boolean;
  className?: string; style?: React.CSSProperties; ref?: React.Ref<HTMLInputElement>;
} & React.InputHTMLAttributes<HTMLInputElement>;

export function Input({
  label, labelHidden = false, hint, error, width, adornStart, adornEnd, id, className = "", style, ref,
  "aria-describedby": ownDescribedBy, "aria-invalid": ownInvalid, ...rest
}: InputProps) {
  const auto = React.useId();
  const iid = id || auto;
  const input = (
    <input
      {...rest}
      ref={ref}
      id={iid}
      className={cx("ls-input", adornStart && "ls-input--adorned-start", adornEnd && "ls-input--adorned")}
      aria-invalid={error ? true : ownInvalid}
      aria-describedby={describedBy(error, hint, `${iid}-err`, `${iid}-hint`, ownDescribedBy)}
    />
  );
  return (
    <Field id={iid} label={label} labelHidden={labelHidden} hint={hint} error={error} width={width} className={className} style={style}>
      {adornStart || adornEnd ? (
        <div className="ls-input-wrap">
          {adornStart ? <span className="ls-input__adorn ls-input__adorn--start">{adornStart}</span> : null}
          {input}
          {adornEnd ? <span className="ls-input__adorn">{adornEnd}</span> : null}
        </div>
      ) : input}
    </Field>
  );
}

/* — Textarea — */
export type TextareaProps = {
  label?: React.ReactNode; labelHidden?: boolean; hint?: React.ReactNode; error?: React.ReactNode; width?: FieldWidth;
  /** Shown and read, not editable. See Input. */
  readOnly?: boolean;
  className?: string; style?: React.CSSProperties; ref?: React.Ref<HTMLTextAreaElement>;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({
  label, labelHidden = false, hint, error, width, id, rows = 4, className = "", style, ref,
  "aria-describedby": ownDescribedBy, "aria-invalid": ownInvalid, ...rest
}: TextareaProps) {
  const auto = React.useId();
  const iid = id || auto;
  return (
    <Field id={iid} label={label} labelHidden={labelHidden} hint={hint} error={error} width={width} className={className} style={style}>
      <textarea
        {...rest}
        ref={ref}
        id={iid}
        rows={rows}
        className="ls-textarea"
        aria-invalid={error ? true : ownInvalid}
        aria-describedby={describedBy(error, hint, `${iid}-err`, `${iid}-hint`, ownDescribedBy)}
      ></textarea>
    </Field>
  );
}

/* — Select — */
export type SelectProps = {
  label?: React.ReactNode; labelHidden?: boolean; hint?: React.ReactNode; error?: React.ReactNode; width?: FieldWidth;
  options?: Array<{ value: string; label: string }>; placeholder?: string;
  className?: string; style?: React.CSSProperties; children?: React.ReactNode;
  ref?: React.Ref<HTMLSelectElement>;
} & React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({
  label, labelHidden = false, hint, error, width, options = [], placeholder, id, className = "", style, children, ref,
  "aria-describedby": ownDescribedBy, "aria-invalid": ownInvalid, ...rest
}: SelectProps) {
  const auto = React.useId();
  const iid = id || auto;
  return (
    <Field id={iid} label={label} labelHidden={labelHidden} hint={hint} error={error} width={width} className={className} style={style}>
      <div className="ls-select-wrap">
        <select
          {...rest}
          ref={ref}
          id={iid}
          className="ls-select"
          defaultValue={rest.value === undefined && placeholder ? "" : rest.defaultValue}
          aria-invalid={error ? true : ownInvalid}
          aria-describedby={describedBy(error, hint, `${iid}-err`, `${iid}-hint`, ownDescribedBy)}
        >
          {placeholder ? <option value="" disabled>{placeholder}</option> : null}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {children}
        </select>
      </div>
    </Field>
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
export type SearchFieldProps = {
  label?: React.ReactNode; labelHidden?: boolean;
  onClear?: () => void; clearLabel?: string; pending?: boolean;
  hint?: React.ReactNode; error?: React.ReactNode; width?: FieldWidth;
  className?: string; style?: React.CSSProperties; ref?: React.Ref<HTMLInputElement>;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function SearchField({
  label = "Search", labelHidden = true, onClear, clearLabel = "Clear", pending = false, value, className = "", ...rest
}: SearchFieldProps) {
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
      className={cx("ls-searchfield", pending && "ls-searchfield--pending", className)}
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
export type OptionRowProps = {
  kind?: "radio" | "checkbox";
  label: React.ReactNode; description?: React.ReactNode;
  /** Trailing figure — a price, a count, a date. Mono, tabular. */
  figure?: React.ReactNode;
  error?: React.ReactNode;
  className?: string; style?: React.CSSProperties;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "children">;

export function OptionRow({
  kind = "radio", label, description, figure, error, disabled = false, id, className = "", style,
  "aria-describedby": ownDescribedBy, "aria-invalid": ownInvalid, ...rest
}: OptionRowProps) {
  const auto = React.useId();
  const iid = id || auto;
  const markCls = kind === "radio" ? "ls-radio__dot" : "ls-check__box";
  const base = kind === "radio" ? "ls-radio" : "ls-check";
  return (
    <label
      className={cx(base, "ls-option", disabled && "ls-option--disabled", error && "ls-option--error", className)}
      style={style}
    >
      <input
        {...rest}
        id={iid}
        type={kind}
        disabled={disabled}
        aria-invalid={error ? true : ownInvalid}
        aria-describedby={describedBy(error, description, `${iid}-err`, `${iid}-desc`, ownDescribedBy)}
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
export type CheckboxProps = {
  label?: React.ReactNode; description?: React.ReactNode; error?: React.ReactNode;
  boxed?: boolean; figure?: React.ReactNode;
  className?: string; style?: React.CSSProperties;
} & React.InputHTMLAttributes<HTMLInputElement>;

export function Checkbox({
  label, description, error, boxed = false, figure, disabled = false, id, className = "", style,
  "aria-describedby": ownDescribedBy, "aria-invalid": ownInvalid, ...rest
}: CheckboxProps) {
  const auto = React.useId();
  const iid = id || auto;
  if (boxed) {
    return <OptionRow kind="checkbox" label={label} description={description} error={error} figure={figure} disabled={disabled} id={iid} className={className} style={style} aria-describedby={ownDescribedBy} aria-invalid={ownInvalid} {...rest} />;
  }
  return (
    <label
      className={cx("ls-check", disabled && "ls-check--disabled", error && "ls-check--error", className)}
      style={style}
    >
      <input
        {...rest}
        id={iid}
        type="checkbox"
        disabled={disabled}
        aria-invalid={error ? true : ownInvalid}
        /* The description used to render with no id and no association, so
           the one sentence explaining what the reader was agreeing to was
           visible and nowhere in the accessibility tree. Same mechanism the
           error already used — and the same precedence: an error REPLACES the
           description rather than joining it, so the control is not read
           twice. (The boxed path through OptionRow always did this.)

           Both messages live inside the label block below, so a Checkbox with
           no label has nowhere to draw them — and an id that renders nowhere
           is a dangling reference a screen reader follows to silence. Neither
           is associated unless there is a label to carry it. */
        aria-describedby={describedBy(label && error, label && description, `${iid}-err`, `${iid}-desc`, ownDescribedBy)}
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
            <span className="ls-check__desc" id={`${iid}-desc`}>{description}</span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}

/* — Radio —
   `boxed` renders through OptionRow: the same input, drawn as a full-width
   bordered row with room for a description and a trailing figure. */
export type RadioProps = {
  label?: React.ReactNode; description?: React.ReactNode; figure?: React.ReactNode; boxed?: boolean;
  className?: string; style?: React.CSSProperties;
} & React.InputHTMLAttributes<HTMLInputElement>;

export function Radio({
  label, description, figure, boxed = false, disabled = false, className = "", style, ...rest
}: RadioProps) {
  if (boxed) {
    return <OptionRow kind="radio" label={label} description={description} figure={figure} disabled={disabled} className={className} style={style} {...rest} />;
  }
  return (
    <label className={cx("ls-radio", disabled && "ls-radio--disabled", className)} style={style}>
      <input type="radio" disabled={disabled} {...rest} />
      <span className="ls-radio__dot"></span>
      {label ? <span className="ls-radio__label">{label}</span> : null}
    </label>
  );
}

/* — Switch — */
export type SwitchProps = {
  label?: React.ReactNode; className?: string; style?: React.CSSProperties;
} & React.InputHTMLAttributes<HTMLInputElement>;

export function Switch({
  label, disabled = false, className = "", style, ...rest
}: SwitchProps) {
  return (
    <label className={cx("ls-switch", disabled && "ls-switch--disabled", className)} style={style}>
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
export interface StepperProps {
  value?: number; onChange?: (n: number) => void; min?: number; max?: number;
  size?: "sm" | "md"; inverse?: boolean; disabled?: boolean; decrementLabel?: string; incrementLabel?: string;
  /** Names the group — what is being counted ("Guests", "Quantity"). */
  label?: string;
  className?: string; style?: React.CSSProperties;
}

export function Stepper({
  value = 0, onChange, min = 0, max = 99, size = "md", inverse = false, disabled = false,
  decrementLabel = "Decrease", incrementLabel = "Increase", label, className = "", style,
}: StepperProps) {
  const set = (v: number) => { const n = Math.min(max, Math.max(min, v)); if (n !== value && onChange) onChange(n); };
  /* The value used to be its own aria-live region, so a table of steppers
     was a table of live regions and any one changing was read against the
     rest. The value rides on the buttons' labels instead: focus stays on
     the button that was pressed, and its label now says what it did. */
  return (
    <span
      className={cx("ls-stepper", "ls-stepper--" + size, inverse && "ls-stepper--inverse", disabled && "ls-stepper--disabled", className)}
      style={style} role="group" aria-label={label} aria-disabled={disabled || undefined}
    >
      <button type="button" aria-label={`${decrementLabel}, now ${value}`} disabled={disabled || value <= min} onClick={() => set(value - 1)}>−</button>
      <span className="ls-stepper__val">{value}</span>
      <button type="button" aria-label={`${incrementLabel}, now ${value}`} disabled={disabled || value >= max} onClick={() => set(value + 1)}>+</button>
    </span>
  );
}
