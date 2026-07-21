// Two-step delete for one row of a list (ADR 022): the first press only ARMS the control, the
// second one deletes. window.confirm stays for actions that wipe the whole screen; inside a dense
// row it blocks the thread and reads as foreign.
//
// This component owns no arming state — the screen does, as a single value, so "exactly one button
// is armed" holds by construction rather than by keeping per-row flags in step.
import { useEffect, useRef } from 'react';
import { Button } from '../../ui/primitives';

export function ArmedDelete({
  armed,
  onArm,
  onConfirm,
  label,
  confirmLabel,
}: {
  armed: boolean;
  onArm: () => void;
  onConfirm: () => void;
  /** Accessible name of the resting (trash) affordance. */
  label: string;
  /** Visible text and accessible name once armed. */
  confirmLabel: string;
}) {
  // Review fix (Finding 2): arming swaps the trash <button> for a different <Button>, which drops
  // keyboard focus to <body> — a keyboard/screen-reader user would have to tab from the top of the
  // document to reach "Löschen bestätigen" inside the 4s arm window. Move focus onto it instead;
  // its accessible name IS the announcement, so no separate aria-live region is needed.
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (armed) confirmRef.current?.focus();
  }, [armed]);

  return (
    // Review fix (Finding 3): this used to be `onClick={stopPropagation}`, which also swallowed the
    // arming click before it could reach the document-level listener (SetupScreen) that collapses
    // another row's open details panel on ANY outside click — so arming a trash stopped collapsing
    // other rows. `data-armed-delete` is a narrower hook: SetupScreen's disarm-on-any-click listener
    // ignores clicks inside it (same `closest(...)` idiom as SetupScreen.tsx's own rootRef check and
    // ArticleCombobox.tsx), so the arming click still bubbles for everything else it should affect.
    <span data-armed-delete="" className="inline-flex shrink-0">
      {armed ? (
        <Button ref={confirmRef} variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      ) : (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={onArm}
          className="rounded-ctl p-1.5 text-muted transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4M6.5 6.5v5M9.5 6.5v5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
