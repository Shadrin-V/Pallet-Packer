// Строка позиции (LKWkalk-5nb, спека §2): только то, что вбивается руками, плюс чип правил.
// Правила, объяснение расчёта и каталог живут в RulesPanel — сюда они не возвращаются.
import { computeStack, type StackPreview, type Vehicle } from '@shadrin-v/engine';
import type { TranslationKey } from '@shadrin-v/i18n';
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
  tt: (k: TranslationKey) => string;
  onSelect: () => void; // клик по чипу — выбрать строку и открыть панель
  onChange: (patch: Partial<PositionState>) => void;
  armed: boolean;
  onArm: () => void;
  onRemove: () => void;
  /** Регистрируют чип и поле имени в картах родителя: чип нужен Task 6 (возврат фокуса при
   *  закрытии drawer), поле имени — Task 7 (фокус на соседнюю строку после удаления). Объявлены
   *  здесь сразу, чтобы поздние задачи не меняли интерфейс компонента.
   *  ВНИМАНИЕ: `nameRef` доедет до `<input>` только после того, как Task 7 добавит
   *  `ArticleCombobox` необязательный проп `inputRef` — сегодня компонент ref не принимает.
   *  В Task 3 проп объявляется и прокидывается, но до Task 7 никуда не крепится. */
  chipRef?: (el: HTMLButtonElement | null) => void;
  nameRef?: (el: HTMLInputElement | null) => void;
}

export function PositionRow({
  position: p, index, vehicle, selected, tt, onSelect, onChange, armed, onArm, onRemove, chipRef,
}: PositionRowProps) {
  // Chip text always comes from the live locale, never from the caller's `tt` — the rule chip is
  // the row's one load-bearing piece of prose and must read correctly even if a caller (a future
  // task, a test) hands in a stand-in translator for its own labels.
  const rtt = useT();
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
    <div className={`flex min-w-0 items-center gap-1.5 px-4 py-2.5 ${selected ? 'bg-sub' : ''}`}>
      <OrderSwatch index={index} width={12} height={26} />
      <span className="inline-flex w-64 shrink-0 items-center gap-1">
        <ArticleCombobox
          ariaLabel={tt('article.label')}
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
      <span className="w-24"><Measure ariaLabel={tt('field.length')} value={p.length} onChange={(length) => onChange({ length })} readOnly={!!p.locked?.length} /></span>
      <span className="w-24"><Measure ariaLabel={tt('field.width')} value={p.width} onChange={(width) => onChange({ width })} readOnly={!!p.locked?.width} /></span>
      <span className="w-24"><Measure ariaLabel={tt('field.height')} value={p.height} onChange={(height) => onChange({ height })} readOnly={!!p.locked?.height} /></span>
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
        <span>{fillTemplate(rtt(chip.text.key), chip.text.vars)}</span>
        {chip.restricted && <span aria-label={rtt('setup.chip.restricted')}>⊘</span>}
        {chip.count !== null && (
          <span className="font-semibold tabular-nums text-ink" aria-label={fillTemplate(rtt('setup.chip.perStack'), { count: chip.count })}>
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
