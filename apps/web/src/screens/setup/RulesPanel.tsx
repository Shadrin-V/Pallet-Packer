// Панель разбора позиции (LKWkalk-5nb, спека §4): правила редактируются здесь и только здесь.
// Содержимое — перенос раскрывающегося блока PositionRow из SetupScreen.tsx (Task 4), плюс новая
// секция фраз ruleSentences и formatLength вместо зашитой единицы ' mm' (LKWkalk-5gi, пункт 2).
import { useState } from 'react';
import { computeStack, FORK_AXES, type NestingMode, type StackPreview, type Vehicle, type ForkAxis } from '@shadrin-v/engine';
import type { Article } from '@shadrin-v/contracts';
import { formatLength } from '@shadrin-v/i18n';
import { StackDiagram } from '../components/StackDiagram';
import { fillTemplate, formulaKey, formulaVars, stepInvalid } from '../components/stackFormula';
import {
  ORIENTATION_CHOICES,
  orientationChoiceOf,
  orientationFieldsFor,
  type OrientationChoice,
} from '../components/orientationChoice';
import { Measure, Segmented, Select, Button, InfoHint } from '../../ui/primitives';
import { orderColorToken } from '../../lib/orderColor';
import { OrderSwatch } from '../../lib/swatch';
import { useT, useLocale } from '../../i18n/LocaleContext';
import { ruleSentences } from './positionRules';
import { LoadSummary } from './LoadSummary';
import type { SetupMessage, SetupMessageWhere, SetupSummary } from './setupValidation';
import {
  activeStep,
  activeStepField,
  dimsComplete,
  lockedFieldsFrom,
  numOr0,
  toCargo,
  type PositionState,
} from './setupState';

export interface RulesPanelProps {
  position: PositionState | null; // null — ничего не выбрано
  orderId: string | null;
  index: number;
  vehicle: Vehicle;
  onChange: (patch: Partial<PositionState>) => void;
  onSaveArticle: () => Promise<Article | undefined>;
  onClose?: () => void; // задан только в режиме drawer (Task 6)
  /** Пустое состояние панели (§6): сводка и сообщения. Без них панель остаётся с прежней заглушкой. */
  summary?: SetupSummary;
  messages?: SetupMessage[];
  onGoTo?: (where: SetupMessageWhere) => void;
}

