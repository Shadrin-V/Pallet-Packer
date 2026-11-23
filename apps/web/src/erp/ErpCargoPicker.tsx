// Шаг выбора груза в сборке для ERP (макет, блоки 2 и 5; контракт erp-y6tb9 api-vertrag, §3–§5):
// «Reise laden» — все позиции рейса LKW-Disposition разом; «Bestellpositionen wählen» — открытые строки
// закупки галочками. Обе части видны сразу. Размещаемость строки решает сервер (`placeable`/`reason`),
// порядок строк — тоже (по сроку, затем по заказу): страница их не пересчитывает и не сортирует.
//
// Истёкшая сессия и смена пользователя (`ERR_NOT_LOGGED_IN`, `ERR_SESSION_CHANGED`) — дело оболочки
// `ErpRoot`: она сама уводит на свой экран. Здесь такие отказы не показываются ошибкой и не повторяются.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { OpenLine, TripImport } from '@shadrin-v/contracts';
import type { Locale, TranslationKey } from '@shadrin-v/i18n';
import { useLocale, useT } from '../i18n/LocaleContext';
import { Button } from '../ui/primitives';
import { fillTemplate } from '../screens/components/stackFormula';
import type { DraftImportApi } from '../screens/SetupScreen';
import type { ErpSource, OpenLinesQuery } from '../data/ErpSource';
import { formatUom } from '../lib/uomLabel';
import { errorCodeOf, erpErrorKey, isSessionChanged, isSessionExpired } from './erpErrors';
import { formatSourceQuantity } from './quantityFormat';

export const PICKER_SEARCH_DEBOUNCE_MS = 300;
/** Предел строк одного добавления (контракт §3, `positionen`: 1…200). */
export const PICKER_MAX_SELECTION = 200;
export const PICKER_TRIP_INPUT_ID = 'lp-trip-input';
export const PICKER_SECTION_ID = 'lp-select';
/** Предел строки поиска (контракт §3). */
const SEARCH_MAX_LENGTH = 140;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const INTL_TAG: Readonly<Record<Locale, string>> = { de: 'de-DE', ru: 'ru-RU' };

/** ISO-дата ERP `ГГГГ-ММ-ДД` в формате локали (`24.11.2026`); не дата — как пришла. Без часового пояса:
 *  дата календарная, сдвиг на сутки в браузере западнее UTC недопустим. */
