// Строка позиции (LKWkalk-5nb, спека §2): только то, что вбивается руками, плюс чип правил.
// Правила, объяснение расчёта и каталог живут в RulesPanel — сюда они не возвращаются.
import { computeStack, type StackPreview, type Vehicle } from '@shadrin-v/engine';
import type { TranslationKey } from '@shadrin-v/i18n';
import { ArticleCombobox } from '../components/ArticleCombobox';
import { ArmedDelete } from '../components/ArmedDelete';
import { fillTemplate, stepInvalid } from '../components/stackFormula';
import { Measure, InfoHint } from '../../ui/primitives';
import { OrderSwatch } from '../../lib/swatch';
import { useLocale, useT } from '../../i18n/LocaleContext';
import { useHost } from '../../host/HostContext';
import { formatUom } from '../../lib/uomLabel';
import { formatSourceQuantity } from '../../erp/quantityFormat';
import { ruleChip } from './positionRules';
import { activeStep, applySuggestion, dimsComplete, numOr0, toCargo, type PositionState } from './setupState';
import type { DimField } from './setupValidation';

/** Stable id of the rules panel (wide `<aside>` or narrow drawer — SetupScreen.tsx renders exactly
 *  one of the two at a time), so the row's chip can point `aria-controls` at whichever is mounted
 *  (review finding 3, final wave): the chip opens/selects the panel but had no DOM/AX relationship
 *  to it at all. */
export const RULES_PANEL_ID = 'setup-rules-panel';

export interface PositionRowProps {
  position: PositionState;
  index: number; // палитра заказа
  vehicle: Vehicle;
  selected: boolean;
  /** Смонтирована ли прямо сейчас панель, на которую указывает `aria-controls` чипа (LKWkalk-58v).
   *  В широком режиме `<aside>` стоит всегда, в узком drawer появляется только у выбранной строки —
   *  и до первого выбора атрибут указывал на id, которого нет нигде в DOM. Висячий `aria-controls`
   *  хуже отсутствующего: он обещает вспомогательной технологии цель, которую та не находит. */
  panelMounted: boolean;
  onSelect: () => void; // выбрать строку и открыть панель (чип, подхваченный артикул)
  /** Снять выбор. Чип — это disclosure (`aria-expanded`), поэтому повторный клик по нему обязан
   *  закрывать панель: в широком режиме это единственный способ вернуться к сводке загрузки
   *  (финальное ревью, находка I2). Отдельный проп, а не переключалка внутри `onSelect`: тот же
   *  колбэк зовёт подхват артикула из подсказок, и ему закрывать панель нельзя. */
  onDeselect: () => void;
  onChange: (patch: Partial<PositionState>) => void;
  armed: boolean;
  onArm: () => void;
  onRemove: () => void;
  /** Регистрируют чип и поле имени в картах родителя: чип нужен Task 6 (возврат фокуса при
   *  закрытии drawer), поле имени — Task 7 (фокус на соседнюю строку после удаления позиции). */
  chipRef?: (el: HTMLButtonElement | null) => void;
  nameRef?: (el: HTMLInputElement | null) => void;
  /** Поля размеров — экран ERP уводит фокус в первое пустое, когда расчёт заблокирован. */
  dimRef?: (field: DimField, el: HTMLInputElement | null) => void;
}

