// Token-only UI primitives (design-system §5). No hex in JSX — Tailwind classes map to CSS vars.
import { useState, type ReactNode } from 'react';

/** Small "i" info button that reveals a hint popover on click (keyboard-accessible). */
export function InfoHint({
  text,
  ariaLabel,
  align = 'left',
}: {
  text: string;
  ariaLabel: string;
  /** Which edge to anchor the tooltip on. 'right' opens it leftward so a hint near the right edge of
   *  its container is not clipped (QA: two-sided orientation hint). Default 'left' opens rightward. */
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="grid h-4 w-4 place-items-center rounded-full border border-line-strong text-[10px] font-semibold leading-none text-muted hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-6 z-20 w-64 rounded-ctl border border-line bg-card p-2.5 text-caption font-normal normal-case tracking-normal text-muted shadow-pop`}
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** Measure input: number + non-overlapping unit (design-system §5 "Feld mit Einheit"). */
export function Measure({
  value,
  onChange,
  unit = 'mm',
  ariaLabel,
  invalid = false,
  align = 'right',
}: {
  value: number | '';
  onChange: (v: number | '') => void;
  unit?: string;
  ariaLabel: string;
  invalid?: boolean;
  /** Text alignment of the number; quantity reads better left-aligned (no cramped right edge). */
  align?: 'left' | 'center' | 'right';
}) {
  const alignCls = align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right';
  return (
    <span
      className={`inline-flex items-center rounded-ctl border bg-card ${
        invalid ? 'border-danger' : 'border-line-strong focus-within:border-brand'
      }`}
    >
      <input
        type="number"
        inputMode="numeric"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={`no-spin w-full min-w-0 bg-transparent px-1.5 py-1.5 text-value tabular-nums outline-none ${alignCls}`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? '' : Number(raw));
        }}
      />
      <span className="select-none px-2 pl-0.5 text-[10.5px] text-faint">{unit}</span>
    </span>
  );
}

/** Bare text field (no unit) — order id / position name. */
export function TextField({
  value,
  onChange,
  ariaLabel,
  weight = 600,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  weight?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className="min-w-0 rounded-ctl border border-line bg-card px-2 py-1.5 text-body outline-none focus:border-brand"
      style={{ fontWeight: weight }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Segmented 2-option control — IS the state (design-system §5, e.g. Ent|Ver). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-pill border border-line bg-card p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`rounded-pill px-2.5 py-1 text-caption font-semibold transition-colors ${
              active ? 'bg-brand text-brand-ink' : 'text-muted hover:text-brand'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Native select with token styling (design-system §5). `min-w-0` + `truncate` keep long option
 *  text (e.g. long RU labels) from ballooning the control and breaking the row layout. */
export function Select<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={`min-w-0 max-w-full truncate appearance-none rounded-ctl border border-line bg-card px-2 py-1.5 text-body outline-none focus:border-brand ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  type = 'button',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const base =
    'rounded-ctl px-3.5 py-2 text-caption font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-brand text-brand-ink hover:bg-brand-strong',
    secondary: 'border border-line-strong bg-card text-ink hover:border-brand hover:text-brand',
    ghost: 'border border-dashed border-line-strong text-muted hover:text-brand',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

export function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'mint' }) {
  const styles =
    tone === 'mint'
      ? 'bg-[color:var(--mint-tint)] text-brand-strong'
      : 'bg-sub text-muted border border-line';
  return (
    <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-caption ${styles}`}>
      {children}
    </span>
  );
}
