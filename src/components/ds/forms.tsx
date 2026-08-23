"use client";
import React from "react";

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

/* — Input — */
export function Input({
  label, hint, error, id, className = "", style, ...rest
}: { label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; className?: string; style?: React.CSSProperties } & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = React.useId();
  const iid = id || auto;
  return (
    <div className={["ls-field", error ? "ls-field--error" : "", className].filter(Boolean).join(" ")} style={style}>
      {label ? <label className="ls-field__label" htmlFor={iid}>{label}</label> : null}
      <input
        id={iid}
        className="ls-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(error, hint, `${iid}-err`, `${iid}-hint`, rest["aria-describedby"])}
        {...rest}
      />
      <Message error={error} hint={hint} errorId={`${iid}-err`} hintId={`${iid}-hint`} />
    </div>
  );
}

/* — Textarea — */
export function Textarea({
  label, hint, error, id, rows = 4, className = "", style, ...rest
}: { label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; className?: string; style?: React.CSSProperties } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = React.useId();
  const iid = id || auto;
  return (
    <div className={["ls-field", error ? "ls-field--error" : "", className].filter(Boolean).join(" ")} style={style}>
      {label ? <label className="ls-field__label" htmlFor={iid}>{label}</label> : null}
      <textarea
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
  label, hint, error, options = [], placeholder, id, className = "", style, children, ...rest
}: {
  label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode;
  options?: Array<{ value: string; label: string }>; placeholder?: string;
  className?: string; style?: React.CSSProperties; children?: React.ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = React.useId();
  const iid = id || auto;
  return (
    <div className={["ls-field", error ? "ls-field--error" : "", className].filter(Boolean).join(" ")} style={style}>
      {label ? <label className="ls-field__label" htmlFor={iid}>{label}</label> : null}
      <div className="ls-select-wrap">
        <select
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

/* — Checkbox — */
export function Checkbox({
  label, description, disabled = false, className = "", style, ...rest
}: { label?: React.ReactNode; description?: React.ReactNode; className?: string; style?: React.CSSProperties } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={["ls-check", disabled ? "ls-check--disabled" : "", className].filter(Boolean).join(" ")} style={style}>
      <input type="checkbox" disabled={disabled} {...rest} />
      <span className="ls-check__box"></span>
      {label ? <span className="ls-check__label">{label}{description ? <span className="ls-check__desc">{description}</span> : null}</span> : null}
    </label>
  );
}

/* — Radio — */
export function Radio({
  label, disabled = false, className = "", style, ...rest
}: { label?: React.ReactNode; className?: string; style?: React.CSSProperties } & React.InputHTMLAttributes<HTMLInputElement>) {
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

/* — Stepper — */
export function Stepper({
  value = 0, onChange, min = 0, max = 99, size = "md", inverse = false,
  decrementLabel = "Decrease", incrementLabel = "Increase", className = "", style,
}: {
  value?: number; onChange?: (n: number) => void; min?: number; max?: number;
  size?: "sm" | "md"; inverse?: boolean; decrementLabel?: string; incrementLabel?: string;
  className?: string; style?: React.CSSProperties;
}) {
  const set = (v: number) => { const n = Math.min(max, Math.max(min, v)); if (n !== value && onChange) onChange(n); };
  return (
    <span className={["ls-stepper", "ls-stepper--" + size, inverse ? "ls-stepper--inverse" : "", className].filter(Boolean).join(" ")} style={style} role="group">
      <button type="button" aria-label={decrementLabel} disabled={value <= min} onClick={() => set(value - 1)}>−</button>
      <span className="ls-stepper__val" aria-live="polite">{value}</span>
      <button type="button" aria-label={incrementLabel} disabled={value >= max} onClick={() => set(value + 1)}>+</button>
    </span>
  );
}
