// Полоса шагов в верхней полосе ERP (макет, блоки 2–4): «Positionen wählen» → «Einrichten» →
// «Ladeplan». Страница одна, поэтому шаг — ссылка на свою секцию. Текущий шаг — `aria-current="step"`,
// пройденный — `data-done` и галочка: состояние несёт значок и вес шрифта, а не только цвет.
import type { JSX } from 'react';
import type { TranslationKey } from '@shadrin-v/i18n';
import { useT } from '../i18n/LocaleContext';
import { PICKER_SECTION_ID } from './ErpCargoPicker';

export type ErpStep = 'select' | 'setup' | 'plan';

export const ERP_STEP_ANCHORS: Record<ErpStep, string> = {
  select: PICKER_SECTION_ID,
  setup: 'lp-setup',
  plan: 'lp-plan',
};

const STEPS: { step: ErpStep; label: TranslationKey }[] = [
  { step: 'select', label: 'erp.step.select' },
  { step: 'setup', label: 'erp.step.setup' },
  { step: 'plan', label: 'erp.step.plan' },
];

export interface ErpStepsProps {
  /** Сколько размещаемых позиций в черновике. */
  positions: number;
  /** Посчитан ли план. */
  hasPlan: boolean;
}

export function currentErpStep({ positions, hasPlan }: ErpStepsProps): ErpStep {
  if (hasPlan) return 'plan';
  if (positions > 0) return 'setup';
  return 'select';
}

function isDone(step: ErpStep, { positions, hasPlan }: ErpStepsProps): boolean {
  if (step === 'select') return positions > 0;
  if (step === 'setup') return hasPlan;
  return false;
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

export function ErpSteps(props: ErpStepsProps): JSX.Element {
  const tt = useT();
  const current = currentErpStep(props);
  return (
    <ol aria-label={tt('erp.step.label')} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {STEPS.map(({ step, label }) => {
        const done = isDone(step, props);
        const isCurrent = step === current;
        return (
          <li key={step}>
            <a
              href={`#${ERP_STEP_ANCHORS[step]}`}
              aria-current={isCurrent ? 'step' : undefined}
              data-done={done || undefined}
              className={`flex items-center gap-1.5 rounded-ctl px-1 py-0.5 text-caption transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint ${
                isCurrent ? 'font-semibold text-ink' : done ? 'text-ink' : 'text-muted'
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-pill border-2 ${
                  done ? 'border-brand bg-brand text-brand-ink' : isCurrent ? 'border-brand bg-card' : 'border-line bg-card'
                }`}
              >
                {done ? <CheckIcon /> : isCurrent ? <span className="h-2 w-2 rounded-pill bg-brand" /> : null}
              </span>
              <span>{tt(label)}</span>
              {done && <span className="sr-only">{tt('erp.step.done')}</span>}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
