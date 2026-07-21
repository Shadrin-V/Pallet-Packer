// Two-step delete for one row of a list (ADR 022): the first press only ARMS the control, the
// second one deletes. window.confirm stays for actions that wipe the whole screen; inside a dense
// row it blocks the thread and reads as foreign.
//
// This component owns no arming state — the screen does, as a single value, so "exactly one button
// is armed" holds by construction rather than by keeping per-row flags in step.
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
  return (
    // The screen disarms on any document click. Stopping propagation here keeps the very click that
    // armed this button from travelling on and disarming it again in the same gesture.
    <span onClick={(e) => e.stopPropagation()} className="inline-flex shrink-0">
      {armed ? (
        <Button variant="danger" onClick={onConfirm}>
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
