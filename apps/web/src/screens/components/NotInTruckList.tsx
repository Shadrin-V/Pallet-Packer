// «Nicht im LKW» в сборке для ERP (макет, блок 4): всё, что в машину не попало, — неразмещённое
// текущей раскладки (с количеством, стопками и причиной «kein Platz») и неразмещаемые строки ERP
// (м³ и др.: точное исходное количество с единицей и причина). Печатается: лист читают те, кто
// грузит машину, и ему нужно знать, что осталось на складе. Строки — `notInTruckRows` (чистый
// модуль, те же строки идут в картинку).
import type { Layout, Load } from '@shadrin-v/engine';
import { useLocale } from '../../i18n/LocaleContext';
import { notInTruckRows } from '../../erp/erpPlanExport';
import type { PlanContext } from '../../erp/planContext';

export interface NotInTruckListProps {
  load: Load;
  /** ТЕКУЩАЯ раскладка экрана (с ручными правками). */
  layout: Layout;
  context?: PlanContext;
  /** id позиции → знак позиции (задача 15); без карты знака нет. */
  marks?: ReadonlyMap<string, string>;
}

const CHIP = 'shrink-0 rounded-pill border px-2 py-0.5 text-caption';

export function NotInTruckList({ load, layout, context, marks }: NotInTruckListProps) {
  const { locale, tt } = useLocale();
  const rows = notInTruckRows({ load, layout, context, marks, tt, locale });
  if (rows.length === 0) return null;
  const title = tt('plan.notInTruck.title');
  return (
    <section data-testid="not-in-truck" aria-label={title} className="flex flex-col gap-2" style={{ breakInside: 'avoid' }}>
      <h2 className="text-h2 font-semibold">{title}</h2>
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <li
            key={r.positionId}
            data-position-id={r.positionId}
            data-cargo-type={r.cargoTypeId}
            className="flex flex-wrap items-start justify-between gap-3 py-2"
          >
            <span className="flex min-w-0 flex-col gap-0.5 text-body">
              <span className="flex flex-wrap items-baseline gap-x-2">
                {r.mark && (
                  <span data-testid="position-mark" className="font-bold text-ink">
                    {r.mark}
                  </span>
                )}
                {r.amount && <b className="font-semibold tabular-nums">{r.amount}</b>}
                <span>{r.stacks ? `${r.item} · ${r.stacks}` : r.item}</span>
              </span>
              <span className="text-caption text-muted">{r.order}</span>
            </span>
            <span className={`${CHIP} ${r.kind === 'noRoom' ? 'border-danger text-danger' : 'border-warning text-warning'}`}>
              {r.reason}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
