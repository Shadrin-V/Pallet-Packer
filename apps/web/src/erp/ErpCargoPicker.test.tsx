// Шаг выбора груза в сборке для ERP (макет, блоки 2 и 5): «Reise laden» и «Bestellpositionen wählen»
// внутри настоящего экрана «Einrichten».
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ErpSession, OpenLine, OrderZone, TripImport } from '@shadrin-v/contracts';
import { LocaleProvider } from '../i18n/LocaleContext';
import { HostProvider } from '../host/HostContext';
import type { ErpSource } from '../data/ErpSource';
import { FrappeDataProvider } from '../data/FrappeDataProvider';
import { readStored, writeStored } from '../lib/draftStorage';
import { SetupScreen } from '../screens/SetupScreen';
import { orderStateFromZone, type OrderState } from '../screens/setup/setupState';
import { ErpCargoPicker, PICKER_MAX_SELECTION, PICKER_SECTION_ID, PICKER_TRIP_INPUT_ID } from './ErpCargoPicker';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../packages/contracts/fixtures/erp-v1');
const readFixture = (name: string) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
const fixtureTrip = (): TripImport => readFixture('reise-LKW-2026-00412.json').message;

const SESSION: ErpSession = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 'tok-geheim', appVersion: '0.0.0' };

let fake: Mocked<ErpSource>;
beforeEach(() => {
  fake = {
    session: vi.fn(),
    loadTrip: vi.fn(),
    listOpenLines: vi.fn().mockResolvedValue([]),
    importLines: vi.fn(),
  };
});

function renderSetupWithPicker(source: ErpSource = fake, initialOrders?: OrderState[]) {
  return render(
    <LocaleProvider initial="de">
      <HostProvider value={{ kind: 'erp', session: SESSION, source }}>
        <SetupScreen
          initialOrders={initialOrders}
          onCalculate={() => true}
          loadingMode="combined"
          orderGrouping="strict"
          onLoadingModeChange={() => {}}
          onOrderGroupingChange={() => {}}
          importSlot={(api) => <ErpCargoPicker source={source} api={api} />}
        />
      </HostProvider>
    </LocaleProvider>,
  );
}

const lineA: OpenLine = {
  lineRef: 'lA', orderId: 'BE-40388', supplier: 'Muster Holz Sp. z o.o.', itemCode: 'EUR104',
  itemName: 'Europalette 1200x800 gebraucht', openQuantity: 204, uom: 'Nos', dueDate: '2026-11-25', placeable: true,
};
const lineB: OpenLine = {
  lineRef: 'lB', orderId: 'BE-40388', supplier: 'Muster Holz Sp. z o.o.', itemCode: 'EIN112',
  itemName: 'Einwegpalette 1200x800 leicht', openQuantity: 160, uom: 'Nos', dueDate: '2026-11-25', placeable: true,
};
const lineM3Unplaceable: OpenLine = {
  lineRef: 'lM', orderId: 'BE-40397', supplier: 'Muster Holz Sp. z o.o.', itemCode: 'SCH205',
  itemName: 'Bretter 22x100x1200 mm frisch', openQuantity: 12.4, uom: 'Cubic Meter', dueDate: '2026-11-25',
  placeable: false, reason: 'ERR_LINE_UNIT_NOT_PIECES',
};
const zoneAB: OrderZone = {
  orderId: 'BE-40388', partner: 'Muster Holz Sp. z o.o.', positions: [
    { itemCode: 'EUR104', itemName: 'Europalette 1200x800 gebraucht', quantity: 204, uom: 'Nos', lineRef: 'lA', length: 1200, width: 800, height: 144, dimensionsSource: 'catalog' },
    { itemCode: 'EIN112', itemName: 'Einwegpalette 1200x800 leicht', quantity: 160, uom: 'Nos', lineRef: 'lB', length: 1200, width: 800, dimensionsSource: 'name' },
  ],
};

const rowOf = (text: string) => screen.getByText(text).closest('tr')!;
const checkboxOf = (text: string) => within(rowOf(text)).getByRole('checkbox');

const loadTripBy = async (name: string) => {
  const input = screen.getByLabelText('Reise');
  await userEvent.clear(input);
  await userEvent.type(input, name);
  await userEvent.click(screen.getByRole('button', { name: 'Reise laden' }));
};

