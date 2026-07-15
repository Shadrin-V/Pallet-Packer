// Picks and fills the readable stack formula (qrd-13) from a StackPreview. The engine owns the maths
// (StackPreview operands); this only chooses the i18n template and substitutes operands.
import type { StackPreview } from '@shadrin-v/engine';
import type { TranslationKey } from '@shadrin-v/i18n';
import type { NestingState } from '@shadrin-v/engine';

/** Which formula template applies to this preview. */
export function formulaKey(s: StackPreview): TranslationKey {
  if (s.cappedBy === 'notStackable') return 'stack.formula.notStackable';
  if (s.mode === 'entschachtelt') return 'stack.formula.entschachtelt';
  if (s.mode === 'pairwise') return 'stack.formula.pairwise';
  return 'stack.formula.sequential';
}

/** Substitute {name} placeholders in an i18n template. */
export function fillTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Operand bag for the formula + result templates. */
export function formulaVars(s: StackPreview): Record<string, string | number> {
  return {
    hold: s.hold,
    base: s.base,
    step: s.stepHeight ?? 0,
    rawCount: s.rawCount,
    count: s.count,
    cap: s.cap ?? 0,
    height: s.height,
  };
}

/** A nestable (verschachtelt) position needs an integer stepHeight in 1..height. */
export function stepInvalid(state: NestingState, stepHeight: number | '', height: number | ''): boolean {
  if (state !== 'verschachtelt') return false;
  if (stepHeight === '' || stepHeight <= 0) return true;
  if (height !== '' && stepHeight > height) return true;
  return false;
}
