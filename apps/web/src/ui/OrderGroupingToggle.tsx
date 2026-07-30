// Галочка «Плотность важнее группировки» (ADR 017). Живёт ровно в одном месте — в шапке
// «Настройки», где стратегию выбирают ДО расчёта; с ладеплана переключатели убраны (5nb этап 2).
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
      {/* Своё имя, не имя галочки (LKWkalk-2tp): один aria-label на двух элементах — скринридер
          объявляет их неразличимо, а getByLabelText в тестах падает на неоднозначности. Тот же
          приём, что у подсказки режима погрузки (ladeplan.loadingModeHintLabel, LKWkalk-lu6). */}
      <InfoHint ariaLabel={tt('ladeplan.orderGroupingHintLabel')} text={tt('ladeplan.orderGroupingHint')} />
    </span>
  );
}
