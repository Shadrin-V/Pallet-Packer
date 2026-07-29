// Галочка «Плотность важнее группировки» (ADR 017) — одна на два экрана: шапку «Настройки»
// (выбор ДО расчёта) и панель действий ладеплана (пересчёт готового плана).
// InfoHint — кнопка, и она обязана стоять ВНЕ <label>: внутри него клик по подсказке
// активировал бы label и переключал галочку, то есть менял стратегию при попытке её прочитать.
import type { OrderGrouping } from '@shadrin-v/engine';
import { useT } from '../i18n/LocaleContext';
import { InfoHint } from './primitives';

export function OrderGroupingToggle({
  value,
  onChange,
}: {
  value: OrderGrouping;
  onChange: (g: OrderGrouping) => void;
}) {
  const tt = useT();
  return (
    <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-muted">
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          aria-label={tt('ladeplan.orderGrouping')}
          checked={value === 'densityFirst'}
          onChange={(e) => onChange(e.target.checked ? 'densityFirst' : 'strict')}
        />
        <span className="truncate">{tt('ladeplan.orderGrouping')}</span>
      </label>
      <InfoHint ariaLabel={tt('ladeplan.orderGrouping')} text={tt('ladeplan.orderGroupingHint')} />
    </span>
  );
}
