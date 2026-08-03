// Липкая шапка экрана «Настройка» (LKWkalk-5nb, спека §6): кузов, сводка и действия на виду при
// прокрутке. Кнопка расчёта жила под последним заказом — при шести заказах до неё надо было домотать.
// В ужатом виде остаётся одна строка «кузов · сводка · Рассчитать»; за переключение отвечает
// useStickyCompact, шапка только рисует то, что ей сказали.
import type { LoadingMode, OrderGrouping, Vehicle } from '@shadrin-v/engine';
import { formatVolume } from '@shadrin-v/i18n';
import { useT, useLocale } from '../../i18n/LocaleContext';
import { fillTemplate } from '../components/stackFormula';
import { Button, InfoHint, Measure, Select } from '../../ui/primitives';
import { LoadingModeSwitch } from '../../ui/LoadingModeSwitch';
import { OrderGroupingToggle } from '../../ui/OrderGroupingToggle';
import { ThemeSwitch } from '../../theme/ThemeSwitch';
import { VEHICLE_PRESETS } from '../../data/presets';
import { numOr0, type Num } from './setupState';
import type { SetupSummary } from './setupValidation';

export interface SetupHeaderProps {
  vehicle: Vehicle;
  summary: SetupSummary;
  /** Сколько сообщений уровня error — кнопка не гаснет, но говорит, что расчёта не будет. */
  errorCount: number;
  compact: boolean;
  /** Стратегия расчёта (решение владельца 3): одно состояние на оба экрана, владеет App. Здесь она
   *  ТОЛЬКО выбирается — пересчёт делает «Рассчитать», потому что плана может ещё не быть. */
  loadingMode: LoadingMode;
  orderGrouping: OrderGrouping;
  onLoadingModeChange: (m: LoadingMode) => void;
  onOrderGroupingChange: (g: OrderGrouping) => void;
  onVehicleChange: (v: Vehicle) => void;
  onDemo: () => void;
  onReset: () => void;
  onCalculate: () => void;
}

function MeasureField({ label, value, onChange }: { label: string; value: Num; onChange: (v: Num) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label uppercase font-semibold text-faint">{label}</span>
      <span className="w-24">
        <Measure ariaLabel={label} value={value} onChange={onChange} />
      </span>
    </label>
  );
}

export function SetupHeader({
  vehicle, summary, errorCount, compact, loadingMode, orderGrouping,
  onLoadingModeChange, onOrderGroupingChange, onVehicleChange, onDemo, onReset, onCalculate,
}: SetupHeaderProps) {
  const tt = useT();
  const { locale } = useLocale();
  const volumes = `${formatVolume(summary.cargoVolume, locale)} / ${formatVolume(summary.vehicleVolume, locale)}`;

  return (
    // Фон СПЛОШНОЙ (`bg-paper`, без `/95`) — под липкой шапкой едет содержимое, и просвечивать оно
    // не должно. Модификатор прозрачности здесь не просто лишний, а нерабочий: токены темы объявлены
    // в tailwind.config.js голым `var(--paper)`, а Tailwind 3.4 умеет подмешивать альфу только в
    // цвет, записанный с плейсхолдером `<alpha-value>`; на голую переменную он молча не выпускает
    // правило — в собранном CSS не было НИ ОДНОГО `bg-paper`, и шапка на проде была полностью
    // прозрачной. `backdrop-blur` ушёл вместе с прозрачностью: за непрозрачным фоном размывать
    // нечего, а слой композитинга он всё равно создаёт. Регресс стережёт theme-alpha.test.ts.
    // Без отрицательных полей (9tq): шапка живёт НАД <main>, в общей обёртке с планом — sticky
    // держит её до низа страницы, а полоса на всю ширину, как HeroHeader. print:hidden свой:
    // обёртка больше ничего не прячет, план из неё печатается.
    <div className="sticky top-0 z-20 mb-6 border-b border-line bg-paper px-5 py-3 sm:px-6 print:hidden">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-end gap-4">
        {compact ? (
          <span className="text-body font-semibold">{vehicle.name}</span>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-label uppercase font-semibold text-faint">{tt('vehicle.label')}</span>
              <Select
                ariaLabel={tt('vehicle.label')}
                value={vehicle.name}
                onChange={(name) => {
                  const p = VEHICLE_PRESETS.find((v) => v.name === name);
                  onVehicleChange(
                    p
                      ? { id: p.key, name: p.name, length: p.length, width: p.width, height: p.height }
                      : { ...vehicle, name: tt('setup.vehiclePreset.custom') },
                  );
                }}
                options={[
                  { value: tt('setup.vehiclePreset.custom'), label: tt('setup.vehiclePreset.custom') },
                  ...VEHICLE_PRESETS.map((p) => ({ value: p.name, label: p.name })),
                ]}
              />
            </div>
            <MeasureField label={tt('field.length')} value={vehicle.length} onChange={(v) => onVehicleChange({ ...vehicle, length: numOr0(v) })} />
            <MeasureField label={tt('field.width')} value={vehicle.width} onChange={(v) => onVehicleChange({ ...vehicle, width: numOr0(v) })} />
            <MeasureField label={tt('field.height')} value={vehicle.height} onChange={(v) => onVehicleChange({ ...vehicle, height: numOr0(v) })} />
          </>
        )}

        <span className="text-caption text-muted" data-testid="header-summary">
          {volumes}
        </span>

        {/* Стратегия расчёта — здесь, и только здесь (5nb этап 2): выбирать «как грузим» логично
            до расчёта, а не после него; с ладеплана переключатели убраны. Пересчёта отсюда нет —
            выбор применяет «Рассчитать». */}
        <div className="flex flex-wrap items-center gap-2">
          <LoadingModeSwitch value={loadingMode} onChange={onLoadingModeChange} />
          {/* «Hinten und Seite» называет доступ (открыты обе двери), а не волшебный режим: из имени
              кнопки не видно, что считаются оба варианта и показывается более плотный (находка QA).
              Подсказка переехала сюда вместе с переключателем; её aria-label намеренно НЕ равен
              имени переключателя, иначе на странице было бы два элемента «Belademodus»
              (LKWkalk-lu6). */}
          <InfoHint
            ariaLabel={tt('ladeplan.loadingModeHintLabel')}
            text={tt('ladeplan.loadingModeHint')}
          />
          <OrderGroupingToggle value={orderGrouping} onChange={onOrderGroupingChange} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!compact && (
            <>
              {/* Палитра — не то, что меняют посреди прокрутки (ADR 025): скрывается вместе с
                  Demo/Reset, а не остаётся в ужатой строке. */}
              <ThemeSwitch />
              <Button variant="ghost" onClick={onDemo}>{tt('action.demo')}</Button>
              <Button variant="secondary" onClick={onReset}>{tt('action.reset')}</Button>
            </>
          )}
          <Button variant="primary" onClick={onCalculate}>{tt('action.calculate')}</Button>
        </div>
      </div>
      {errorCount > 0 && (
        // Кнопка не гаснет (§6): погашенная не фокусируется и не объявляется скринридером, поэтому
        // причина живёт рядом с ней текстом, а нажатие ведёт к первой ошибочной строке.
        <p role="status" className="mx-auto mt-1 max-w-[1120px] text-caption font-semibold text-danger">
          {fillTemplate(tt('setup.header.calcBlocked'), { n: errorCount })}
        </p>
      )}
    </div>
  );
}