export function PositionRow({
  position: p, index, vehicle, selected, panelMounted, onSelect, onDeselect, onChange, armed, onArm, onRemove,
  chipRef, nameRef, dimRef,
}: PositionRowProps) {
  // One translation source for the whole row — the dominant pattern in this repo (ArticleCombobox,
  // WarehouseFloor, Legend, HeroHeader, EmptyPlan, ...). Threading `tt` down as a prop is a
  // SetupScreen.tsx-only holdover, and this component is part of dismantling that file.
  const tt = useT();
  const { locale } = useLocale();
  // Подсказки происхождения габаритов и точного количества — только в сборке для ERP (макет, блок 3):
  // обычная сборка не меняется.
  const erp = useHost().kind === 'erp';
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
  // Имя хинтов — своё (article.lockedHintLabel, LKWkalk-0il), не имя комбобокса: один aria-label
  // на поле ввода и кнопках делал их неразличимыми для скринридера и неоднозначными для getByRole.
  // Четыре хинта строки делят одно имя намеренно — они объясняют одну и ту же привязку.
  const lockedHint = fillTemplate(tt('article.lockedHint'), { code: p.articleCode ?? '' });
  // Правка длины или ширины — это проверка предложения из названия: метка снимается. Правка любого
  // размера расходится с сохранённым у артикула — снимается и метка каталога (до следующего
  // сохранения). Ключ попадает в патч, только если метка была: патч обычной строки прежний.
  const clearsNameOrigin = p.dimsFromName ? { dimsFromName: undefined } : {};
  const clearsCatalogOrigin = p.dimsFromCatalog ? { dimsFromCatalog: undefined } : {};
  const hints = erp ? dimsHints(p) : [];
  const showSourceQuantity =
    erp && p.sourceQuantity !== undefined && p.sourceQuantity !== numOr0(p.quantity);

  return (
    // Строка и подсказки под ней (ERP) — один элемент списка: разделитель карточки идёт между позициями.
    // flex-wrap restored (review finding 1, final wave): the article field below used to be the row's
    // one non-shrinking element (`w-64 shrink-0`) inside an `overflow-hidden` ancestor with no wrap —
    // below ~700px the tail (dims/qty/chip/delete) ran off the right edge and was silently clipped,
    // with no scroll and no wrap to recover it. The article field is now the one that shrinks
    // (`flex-1 basis-64 min-w-0`, spec §2), and `flex-wrap` stays as a safety net for widths where even
    // shrinking every field isn't enough.
    <div className={selected ? 'bg-sub' : ''}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-4 py-2.5">
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
          {p.locked?.name && <InfoHint ariaLabel={tt('article.lockedHintLabel')} text={lockedHint} />}
        </span>
        {/* Task 5 fix: the Task 3 draft of this row only carried the lock hint next to `name`, dropping
            the per-dimension hint SetupScreen.test.tsx already pinned ("the locked-field hint names the
            bound article", Finding 3) — restored here, same pattern as the name field above. */}
        <span className="inline-flex w-24 items-center gap-1">
          <Measure ariaLabel={tt('field.length')} value={p.length} onChange={(length) => onChange({ length, ...clearsNameOrigin, ...clearsCatalogOrigin })} inputRef={dimRef && ((el) => dimRef('length', el))} readOnly={!!p.locked?.length} />
          {p.locked?.length && <InfoHint ariaLabel={tt('article.lockedHintLabel')} text={lockedHint} />}
        </span>
        <span className="inline-flex w-24 items-center gap-1">
          <Measure ariaLabel={tt('field.width')} value={p.width} onChange={(width) => onChange({ width, ...clearsNameOrigin, ...clearsCatalogOrigin })} inputRef={dimRef && ((el) => dimRef('width', el))} readOnly={!!p.locked?.width} />
          {p.locked?.width && <InfoHint ariaLabel={tt('article.lockedHintLabel')} text={lockedHint} />}
        </span>
        <span className="inline-flex w-24 items-center gap-1">
          <Measure ariaLabel={tt('field.height')} value={p.height} onChange={(height) => onChange({ height, ...clearsCatalogOrigin })} inputRef={dimRef && ((el) => dimRef('height', el))} readOnly={!!p.locked?.height} />
          {p.locked?.height && <InfoHint ariaLabel={tt('article.lockedHintLabel')} text={lockedHint} />}
        </span>
        <span className="w-20"><Measure ariaLabel={tt('field.quantity')} unit="×" value={p.quantity} onChange={(quantity) => onChange({ quantity })} align="left" /></span>

        <button
          ref={chipRef}
          type="button"
          data-testid="rule-chip"
          aria-expanded={selected}
          aria-controls={panelMounted ? RULES_PANEL_ID : undefined}
          onClick={selected ? onDeselect : onSelect}
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
      {(hints.length > 0 || showSourceQuantity) && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5 text-caption">
          {hints.length > 0 && (
            <span data-testid="dims-hint" className="flex flex-wrap items-center gap-2">
              {hints.map((h) => (
                <span key={h.key} className={HINT_TONE[h.tone]}>{tt(h.key)}</span>
              ))}
            </span>
          )}
          {showSourceQuantity && (
            <span data-testid="source-quantity" className="tabular-nums text-muted">
              {fillTemplate(tt('position.sourceQuantity'), {
                exact: formatSourceQuantity(p.sourceQuantity!, locale),
                uom: formatUom(p.uom, tt),
                planned: formatSourceQuantity(numOr0(p.quantity), locale),
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

type HintTone = 'success' | 'info' | 'warning' | 'plain';
const CHIP = 'rounded-pill border px-2 py-0.5';
const HINT_TONE: Record<HintTone, string> = {
  success: `${CHIP} border-success text-success`,
  info: `${CHIP} border-info text-info`,
  warning: `${CHIP} border-warning text-warning`,
  plain: 'text-muted',
};

/** Происхождение габаритов строки ERP (макет, блок 3): подтверждены у артикула; предложены по
 *  названию (и, может быть, без высоты); или их нет вовсе — тогда пояснение, что ERP их запомнит. */
function dimsHints(p: PositionState): Array<{ key: TranslationKey; tone: HintTone }> {
  if (p.unplaceable) return [];
  if (p.dimsFromName) {
    return [
      { key: 'position.dimsFromName', tone: 'info' },
      ...(numOr0(p.height) <= 0 ? [{ key: 'position.heightMissing' as const, tone: 'warning' as const }] : []),
    ];
  }
  if (!dimsComplete(p)) {
    return [
      { key: 'position.dimsMissing', tone: 'warning' },
      { key: 'position.dimsMissingHint', tone: 'plain' },
    ];
  }
  if (p.dimsFromCatalog) return [{ key: 'position.dimsSaved', tone: 'success' }];
  return [];
}
