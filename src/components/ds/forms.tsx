"use client";
import React from "react";

/* — Input — */
export function Input({
  label, hint, error, id, className = "", style, ...rest
}: { label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; className?: string; style?: React.CSSProperties } & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = React.useId();
  const iid = id || auto;
  return (
    <div className={["ls-field", error ? "ls-field--error" : "", className].filter(Boolean).join(" ")} style={style}>
      {label ? <label className="ls-field__label" htmlFor={iid}>{label}</label> : null}
      <input id={iid} className="ls-input" {...rest} />
      {error ? <span className="ls-field__error">{error}</span> : hint ? <span className="ls-field__hint">{hint}</span> : null}
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
      <textarea id={iid} rows={rows} className="ls-textarea" {...rest}></textarea>
      {error ? <span className="ls-field__error">{error}</span> : hint ? <span className="ls-field__hint">{hint}</span> : null}
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
        <select id={iid} className="ls-select" defaultValue={rest.value === undefined && placeholder ? "" : undefined} {...rest}>
          {placeholder ? <option value="" disabled>{placeholder}</option> : null}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {children}
        </select>
      </div>
      {error ? <span className="ls-field__error">{error}</span> : hint ? <span className="ls-field__hint">{hint}</span> : null}
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
