// Текст правил позиции: чип в строке и объясняющие фразы в панели (LKWkalk-5nb, спека §3 и §5).
// Возвращает КЛЮЧИ и подстановки, не готовые строки: перевод — дело компонента, как в stackFormula.
import type { StackPreview } from '@shadrin-v/engine';
import type { TranslationKey } from '@shadrin-v/i18n';
import type { PositionState } from './setupState';
import { activeStep } from './setupState';
import { orientationChoiceOf } from '../components/orientationChoice';

export interface RuleText {
  key: TranslationKey;
  vars: Record<string, string | number>;
}

export interface RuleChip {
  text: RuleText;
  /** Ориентация отличается от умолчания (`free`) — строка рисует маркер ⊘. */
  restricted: boolean;
  /** Единиц в одной стопке, или null, пока предпросмотра нет (спека §3: ноль читался бы как
   *  «не влезает ни одной»). */
  count: number | null;
}

const num = (v: number | ''): number => (v === '' ? 0 : v);

export function ruleChip(p: PositionState, preview: StackPreview | null): RuleChip {
  const step = num(activeStep(p));
  const cap = num(p.maxTiers);
  let text: RuleText;
  if (p.state === 'verschachtelt') {
    text = step > 0
      ? { key: 'setup.chip.nested', vars: { step } }
      : { key: 'setup.chip.nestedNoStep', vars: {} };
  } else if (cap > 0) {
    text = { key: 'setup.chip.stackLimited', vars: { cap } };
  } else {
    text = { key: 'setup.chip.stack', vars: {} };
  }
  return {
    text,
    restricted: orientationChoiceOf(p.rotation, p.forkAccess) !== 'free',
    count: preview ? preview.count : null,
  };
}

export function ruleSentences(p: PositionState, preview: StackPreview | null): RuleText[] {
  const out: RuleText[] = [];
  if (preview) {
    if (preview.cappedBy === 'notStackable') {
      out.push({ key: 'setup.rule.notStackable', vars: {} });
    } else if (preview.mode === 'sequential') {
      out.push({ key: 'setup.rule.sequential', vars: { step: preview.stepHeight ?? 0, base: preview.base } });
    } else if (preview.mode === 'pairwise') {
      out.push({ key: 'setup.rule.pairwise', vars: { base: preview.base, step: preview.stepHeight ?? 0 } });
      if (p.allowUnpairedTop) out.push({ key: 'setup.rule.pairwiseUnpaired', vars: {} });
    } else {
      out.push({ key: 'setup.rule.entschachtelt', vars: { base: preview.base, count: preview.count } });
    }
    if (preview.cappedBy === 'maxTiers') out.push({ key: 'setup.rule.capTiers', vars: { cap: preview.cap ?? 0 } });
    if (preview.cappedBy === 'maxNested') out.push({ key: 'setup.rule.capNested', vars: { cap: preview.cap ?? 0 } });
  }
  const choice = orientationChoiceOf(p.rotation, p.forkAccess);
  if (choice === 'fixed') out.push({ key: 'setup.rule.orientFixed', vars: {} });
  else if (choice === 'twoSided')
    out.push({
      key: p.forkAxis === 'width' ? 'setup.rule.orientTwoSidedWidth' : 'setup.rule.orientTwoSidedLength',
      vars: {},
    });
  else out.push({ key: 'setup.rule.orientFree', vars: {} });
  return out;
}