export function formatIsoDate(iso: string, locale: Locale): string {
  const m = ISO_DATE.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat(INTL_TAG[locale], { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Отказ, который показывает оболочка, а не этот шаг. */
const isShellError = (e: unknown) => isSessionExpired(e) || isSessionChanged(e);

type TripStatus =
  | { kind: 'loaded'; n: number; tripId: string; skipped: number }
  | { kind: 'notFound'; tripId: string }
  | { kind: 'forbidden'; tripId: string }
  | { kind: 'error'; key: TranslationKey };

/** Отказ «Reise laden» → что показать. `ERR_TRIP_NOT_FOUND` — «нет ИЛИ нет права» (контракт §5). */
function tripFailure(e: unknown, tripId: string): TripStatus {
  const code = errorCodeOf(e);
  if (code === 'ERR_TRIP_NOT_FOUND') return { kind: 'notFound', tripId };
  if (erpErrorKey(e) === 'erp.forbidden.hiddenOrder') return { kind: 'forbidden', tripId };
  return { kind: 'error', key: erpErrorKey(e) };
}

export interface ErpCargoPickerProps {
  source: ErpSource;
  api: DraftImportApi;
}

export function ErpCargoPicker({ source, api }: ErpCargoPickerProps) {
  const tt = useT();
  const { locale } = useLocale();

  // ---- Reise laden ----
  const [tripName, setTripName] = useState('');
  const [tripStatus, setTripStatus] = useState<TripStatus | null>(null);
  const tripBusy = useRef(false);

  // `api` меняется каждым рендером экрана; запрос отвечает позже — берём ту, что актуальна сейчас.
  const apiRef = useRef(api);
  apiRef.current = api;

  const loadTrip = async (e?: FormEvent) => {
    e?.preventDefault();
    const name = tripName.trim();
    if (!name || tripBusy.current) return;
    tripBusy.current = true;
    setTripStatus(null);
    try {
      const trip: TripImport = await source.loadTrip(name);
      const r = apiRef.current.addZones(trip.zones, {
        tripId: trip.tripId,
        ...(trip.loadingDate !== undefined ? { loadingDate: trip.loadingDate } : {}),
      });
      setTripStatus({ kind: 'loaded', n: r.addedPositions, tripId: trip.tripId, skipped: r.skippedLineRefs.length });
    } catch (err) {
      if (!isShellError(err)) setTripStatus(tripFailure(err, name));
    } finally {
      tripBusy.current = false;
    }
  };

  // ---- Bestellpositionen wählen ----
  const [query, setQuery] = useState('');
  const [dueBefore, setDueBefore] = useState('');
  const [lines, setLines] = useState<OpenLine[]>([]);
  const [linesError, setLinesError] = useState<TranslationKey | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [addStatus, setAddStatus] = useState<{ skipped: number } | { error: TranslationKey } | null>(null);
  const addBusy = useRef(false);
  /** Номер последнего запроса списка: ответ устаревшего не перезаписывает свежий. */
  const listSeq = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchLines = (q: OpenLinesQuery) => {
    const seq = ++listSeq.current;
    // Форму ответа проверяет провайдер: сюда приходит массив строк или отказ промиса.
    source.listOpenLines(q).then(
      (next) => {
        if (seq !== listSeq.current) return;
        setLines(next);
        setLinesError(null);
        // Отметка живёт только на строках, которые видны: что не в таблице, то и не уходит.
        setSelected((s) => new Set(next.filter((l) => s.has(l.lineRef)).map((l) => l.lineRef)));
      },
      (err: unknown) => {
        if (seq !== listSeq.current || isShellError(err)) return;
        setLinesError(erpErrorKey(err));
      },
    );
  };

  useEffect(() => {
    fetchLines({});
    return () => clearTimeout(debounce.current);
    // Только при монтировании и смене источника: фильтры шлют свои запросы сами (`refilter`).
  }, [source]);

  const refilter = (nextQuery: string, nextDue: string) => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(
      () => fetchLines({ query: nextQuery, ...(nextDue ? { dueBefore: nextDue } : {}) }),
      PICKER_SEARCH_DEBOUNCE_MS,
    );
  };

  const inPlan = (l: OpenLine) => api.draftLineRefs.has(l.lineRef);
  const selectable = (l: OpenLine) => l.placeable && !inPlan(l);
  /** Выбранные в порядке таблицы, без повторов. */
  const chosen = lines.filter((l, i) => selectable(l) && selected.has(l.lineRef) && lines.findIndex((x) => x.lineRef === l.lineRef) === i);
  const atLimit = chosen.length >= PICKER_MAX_SELECTION;
  const chosenQty = chosen.reduce((n, l) => n + (l.openQuantity ?? 0), 0);
  const hasM3 = lines.some((l) => !l.placeable && l.reason === 'ERR_LINE_UNIT_NOT_PIECES');

  const toggle = (ref: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });

  const addChosen = async () => {
    if (chosen.length === 0 || addBusy.current) return;
    addBusy.current = true;
    setAddStatus(null);
    try {
      const zones = await source.importLines(chosen.map((l) => l.lineRef));
      const r = apiRef.current.addZones(zones);
      setSelected(new Set());
      setAddStatus(r.skippedLineRefs.length > 0 ? { skipped: r.skippedLineRefs.length } : null);
    } catch (err) {
      if (!isShellError(err)) setAddStatus({ error: erpErrorKey(err) });
    } finally {
      addBusy.current = false;
    }
  };

  const qty = (n: number) => formatSourceQuantity(n, locale);

  return (
    <section id={PICKER_SECTION_ID} aria-label={tt('picker.title')} className="mb-6 flex flex-col gap-4 print:hidden">
      {/* Reise laden */}
      <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-h2 font-semibold text-ink">{tt('picker.trip.title')}</h2>
          <p className="min-w-0 max-w-prose text-caption text-muted">{tt('picker.trip.text')}</p>
        </div>
        <form onSubmit={loadTrip} className="flex flex-wrap items-end gap-2">
          <label htmlFor={PICKER_TRIP_INPUT_ID} className="flex min-w-0 flex-col gap-1">
            <span className="text-caption font-semibold text-muted">{tt('picker.trip.label')}</span>
            <input
              id={PICKER_TRIP_INPUT_ID}
              type="text"
              autoComplete="off"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              aria-invalid={tripStatus !== null && tripStatus.kind !== 'loaded' ? true : undefined}
              className={`w-64 min-w-0 max-w-full rounded-ctl border bg-card px-2 py-1.5 text-body outline-none focus:border-brand ${
                tripStatus !== null && tripStatus.kind !== 'loaded' ? 'border-danger' : 'border-line-strong'
              }`}
            />
          </label>
          <Button type="submit" variant="secondary">{tt('picker.trip.load')}</Button>
        </form>
        {tripStatus?.kind === 'loaded' && (
          <p role="status" className="flex flex-wrap gap-x-2 text-caption text-muted">
            <span>{fillTemplate(tt('picker.trip.loaded'), { n: tripStatus.n, tripId: tripStatus.tripId })}</span>
            {tripStatus.skipped > 0 && (
              <span className="text-warning">{fillTemplate(tt('picker.skipped'), { n: tripStatus.skipped })}</span>
            )}
          </p>
        )}
        {tripStatus !== null && tripStatus.kind !== 'loaded' && (
          <div role="alert" className="flex flex-col gap-0.5 rounded-ctl border border-danger bg-sub p-3 text-caption">
            {tripStatus.kind === 'error' ? (
              <p className="text-danger">{tt(tripStatus.key)}</p>
            ) : (
              <>
                <p className="font-semibold text-danger">
                  {fillTemplate(tt(tripStatus.kind === 'notFound' ? 'picker.trip.notFound' : 'picker.trip.forbidden'), { tripId: tripStatus.tripId })}
                </p>
                <p className="text-muted">
                  {tt(tripStatus.kind === 'notFound' ? 'picker.trip.notFoundHint' : 'picker.trip.forbiddenHint')}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bestellpositionen wählen */}
      <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-h2 font-semibold text-ink">{tt('picker.lines.title')}</h2>
          <p className="min-w-0 text-caption text-muted">{tt('picker.lines.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-caption font-semibold text-muted">{tt('picker.lines.search')}</span>
            <input
              type="search"
              maxLength={SEARCH_MAX_LENGTH}
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                refilter(e.target.value, dueBefore);
              }}
              className="w-64 min-w-0 max-w-full rounded-ctl border border-line-strong bg-card px-2 py-1.5 text-body outline-none focus:border-brand"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-caption font-semibold text-muted">{tt('picker.lines.dueBefore')}</span>
            <input
              type="date"
              value={dueBefore}
              onChange={(e) => {
                setDueBefore(e.target.value);
                refilter(query, e.target.value);
              }}
              className="min-w-0 rounded-ctl border border-line-strong bg-card px-2 py-1.5 text-body outline-none focus:border-brand"
            />
          </label>
        </div>
        {linesError && (
          <p role="alert" className="text-caption text-danger">{tt(linesError)}</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-line text-left text-caption text-muted">
                <th className="w-8 px-2 py-1.5" />
                <th className="px-2 py-1.5 font-semibold">{tt('picker.col.partner')}</th>
                <th className="px-2 py-1.5 font-semibold">{tt('picker.col.order')}</th>
                <th className="px-2 py-1.5 font-semibold">{tt('picker.col.item')}</th>
                <th className="px-2 py-1.5 text-right font-semibold">{tt('picker.col.open')}</th>
                <th className="px-2 py-1.5 font-semibold">{tt('picker.col.uom')}</th>
                <th className="px-2 py-1.5 text-right font-semibold">{tt('picker.col.due')}</th>
                <th className="px-2 py-1.5 font-semibold">{tt('picker.col.customer')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const planned = inPlan(l);
                const isChosen = selectable(l) && selected.has(l.lineRef);
                const disabled = !selectable(l) || (atLimit && !isChosen);
                const uom = formatUom(l.uom, tt);
                return (
                  <tr key={`${l.lineRef}:${i}`} className={`border-b border-line align-top ${l.placeable ? '' : 'text-muted'}`}>
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={isChosen}
                        disabled={disabled}
                        onChange={() => toggle(l.lineRef)}
                        aria-label={`${l.orderId} ${l.itemCode} ${l.itemName}`}
                        className="accent-brand"
                      />
                    </td>
                    <td className="px-2 py-1.5">{l.supplier ?? ''}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono">{l.orderId}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-caption text-muted">{l.itemCode}</span>{' '}
                      <span>{l.itemName}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {!l.placeable && l.reason ? (
                        <span className="rounded-pill border border-warning px-2 py-0.5 text-caption text-warning">
                          {fillTemplate(tt(l.reason), { uom })}
                        </span>
                      ) : planned ? (
                        <span className="text-caption text-muted">{tt('picker.inPlan')}</span>
                      ) : l.openQuantity === null ? (
                        <span className="text-muted">{tt('picker.qtyUnknown')}</span>
                      ) : (
                        qty(l.openQuantity)
                      )}
                    </td>
                    <td className="px-2 py-1.5">{uom}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {l.dueDate ? formatIsoDate(l.dueDate, locale) : ''}
                    </td>
                    <td className="px-2 py-1.5">
                      {l.customer ? l.customer : <span className="text-muted">{tt('picker.toStock')}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hasM3 && <p className="text-caption text-muted">{tt('picker.lines.m3Note')}</p>}
        {atLimit && <p className="text-caption text-warning">{tt('picker.limit')}</p>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-caption text-muted">
            {fillTemplate(tt('picker.lines.sum'), { n: chosen.length, qty: qty(chosenQty) })}
          </span>
          <Button variant="primary" disabled={chosen.length === 0} onClick={() => void addChosen()}>
            {fillTemplate(tt('picker.lines.add'), { n: chosen.length })}
          </Button>
        </div>
        {addStatus && 'skipped' in addStatus && (
          <p role="status" className="text-right text-caption text-warning">
            {fillTemplate(tt('picker.skipped'), { n: addStatus.skipped })}
          </p>
        )}
        {addStatus && 'error' in addStatus && (
          <p role="alert" className="text-right text-caption text-danger">{tt(addStatus.error)}</p>
        )}
      </div>
    </section>
  );
}