export function RulesPanel({ position: p, orderId, index, vehicle, onChange, onSaveArticle, onClose, summary, messages, onGoTo }: RulesPanelProps) {
  const tt = useT();
  const { locale } = useLocale();
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!p) {
    // Пустое состояние — не заглушка: панель показывает сводку заявки и список сообщений (§6).
    // Пропы необязательные: старые тесты рендерят панель без них и должны продолжать работать.
    if (summary && messages && onGoTo) {
      return <LoadSummary summary={summary} messages={messages} onGoTo={onGoTo} />;
    }
    return (
      <aside className="rounded-card bg-card p-4 shadow-card">
        <p className="text-caption text-muted">{tt('setup.panel.empty')}</p>
      </aside>
    );
  }

  const handleSaveArticle = async () => {
    try {
      const saved = await onSaveArticle();
      setSaveError(null);
      // Finding 1: bind the row to what the server actually stored — otherwise articleCode stays
      // unset and the button keeps reading "save" instead of flipping to "update".
      if (saved)
        onChange({
          articleCode: saved.itemCode,
          locked: lockedFieldsFrom(saved.erpFields),
          unboundFromErp: undefined,
        });
    } catch {
      setSaveError(tt('article.saveError'));
    }
  };

  const dimsPresent = dimsComplete(p);
  const invalid = stepInvalid(p.state, activeStep(p), p.height);
  // Finding 3: "активна при введённом артикуле и заполненных габаритах" — the save button is always
  // present in the details panel, disabled (not hidden) until both conditions hold.
  const saveDisabled = (p.articleCode ?? p.name).trim() === '' || !dimsPresent;
  let preview: StackPreview | null = null;
  if (dimsPresent && !invalid) {
    try {
      preview = computeStack(toCargo(p, 'preview'), vehicle);
    } catch {
      preview = null;
    }
  }

  return (
    <aside className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
      {/* Шапка */}
      <div className="flex items-center gap-2">
        <OrderSwatch index={index} width={12} height={26} />
        <span className="min-w-0 truncate text-body font-semibold text-ink">{p.name}</span>
        <span className="text-caption text-muted">{orderId}</span>
        {onClose && (
          <button
            type="button"
            aria-label={tt('setup.panel.close')}
            onClick={onClose}
            className="ml-auto text-muted hover:text-brand"
          >
            ✕
          </button>
        )}
      </div>

      {/* setup.panel.rules */}
      <div className="flex flex-wrap items-end gap-4 border-t border-dashed border-line pt-3">
        <label className="flex flex-col gap-1">
          <span className="text-label uppercase font-semibold text-faint">{tt('setup.panel.rules')}</span>
          <Segmented
            ariaLabel={tt('cargoType.nesting.label')}
            value={p.state}
            onChange={(state) => onChange({ state })}
            options={[
              { value: 'entschachtelt', label: tt('setup.state.ent') },
              { value: 'verschachtelt', label: tt('setup.state.ver') },
            ]}
          />
        </label>

        {p.state === 'verschachtelt' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-label uppercase font-semibold text-faint">{tt('cargoType.nesting.mode')}</span>
              <Select
                ariaLabel={tt('cargoType.nesting.mode')}
                value={p.nestingMode}
                onChange={(nestingMode) => onChange({ nestingMode: nestingMode as NestingMode })}
                options={[
                  { value: 'sequential' as NestingMode, label: tt('cargoType.nesting.modeSequential') },
                  { value: 'pairwise' as NestingMode, label: tt('cargoType.nesting.modePairwise') },
                ]}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-label uppercase font-semibold text-faint">
                {tt(p.nestingMode === 'pairwise' ? 'cargoType.nesting.stepHeightPair' : 'cargoType.nesting.stepHeightSeq')}
              </span>
              <span className="w-24">
                <Measure
                  ariaLabel={tt('cargoType.nesting.stepHeightSeq')}
                  value={activeStep(p)}
                  onChange={(v) => onChange({ [activeStepField(p)]: v })}
                  invalid={invalid}
                />
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-label uppercase font-semibold text-faint">{tt('cargoType.nesting.maxNested')}</span>
              <span className="w-24">
                <Measure ariaLabel={tt('cargoType.nesting.maxNested')} unit="×" value={p.maxNested} onChange={(maxNested) => onChange({ maxNested })} />
              </span>
            </label>

            {p.nestingMode === 'pairwise' && (
              <label className="flex items-center gap-2 pb-1.5 text-body">
                <input type="checkbox" checked={p.allowUnpairedTop} onChange={(e) => onChange({ allowUnpairedTop: e.target.checked })} />
                {tt('cargoType.nesting.allowUnpairedTop')}
              </label>
            )}
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-label uppercase font-semibold text-faint inline-flex items-center gap-1.5">
            {tt('cargoType.stacking.label')}
            <InfoHint ariaLabel={tt('cargoType.stacking.label')} text={tt('cargoType.stacking.hint')} />
          </span>
          <span className="w-24">
            <Measure ariaLabel={tt('cargoType.stacking.label')} unit="×" value={p.maxTiers} onChange={(maxTiers) => onChange({ maxTiers })} />
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-label uppercase font-semibold text-faint">{tt('cargoType.orientation.label')}</span>
          <span className="w-36 shrink-0">
            <Select
              ariaLabel={tt('cargoType.orientation.label')}
              value={orientationChoiceOf(p.rotation, p.forkAccess)}
              onChange={(choice) => onChange(orientationFieldsFor(choice as OrientationChoice))}
              options={ORIENTATION_CHOICES.map((c) => ({ value: c, label: tt(`cargoType.orientation.${c}`) }))}
              className="w-full"
            />
          </span>
        </label>

        {orientationChoiceOf(p.rotation, p.forkAccess) === 'twoSided' && (
          <label className="flex flex-col gap-1">
            <span className="text-label uppercase font-semibold text-faint inline-flex items-center gap-1.5">
              {tt('cargoType.forkAxis.label')}
              <InfoHint ariaLabel={tt('cargoType.orientation.twoSided')} text={tt('cargoType.orientation.twoSidedHint')} />
            </span>
            <span className="w-[8.5rem] shrink-0">
              <Select
                ariaLabel={tt('cargoType.forkAxis.label')}
                value={p.forkAxis ?? 'length'}
                onChange={(forkAxis) => onChange({ forkAxis: forkAxis as ForkAxis })}
                options={FORK_AXES.map((a) => ({ value: a, label: tt(`cargoType.forkAxis.${a}`) }))}
                className="w-full"
              />
            </span>
          </label>
        )}

        {p.state === 'verschachtelt' && (
          <p className={`w-full text-caption ${invalid ? 'text-danger' : 'text-muted'}`}>
            {fillTemplate(tt('cargoType.nesting.stepHeightHint'), { H: numOr0(p.height) })}
          </p>
        )}
      </div>

      {/* setup.panel.calc */}
      <div className="flex flex-col gap-2 border-t border-dashed border-line pt-3">
        <span className="text-label uppercase font-semibold text-faint">{tt('setup.panel.calc')}</span>
        <ul data-testid="rule-sentences" className="flex flex-col gap-1 text-caption text-muted">
          {ruleSentences(p, preview).map((s, i) => (
            <li key={i}>{fillTemplate(tt(s.key), s.vars)}</li>
          ))}
        </ul>
        {preview && (
          <div className="flex flex-wrap items-stretch gap-3 rounded-ctl bg-sub px-3 py-2">
            <div className="min-w-[12rem] flex-1">
              <div data-testid="stack-result" className="text-caption text-muted">
                {fillTemplate(tt('stack.result'), { count: preview.count, height: formatLength(preview.height, locale) })}
              </div>
              <div className="mt-1 font-mono text-formula text-ink">
                <span className="text-faint">{tt('stack.formula.label')}: </span>
                {fillTemplate(tt(formulaKey(preview)), formulaVars(preview))}
                {preview.cappedBy && preview.cappedBy !== 'notStackable' && (
                  <> {fillTemplate(tt('stack.formula.cap'), formulaVars(preview))}</>
                )}
              </div>
            </div>
            {preview.count > 0 && (
              <div className="flex flex-col items-center gap-1">
                <span className="text-label uppercase font-semibold text-faint">{tt('stack.diagram')}</span>
                <StackDiagram preview={preview} length={numOr0(p.length)} width={numOr0(p.width)} label={tt('stack.diagram')} series={orderColorToken(index).series} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* setup.panel.catalogue */}
      <div className="border-t border-dashed border-line pt-3">
        <span className="text-label uppercase font-semibold text-faint">{tt('setup.panel.catalogue')}</span>
        <div className="mt-1">
          <Button variant="ghost" onClick={handleSaveArticle} disabled={saveDisabled}>
            {tt(p.articleCode ? 'article.update' : 'article.save')}
          </Button>
          {saveError && <p className="mt-1 text-caption text-danger">{saveError}</p>}
          {/* Finding 2 (review): show whenever the row is unbound from an ERP-named article, not
              only while the typed text still differs from the remembered name. Typing the exact
              ERP name back does not re-bind the row — Save still creates a brand-new article — so
              hiding the notice the moment the text matches again would silently re-open the very
              duplicate-fork bug this notice exists to prevent. */}
          {p.unboundFromErp && <p className="text-caption text-muted">{tt('article.renameInErp')}</p>}
        </div>
      </div>
    </aside>
  );
}
