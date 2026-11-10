import type { ReactNode } from "react";

/**
 * The card every docs widget sits in: a header naming what it shows, the
 * widget, and a one-line caption under it. Styles are in `widgets.css`.
 */
export function Frame({
  label,
  hint,
  caption,
  children,
}: {
  label: string;
  hint?: string;
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="xw not-prose">
      <div className="xw-head">
        <span>{label}</span>
        {hint && (
          <span className="xw-hint">
            <span className="xw-dot" /> {hint}
          </span>
        )}
      </div>
      <div className="xw-body">{children}</div>
      {caption && <figcaption className="xw-cap">{caption}</figcaption>}
    </figure>
  );
}

/** A row of mutually exclusive choices. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="xw-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          className={o === value ? "xw-chip on" : "xw-chip"}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
