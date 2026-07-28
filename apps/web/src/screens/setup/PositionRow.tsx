// Строка позиции (LKWkalk-5nb, спека §2): только то, что вбивается руками, плюс чип правил.
// Правила, объяснение расчёта и каталог живут в RulesPanel — сюда они не возвращаются.
import { computeStack, type StackPreview, type Vehicle } from '@shadrin-v/engine';
import { ArticleCombobox } from '../components/ArticleCombobox';
import { ArmedDelete } from '../components/ArmedDelete';
import { fillTemplate, stepInvalid } from '../components/stackFormula';
import { Measure, InfoHint } from '../../ui/primitives';
import { OrderSwatch } from '../../lib/swatch';
import { useT } from '../../i18n/LocaleContext';
import { ruleChip } from './positionRules';
import { activeStep, applySuggestion, dimsComplete, toCargo, type PositionState } from './setupState';

export interface PositionRowProps {
  position: PositionState;
  index: number; // палитра заказа
  vehicle: Vehicle;
  selected: boolean;
  onSelect: () => void; // клик по чипу — выбрать строку и открыть панель
  onChange: (patch: Partial<PositionState>) => void;
  armed: boolean;
  onArm: () => void;
  onRemove: () => void;
  /** Регистрируют чип и поле имени в картах родителя: чип нужен Task 6 (возврат фокуса при
   *  закрытии drawer), поле имени — Task 7 (фокус на соседнюю строку после удаления позиции). */
  chipRef?: (el: HTMLButtonElement | null) => void;
  nameRef?: (el: HTMLInputElement | null) => void;
}

export function PositionRow({
  position: p, index, vehicle, selected, onSelect, onChange, armed, onArm, onRemove, chipRef, nameRef,
}: PositionRowProps) {
  // One translation source for the whole row — the dominant pattern in this repo (ArticleCombobox,
  // WarehouseFloor, Legend, HeroHeader, EmptyPlan, ...). Threading `tt` down as a prop is a
  // SetupScreen.tsx-only holdover, and this component is part of dismantling that file.
  const tt = useT();
  const invalid = stepInvalid(p.state, activeStep(p), p.height);
  let preview: StackPreview | null = null;
  if (dimsComplete(p) && !invalid) {
    try {
      preview = computeStack(toCargo(p, 'preview'), vehicle);
    } catch {
      preview = null;
    }
  }
  const chip = ruleChip(p, preview);
  const lockedHint = fillTemplate(tt('article.lockedHint'), { code: p.articleCode ?? '' });

  return (
    // flex-wrap restored (review finding 1, final wave): the article field below used to be the row's
    // one non-shrinking element (`w-64 shrink-0`) inside an `overflow-hidden` ancestor with no wrap —
    // below ~700px the tail (dims/qty/chip/delete) ran off the right edge and was silently clipped,
    // with no scroll and no wrap to recover it. The article field is now the one that shrinks
    // (`flex-1 basis-64 min-w-0`, spec §2), and `flex-wrap` stays as a safety net for widths where even
    // shrinking every field isn't enough.
    <div className={`flex min-w-0 flex-wrap items-center gap-1.5 px-4 py-2.5 ${selected ? 'bg-sub' : ''}`}>
      <OrderSwatch index={index} width={12} height={26} />
      <span className="inline-flex min-w-0 flex-1 basis-64 items-center gap-1">
        <ArticleCombobox
          ariaLabel={tt('article.label')}
          inputRef={nameRef}
          value={p.name}
          onChange={(name) =>
            onChange({
              name,
              articleCode: undefined,
              locked: {},
              unboundFromErp:
                p.unboundFromErp ??
                (p.articleCode && p.locked?.name ? { itemCode: p.articleCode, name: p.name } : undefined),
            })
          }
          onPick={(s) => {
            onChange(applySuggestion(s));
            onSelect(); // правила подхваченного артикула стоит показать сразу
          }}
          className="w-full"
        />
        {p.locked?.name && <InfoHint ariaLabel={tt('article.label')} text={lockedHint} />}
      </span>
      {/* Task 5 fix: the Task 3 draft of this row only carried the lock hint next to `name`, dropping
          the per-dimension hint SetupScreen.test.tsx already pinned ("the locked-field hint names the
          bound article", Finding 3) — restored here, same pattern as the name field above. */}
      <span className="inline-flex w-24 items-center gap-1">
        <Measure ariaLabel={tt('field.length')} value={p.length} onChange={(length) => onChange({ length })} readOnly={!!p.locked?.length} />
        {p.locked?.length && <InfoHint ariaLabel={tt('article.label')} text={lockedHint} />}
      </span>
      <span className="inline-flex w-24 items-center gap-1">
        <Measure ariaLabel={tt('field.width')} value={p.width} onChange={(width) => onChange({ width })} readOnly={!!p.locked?.width} />
        {p.locked?.width && <InfoHint ariaLabel={tt('article.label')} text={lockedHint} />}
      </span>
      <span className="inline-flex w-24 items-center gap-1">
        <Measure ariaLabel={tt('field.height')} value={p.height} onChange={(height) => onChange({ height })} readOnly={!!p.locked?.height} />
        {p.locked?.height && <InfoHint ariaLabel={tt('article.label')} text={lockedHint} />}
      </span>
      <span className="w-20"><Measure ariaLabel={tt('field.quantity')} unit="×" value={p.quantity} onChange={(quantity) => onChange({ quantity })} align="left" /></span>

      <button
        ref={chipRef}
        type="button"
        data-testid="rule-chip"
        aria-pressed={selected}
        onClick={onSelect}
        className={`ml-auto inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-caption transition-colors ${
          invalid ? 'border-danger text-danger'
            : selected ? 'border-brand text-brand' : 'border-line bg-sub text-muted hover:border-brand hover:text-brand'
        }`}
      >
        <span>{fillTemplate(tt(chip.text.key), chip.text.vars)}</span>
        {chip.restricted && <span aria-label={tt('setup.chip.restricted')}>⊘</span>}
        {chip.count !== null && (
          <span className="font-semibold tabular-nums text-ink" aria-label={fillTemplate(tt('setup.chip.perStack'), { count: chip.count })}>
            ↕ {chip.count}
          </span>
        )}
      </button>

      <ArmedDelete
        armed={armed}
        onArm={onArm}
        onConfirm={onRemove}
        label={tt('setup.deletePosition')}
        confirmLabel={tt('action.confirmDelete')}
      />
    </div>
  );
}