describe('ErpCargoPicker — Reise laden', () => {
  it('Reise laden: карточка заказа из образца, строка в м³ в списке неразмещаемого, повтор не дублирует', async () => {
    fake.loadTrip.mockResolvedValue(fixtureTrip());
    renderSetupWithPicker();
    await userEvent.type(screen.getByLabelText('Reise'), 'LKW-2026-00412');
    await userEvent.click(screen.getByRole('button', { name: 'Reise laden' }));
    expect(fake.loadTrip).toHaveBeenCalledWith('LKW-2026-00412');
    expect(await screen.findByDisplayValue('PUR-ORD-2026-00871')).toBeInTheDocument();
    expect(screen.getByText('2 Positionen aus Reise LKW-2026-00412 übernommen')).toBeInTheDocument();
    expect(screen.queryByText(/schon im Plan/)).toBeNull();
    expect(within(screen.getByTestId('unplaceable-list')).getByText('in m³: nicht planbar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reise laden' }));
    expect(await screen.findByText(/2 schon im Plan/)).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('PUR-ORD-2026-00871')).toHaveLength(1);
  });

  it('секция с id и именем по макету, поле рейса с id; обе части видны сразу', async () => {
    renderSetupWithPicker();
    const region = screen.getByRole('region', { name: 'Positionen wählen' });
    expect(region).toHaveAttribute('id', PICKER_SECTION_ID);
    expect(screen.getByLabelText('Reise')).toHaveAttribute('id', PICKER_TRIP_INPUT_ID);
    expect(within(region).getByRole('heading', { name: 'Reise laden' })).toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'Bestellpositionen wählen' })).toBeInTheDocument();
    expect(within(region).getByText('offene Positionen der Bestellungen, auch Direktlieferungen an Kunden')).toBeInTheDocument();
    expect(region.className).toMatch(/print:hidden/);
    await waitFor(() => expect(fake.listOpenLines).toHaveBeenCalledTimes(1));
    expect(fake.listOpenLines).toHaveBeenCalledWith({ limit: 200 });
  });

  it('рейс «не найден или нет прав», скрытый заказ в рейсе, нет роли — три текста, ни один не утверждает «не существует»', async () => {
    fake.loadTrip
      .mockRejectedValueOnce({ code: 'ERR_TRIP_NOT_FOUND' })
      .mockRejectedValueOnce({ code: 'ERR_FORBIDDEN', details: { doctype: 'Purchase Order' } })
      .mockRejectedValueOnce({ code: 'ERR_FORBIDDEN' });
    renderSetupWithPicker();
    await loadTripBy('LKW-12999');
    expect(await screen.findByText('Reise LKW-12999 nicht gefunden oder keine Berechtigung')).toBeInTheDocument();
    expect(screen.getByText('Prüfe die Nummer in der LKW-Disposition. Fehlt dir die Berechtigung, frag die Disposition.')).toBeInTheDocument();
    expect(screen.queryByText(/gibt es nicht|existiert nicht/)).toBeNull();
    await loadTripBy('LKW-12871');
    expect(await screen.findByText('Reise LKW-12871: eine Bestellung darin ist für dich nicht sichtbar')).toBeInTheDocument();
    expect(screen.getByText('Frag die Disposition.')).toBeInTheDocument();
    expect(screen.queryByText(/LKW-12999/)).toBeNull();
    expect(screen.queryByText(/gibt es nicht|existiert nicht/)).toBeNull();
    await loadTripBy('LKW-12872');
    expect(await screen.findByText('Du hast keinen Zugriff auf den Ladungsplaner. Frag die Disposition.')).toBeInTheDocument();
    expect(screen.queryByText(/LKW-12871/)).toBeNull();
    expect(screen.queryByText(/gibt es nicht|existiert nicht/)).toBeNull();
    expect(screen.getByLabelText('Reise')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reise laden' })).toBeEnabled();
  });

  it('неизвестный код ошибки: общий текст, шаг продолжает работать', async () => {
    fake.loadTrip.mockRejectedValueOnce({ code: 'ERR_SOMETHING_NEW' }).mockResolvedValueOnce(fixtureTrip());
    renderSetupWithPicker();
    await loadTripBy('LKW-2026-00412');
    expect(await screen.findByText('Das ERP hat nicht wie erwartet geantwortet. Bitte erneut versuchen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reise laden' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Reise laden' }));
    expect(await screen.findByDisplayValue('PUR-ORD-2026-00871')).toBeInTheDocument();
    expect(screen.queryByText('Das ERP hat nicht wie erwartet geantwortet. Bitte erneut versuchen.')).toBeNull();
  });

  it('неизвестный код через настоящий провайдер: ответ {"message":{"code":"ERR_SOMETHING_NEW"}} → общий текст, повтор успешен', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('{"message":[]}'))                                   // bestellpositionen при монтировании
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { code: 'ERR_SOMETHING_NEW' } }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(readFixture('reise-LKW-2026-00412.json'))));
    renderSetupWithPicker(new FrappeDataProvider({ fetchImpl: f }));
    await userEvent.type(screen.getByLabelText('Reise'), 'LKW-2026-00412');
    await userEvent.click(screen.getByRole('button', { name: 'Reise laden' }));
    expect(await screen.findByText('Das ERP hat nicht wie erwartet geantwortet. Bitte erneut versuchen.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reise laden' }));
    expect(await screen.findByDisplayValue('PUR-ORD-2026-00871')).toBeInTheDocument();
  });

  it('рейс сохраняется в черновике и показан строкой над заказами', async () => {
    fake.loadTrip.mockResolvedValue(fixtureTrip());
    renderSetupWithPicker();
    await loadTripBy('LKW-2026-00412');
    await screen.findByDisplayValue('PUR-ORD-2026-00871');
    const saved = JSON.parse(readStored('ladungsplaner.setup')!);
    expect(saved.trip).toEqual({ tripId: 'LKW-2026-00412', loadingDate: '2026-11-24' });
    expect(screen.getByText('Reise LKW-2026-00412 · Verladung 24.11.2026 · 1 Bestellungen, 1 Positionen in Stück, 1 nicht planbar')).toBeInTheDocument();
    // токен сессии в хранилище не попадает
    for (let i = 0; i < localStorage.length; i++) {
      expect(localStorage.getItem(localStorage.key(i)!)).not.toContain('tok-geheim');
    }
  });

  it('строка рейса считает и заказ без карточки (все его строки неразмещаемые)', async () => {
    const base = fixtureTrip();
    const onlyM3: OrderZone = {
      orderId: 'PUR-ORD-2026-00872', partner: 'Muster Holz Sp. z o.o.', positions: [
        { itemCode: 'MAT0078', itemName: 'Schnittholz 22x100x2400', quantity: 0, uom: 'Cubic Meter',
          lineRef: 'k1l2m3n4o5', dimensionsSource: 'manual', unplaceable: 'ERR_LINE_UNIT_NOT_PIECES', sourceQuantity: 3.5 },
      ],
    };
    fake.loadTrip.mockResolvedValue({ ...base, zones: [...base.zones, onlyM3] });
    renderSetupWithPicker();
    await loadTripBy('LKW-2026-00412');
    await screen.findByDisplayValue('PUR-ORD-2026-00871');
    expect(screen.queryByDisplayValue('PUR-ORD-2026-00872')).toBeNull();
    expect(screen.getByTestId('trip-line')).toHaveTextContent(
      'Reise LKW-2026-00412 · Verladung 24.11.2026 · 2 Bestellungen, 1 Positionen in Stück, 2 nicht planbar',
    );
  });

  it('рейс переживает перезагрузку и сбрасывается «Zurücksetzen»', async () => {
    fake.loadTrip.mockResolvedValue(fixtureTrip());
    const first = renderSetupWithPicker();
    await loadTripBy('LKW-2026-00412');
    await screen.findByDisplayValue('PUR-ORD-2026-00871');
    first.unmount();
    renderSetupWithPicker();
    expect(screen.getByText(/^Reise LKW-2026-00412 · Verladung 24\.11\.2026/)).toBeInTheDocument();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(screen.queryByText(/^Reise LKW-2026-00412 · Verladung/)).toBeNull();
    const saved = JSON.parse(readStored('ladungsplaner.setup')!);
    expect(saved.trip).toBeUndefined();
    vi.restoreAllMocks();
  });

  // Итоговое ревью, P1: номер рейса — только у плана, все позиции которого пришли из этого рейса.
  const tripB = (): TripImport => ({
    tripId: 'LKW-2026-00500', loadingDate: '2026-11-26', zones: [
      { orderId: 'PUR-ORD-2026-00900', partner: 'Muster Holz Sp. z o.o.', positions: [
        { itemCode: 'EUR104', itemName: 'Europalette 1200x800 gebraucht', quantity: 30, uom: 'Nos', lineRef: 'zB1', length: 1200, width: 800, height: 144, dimensionsSource: 'catalog' },
      ] },
    ],
  });

  it('рейс A, затем рейс B: строки рейса нет — план своя подборка, а не рейс B', async () => {
    fake.loadTrip.mockResolvedValueOnce(fixtureTrip()).mockResolvedValueOnce(tripB());
    renderSetupWithPicker();
    await loadTripBy('LKW-2026-00412');
    expect(await screen.findByTestId('trip-line')).toHaveTextContent(/^Reise LKW-2026-00412/);
    await loadTripBy('LKW-2026-00500');
    await screen.findByDisplayValue('PUR-ORD-2026-00900');
    expect(screen.getByDisplayValue('PUR-ORD-2026-00871')).toBeInTheDocument();
    expect(screen.queryByTestId('trip-line')).toBeNull();
    expect(screen.queryByText(/LKW-2026-00500 ·/)).toBeNull();
    const saved = JSON.parse(readStored('ladungsplaner.setup')!) as { orders: OrderState[] };
    expect(saved.orders.flatMap((o) => o.positions).map((p) => p.fromTrip)).toEqual(['LKW-2026-00412', 'LKW-2026-00412', 'LKW-2026-00500']);
  });

  it('рейс, затем отдельные строки: строки рейса нет', async () => {
    fake.loadTrip.mockResolvedValue(fixtureTrip());
    fake.listOpenLines.mockResolvedValue([lineA]);
    fake.importLines.mockResolvedValue([{ ...zoneAB, positions: [zoneAB.positions[0]] }]);
    renderSetupWithPicker();
    await loadTripBy('LKW-2026-00412');
    expect(await screen.findByTestId('trip-line')).toBeInTheDocument();
    await userEvent.click(checkboxOf('Europalette 1200x800 gebraucht'));
    await userEvent.click(screen.getByRole('button', { name: '1 Positionen in den LKW legen' }));
    expect(await screen.findByDisplayValue('BE-40388')).toBeInTheDocument();
    expect(screen.queryByTestId('trip-line')).toBeNull();
  });

  it('черновик старого вида (рейс есть, у позиций нет происхождения): после восстановления строки рейса нет', () => {
    const legacy = orderStateFromZone(fixtureTrip().zones[0], 0);
    writeStored('ladungsplaner.setup', JSON.stringify({
      vehicle: { id: 'v', name: 'LKW', length: 13600, width: 2450, height: 2700 },
      orders: [legacy],
      trip: { tripId: 'LKW-2026-00412', loadingDate: '2026-11-24' },
    }));
    renderSetupWithPicker();
    expect(screen.getByDisplayValue('PUR-ORD-2026-00871')).toBeInTheDocument();
    expect(screen.queryByTestId('trip-line')).toBeNull();
  });

  it('демо замещает черновик: строки рейса над его заказами нет', async () => {
    fake.loadTrip.mockResolvedValue(fixtureTrip());
    renderSetupWithPicker();
    await loadTripBy('LKW-2026-00412');
    expect(await screen.findByTestId('trip-line')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Demo' }));
    expect(screen.queryByTestId('trip-line')).toBeNull();
  });

  it('пока рейс грузится: кнопка aria-disabled и aria-busy, повторное нажатие второго запроса не шлёт', async () => {
    let resolveTrip!: (t: TripImport) => void;
    fake.loadTrip.mockReturnValue(new Promise<TripImport>((r) => { resolveTrip = r; }));
    renderSetupWithPicker();
    await userEvent.type(screen.getByLabelText('Reise'), 'LKW-2026-00412');
    const btn = screen.getByRole('button', { name: 'Reise laden' });
    expect(btn).not.toHaveAttribute('aria-busy');
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).not.toBeDisabled(); // остаётся в порядке фокуса
    await userEvent.click(btn);
    await userEvent.type(screen.getByLabelText('Reise'), '{Enter}');
    expect(fake.loadTrip).toHaveBeenCalledTimes(1);
    resolveTrip(fixtureTrip());
    expect(await screen.findByDisplayValue('PUR-ORD-2026-00871')).toBeInTheDocument();
    expect(btn).not.toHaveAttribute('aria-disabled');
    expect(btn).not.toHaveAttribute('aria-busy');
  });

  it('пустое поле рейса: нажатие ставит фокус в поле, запроса нет; плейсхолдер по макету', async () => {
    renderSetupWithPicker();
    const input = screen.getByLabelText('Reise');
    expect(input).toHaveAttribute('placeholder', 'LKW-Nummer');
    await userEvent.type(input, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Reise laden' }));
    expect(input).toHaveFocus();
    expect(fake.loadTrip).not.toHaveBeenCalled();
  });

  it('истёкшая сессия и смена пользователя: ни текста ошибки, ни повтора — экраны сессии показывает оболочка', async () => {
    fake.listOpenLines.mockRejectedValueOnce({ code: 'ERR_SESSION_CHANGED' });
    fake.loadTrip.mockRejectedValueOnce({ code: 'ERR_NOT_LOGGED_IN' }).mockRejectedValueOnce({ code: 'ERR_SESSION_CHANGED' });
    renderSetupWithPicker();
    await loadTripBy('LKW-2026-00412');
    await waitFor(() => expect(fake.loadTrip).toHaveBeenCalledTimes(1));
    await loadTripBy('LKW-2026-00412');
    await waitFor(() => expect(fake.loadTrip).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Deine Anmeldung im ERP ist abgelaufen.')).toBeNull();
    expect(screen.queryByText('Im ERP ist jetzt ein anderer Benutzer angemeldet. Lade die Seite neu.')).toBeNull();
    expect(screen.queryByText('Das ERP hat nicht wie erwartet geantwortet. Bitte erneut versuchen.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fake.loadTrip).toHaveBeenCalledTimes(2);
    expect(fake.listOpenLines).toHaveBeenCalledTimes(1);
  });
});

describe('ErpCargoPicker — Bestellpositionen wählen', () => {
  it('строки закупки: неразмещаемая не выбирается, итог и кнопка по макету, выбранные уходят в порядке таблицы', async () => {
    fake.listOpenLines.mockResolvedValue([lineA, lineM3Unplaceable, lineB]);
    fake.importLines.mockResolvedValue([zoneAB]);
    renderSetupWithPicker();
    await screen.findByText('Europalette 1200x800 gebraucht');
    // колонки — в порядке макета
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['', 'Lieferant', 'Bestellung', 'Artikel', 'offen', 'Einheit', 'Liefertermin', 'Kunde bei Direktlieferung']);
    const rowA = rowOf('Europalette 1200x800 gebraucht');
    expect(within(rowA).getByText('204')).toBeInTheDocument();
    expect(within(rowA).getByText('Stk')).toBeInTheDocument();
    expect(within(rowA).getByText('25.11.2026')).toBeInTheDocument();
    expect(within(rowA).getByText('Lager')).toBeInTheDocument();
    expect(checkboxOf('Bretter 22x100x1200 mm frisch')).toBeDisabled();
    expect(within(rowOf('Bretter 22x100x1200 mm frisch')).getByText('in m³: nicht planbar')).toBeInTheDocument();
    expect(screen.getByText('Positionen in m³ (Schnittholz) kannst du nicht wählen: der Ladungsplaner rechnet mit Stück und Palettenmaßen.')).toBeInTheDocument();
    expect(screen.getByText('Σ ausgewählt: 0 Positionen · 0 Stk')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '0 Positionen in den LKW legen' })).toBeDisabled();
    // отмечаем B раньше A — уходят всё равно в порядке таблицы
    await userEvent.click(checkboxOf('Einwegpalette 1200x800 leicht'));
    await userEvent.click(checkboxOf('Europalette 1200x800 gebraucht'));
    expect(screen.getByText('Σ ausgewählt: 2 Positionen · 364 Stk')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '2 Positionen in den LKW legen' }));
    expect(fake.importLines).toHaveBeenCalledWith(['lA', 'lB']);
    expect(await screen.findByDisplayValue('BE-40388')).toBeInTheDocument();
    // выбор очищен, строки теперь «bereits im Plan»
    expect(screen.getByText('Σ ausgewählt: 0 Positionen · 0 Stk')).toBeInTheDocument();
    expect(within(rowOf('Europalette 1200x800 gebraucht')).getByText('bereits im Plan')).toBeInTheDocument();
    expect(checkboxOf('Europalette 1200x800 gebraucht')).toBeDisabled();
    expect(checkboxOf('Einwegpalette 1200x800 leicht')).toBeDisabled();
  });

  it('ошибка добавления: ERR_FORBIDDEN и ERR_LINE_NOT_FOUND — текст по коду, галочки остались, черновик не тронут', async () => {
    fake.listOpenLines.mockResolvedValue([lineA, lineB]);
    fake.importLines.mockRejectedValueOnce({ code: 'ERR_FORBIDDEN' }).mockRejectedValueOnce({ code: 'ERR_LINE_NOT_FOUND' });
    renderSetupWithPicker();
    await screen.findByText('Europalette 1200x800 gebraucht');
    await userEvent.click(checkboxOf('Europalette 1200x800 gebraucht'));
    await userEvent.click(screen.getByRole('button', { name: '1 Positionen in den LKW legen' }));
    expect(await screen.findByText('Du hast keinen Zugriff auf den Ladungsplaner. Frag die Disposition.')).toBeInTheDocument();
    expect(checkboxOf('Europalette 1200x800 gebraucht')).toBeChecked();
    expect(screen.queryByDisplayValue('BE-40388')).toBeNull();
    expect(screen.getAllByDisplayValue('SO-1')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: '1 Positionen in den LKW legen' }));
    expect(await screen.findByText('Mindestens eine Bestellposition ist nicht mehr da oder für dich nicht sichtbar.')).toBeInTheDocument();
    expect(screen.queryByText('Du hast keinen Zugriff auf den Ladungsplaner. Frag die Disposition.')).toBeNull();
    expect(checkboxOf('Europalette 1200x800 gebraucht')).toBeChecked();
    expect(screen.queryByDisplayValue('BE-40388')).toBeNull();
  });

  it('добавление с пропуском: строка, уже бывшая в черновике, не задваивается, и об этом сказано', async () => {
    const inDraft = orderStateFromZone({ ...zoneAB, positions: [zoneAB.positions[0]] }, 0);
    fake.listOpenLines.mockResolvedValue([lineB]);
    fake.importLines.mockResolvedValue([zoneAB]); // сервер вернул и уже взятую lA
    renderSetupWithPicker(fake, [inDraft]);
    await screen.findByText('Einwegpalette 1200x800 leicht');
    await userEvent.click(checkboxOf('Einwegpalette 1200x800 leicht'));
    await userEvent.click(screen.getByRole('button', { name: '1 Positionen in den LKW legen' }));
    expect(await screen.findByText('1 schon im Plan')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Europalette 1200x800 gebraucht')).toHaveLength(1);
    expect(screen.getByDisplayValue('Einwegpalette 1200x800 leicht')).toBeInTheDocument();
  });

  it('строка из черновика: галочка недоступна, «bereits im Plan»', async () => {
    fake.listOpenLines.mockResolvedValue([lineA, lineB]);
    renderSetupWithPicker(fake, [orderStateFromZone({ ...zoneAB, positions: [zoneAB.positions[0]] }, 0)]);
    await screen.findByText('Einwegpalette 1200x800 leicht');
    expect(checkboxOf('Europalette 1200x800 gebraucht')).toBeDisabled();
    expect(within(rowOf('Europalette 1200x800 gebraucht')).getByText('bereits im Plan')).toBeInTheDocument();
    expect(checkboxOf('Einwegpalette 1200x800 leicht')).toBeEnabled();
  });

  it.each([
    ['ERR_LINE_UNIT_NOT_PIECES', 'Cubic Meter', 'in m³: nicht planbar', true],
    ['ERR_LINE_QTY_UNKNOWN', 'Nos', 'Nicht planbar: Umrechnung in Lagereinheiten unbekannt', false],
    ['ERR_LINE_NO_ITEM', 'Nos', 'Nicht planbar: Position ohne Artikel', false],
    ['ERR_LINE_NOTHING_OPEN', 'Nos', 'Nicht planbar: nichts mehr offen', false],
  ] as const)('строка закупки с причиной %s: свой текст, галочка недоступна, заметка про м³ только у штучности', async (reason, uom, text, m3Note) => {
    fake.listOpenLines.mockResolvedValue([{ ...lineA, lineRef: 'x', uom, placeable: false, reason, openQuantity: reason === 'ERR_LINE_QTY_UNKNOWN' ? null : 0 }]);
    renderSetupWithPicker();
    const row = (await screen.findByText(text)).closest('tr')!;
    expect(within(row).getByRole('checkbox')).toBeDisabled();
    expect(!!screen.queryByText(/Positionen in m³ \(Schnittholz\)/)).toBe(m3Note);
  });

  it('подстановка {uom} в причине — через formatUom: сырого шаблона с фигурными скобками нет', async () => {
    fake.listOpenLines.mockResolvedValue([{ ...lineM3Unplaceable, uom: 'Kilogram' }]);
    renderSetupWithPicker();
    expect(await screen.findByText('in Kilogram: nicht planbar')).toBeInTheDocument();
    expect(screen.getByRole('table').textContent).not.toMatch(/[{}]/);
  });

  it('количество неизвестно → «unbekannt»; прямая поставка → клиент; количество в формате локали', async () => {
    fake.listOpenLines.mockResolvedValue([
      { ...lineA, openQuantity: null },
      { ...lineB, openQuantity: 2598, customer: 'Musterkunde Logistik GmbH' },
    ]);
    renderSetupWithPicker();
    await screen.findByText('Europalette 1200x800 gebraucht');
    expect(within(rowOf('Europalette 1200x800 gebraucht')).getByText('unbekannt')).toBeInTheDocument();
    const rowB = rowOf('Einwegpalette 1200x800 leicht');
    expect(within(rowB).getByText('Musterkunde Logistik GmbH')).toBeInTheDocument();
    expect(within(rowB).getByText('2.598')).toBeInTheDocument();
    expect(within(rowB).queryByText('Lager')).toBeNull();
  });

  it(`предел выбора ${PICKER_MAX_SELECTION}: остальные галочки недоступны, заметка о пределе`, async () => {
    const many = Array.from({ length: PICKER_MAX_SELECTION + 1 }, (_, i): OpenLine => ({ ...lineA, lineRef: `l${i}`, itemName: `Palette ${i}` }));
    fake.listOpenLines.mockResolvedValue(many);
    renderSetupWithPicker();
    await screen.findByText('Palette 0');
    expect(screen.queryByText('Höchstens 200 Positionen auf einmal')).toBeNull();
    const boxes = within(screen.getByRole('table')).getAllByRole('checkbox');
    for (const b of boxes.slice(0, PICKER_MAX_SELECTION)) fireEvent.click(b);
    expect(screen.getByText('Höchstens 200 Positionen auf einmal')).toBeInTheDocument();
    expect(boxes[PICKER_MAX_SELECTION]).toBeDisabled();
    expect(boxes[0]).toBeEnabled(); // снять отметку можно
    fireEvent.click(boxes[0]);
    expect(boxes[PICKER_MAX_SELECTION]).toBeEnabled();
  });

  it('фильтр «Liefertermin bis» и поиск уходят в запрос; устаревший ответ не перезаписывает свежий', async () => {
    let resolveH!: (l: OpenLine[]) => void;
    const pendingH = new Promise<OpenLine[]>((r) => { resolveH = r; });
    fake.listOpenLines.mockImplementation(async (q) => {
      if (q?.query === 'H') return pendingH;
      if (q?.query === 'HAN') return [{ ...lineA, itemName: 'Treffer HAN' }];
      return [];
    });
    renderSetupWithPicker();
    const search = screen.getByLabelText('Lieferant oder Artikel');
    expect(search).toHaveAttribute('maxLength', '140');
    const date = screen.getByLabelText('Liefertermin bis');
    expect(date).toHaveAttribute('type', 'date');
    fireEvent.change(date, { target: { value: '2026-11-26' } });
    await waitFor(() => expect(fake.listOpenLines).toHaveBeenLastCalledWith({ query: '', dueBefore: '2026-11-26', limit: 200 }));
    await userEvent.type(search, 'H');
    await waitFor(() => expect(fake.listOpenLines).toHaveBeenLastCalledWith({ query: 'H', dueBefore: '2026-11-26', limit: 200 }));
    await userEvent.type(search, 'AN');
    await waitFor(() => expect(fake.listOpenLines).toHaveBeenLastCalledWith({ query: 'HAN', dueBefore: '2026-11-26', limit: 200 }));
    expect(await screen.findByText('Treffer HAN')).toBeInTheDocument();
    resolveH([{ ...lineA, itemName: 'Veraltet H' }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Veraltet H')).toBeNull();
    expect(screen.getByText('Treffer HAN')).toBeInTheDocument();
    expect(fake.listOpenLines).toHaveBeenLastCalledWith({ query: 'HAN', dueBefore: '2026-11-26', limit: 200 });
  });

  it('поиск с задержкой: быстрый набор — один запрос', async () => {
    renderSetupWithPicker();
    await userEvent.type(screen.getByLabelText('Lieferant oder Artikel'), 'Muster');
    await waitFor(() => expect(fake.listOpenLines).toHaveBeenLastCalledWith({ query: 'Muster', limit: 200 }));
    expect(fake.listOpenLines).toHaveBeenCalledTimes(2); // монтирование + один после паузы
  });

  it('сбой списка строк: текст по коду; истёкшая сессия у кнопки добавления — без текста и без повтора', async () => {
    fake.listOpenLines.mockRejectedValueOnce({ code: 'ERR_FORBIDDEN' });
    const first = renderSetupWithPicker();
    expect(await screen.findByText('Du hast keinen Zugriff auf den Ladungsplaner. Frag die Disposition.')).toBeInTheDocument();
    first.unmount();
    fake.listOpenLines.mockResolvedValue([lineA]);
    fake.importLines.mockRejectedValueOnce({ code: 'ERR_NOT_LOGGED_IN' });
    renderSetupWithPicker();
    await screen.findByText('Europalette 1200x800 gebraucht');
    await userEvent.click(checkboxOf('Europalette 1200x800 gebraucht'));
    await userEvent.click(screen.getByRole('button', { name: '1 Positionen in den LKW legen' }));
    await waitFor(() => expect(fake.importLines).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Deine Anmeldung im ERP ist abgelaufen.')).toBeNull();
    expect(fake.importLines).toHaveBeenCalledTimes(1);
    expect(checkboxOf('Europalette 1200x800 gebraucht')).toBeChecked();
  });

  it.each([
    [PICKER_MAX_SELECTION, true],
    [PICKER_MAX_SELECTION - 1, false],
  ])('ответ из %i строк: подсказка «показаны первые N» — %s', async (count, shown) => {
    fake.listOpenLines.mockResolvedValue(Array.from({ length: count }, (_, i): OpenLine => ({ ...lineA, lineRef: `t${i}`, itemName: `Zeile ${i}` })));
    renderSetupWithPicker();
    await screen.findByText('Zeile 0');
    expect(!!screen.queryByText('Es werden die ersten 200 Positionen gezeigt. Suche oder Liefertermin eingrenzen.')).toBe(shown);
  });

  it('отказ свежего запроса: прежние строки и отметки убраны, видно только сообщение об ошибке', async () => {
    fake.listOpenLines.mockResolvedValueOnce([lineA, lineB]).mockRejectedValueOnce({ code: 'ERR_FORBIDDEN' });
    renderSetupWithPicker();
    await screen.findByText('Europalette 1200x800 gebraucht');
    await userEvent.click(checkboxOf('Europalette 1200x800 gebraucht'));
    expect(screen.getByText('Σ ausgewählt: 1 Positionen · 204 Stk')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Lieferant oder Artikel'), 'X');
    expect(await screen.findByText('Du hast keinen Zugriff auf den Ladungsplaner. Frag die Disposition.')).toBeInTheDocument();
    expect(screen.queryByText('Europalette 1200x800 gebraucht')).toBeNull();
    expect(within(screen.getByRole('table')).queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText('Σ ausgewählt: 0 Positionen · 0 Stk')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '0 Positionen in den LKW legen' })).toBeDisabled();
  });
});
