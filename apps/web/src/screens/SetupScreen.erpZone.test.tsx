// Экран «Einrichten» в сборке для ERP (макет, блок 3): неразмещаемые строки отдельным списком,
// происхождение габаритов под строкой, причина блокировки расчёта рядом с кнопкой, шапка заказа.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Article, ArticleInput, ErpSession, OrderZone } from '@shadrin-v/contracts';
import { LocaleProvider } from '../i18n/LocaleContext';
import { DataProviderProvider } from '../data/DataProviderContext';
import type { DataProvider } from '../data/DataProvider';
import type { ErpSource } from '../data/ErpSource';
import { HostProvider, type Host } from '../host/HostContext';
import { SetupScreen, type SetupScreenProps } from './SetupScreen';
import { SETUP_STORAGE_KEY, emptyOrder, orderStateFromZone, type OrderState } from './setup/setupState';

const SESSION: ErpSession = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 't', appVersion: '0.0.0' };
const ERP_HOST: Host = { kind: 'erp', session: SESSION, source: {} as ErpSource };

type OnCalculate = SetupScreenProps['onCalculate'];

function screenEl(initialOrders: OrderState[] | undefined, onCalculate: OnCalculate) {
  return (
    <SetupScreen
      initialOrders={initialOrders}
      onCalculate={onCalculate}
      loadingMode="combined"
      orderGrouping="strict"
      onLoadingModeChange={() => {}}
      onOrderGroupingChange={() => {}}
    />
  );
}

/** Обычная сборка — как `renderSetup` в SetupScreen.deepLink.test.tsx. */
function renderSetup(dp: DataProvider | null, initialOrders: OrderState[] | undefined, onCalculate: OnCalculate) {
  return render(
    <LocaleProvider initial="de">
      <DataProviderProvider value={dp}>{screenEl(initialOrders, onCalculate)}</DataProviderProvider>
    </LocaleProvider>,
  );
}

/** То же внутри хоста ERP. */
function renderSetupErp(initialOrders: OrderState[] | undefined, onCalculate: OnCalculate, dp: DataProvider | null = null) {
  return render(
    <LocaleProvider initial="de">
      <HostProvider value={ERP_HOST}>
        <DataProviderProvider value={dp}>{screenEl(initialOrders, onCalculate)}</DataProviderProvider>
      </HostProvider>
    </LocaleProvider>,
  );
}

/** Строка в м³: сервер решил, что её не размещают. */
const m3Zone: OrderZone = {
  orderId: 'PUR-ORD-5',
  partner: 'Muster Holz Sp. z o.o.',
  positions: [{
    itemCode: 'SCH205', itemName: 'Bretter 22x100x1200 mm frisch', quantity: 0, sourceQuantity: 12.4,
    uom: 'Cubic Meter', lineRef: 'm1', dimensionsSource: 'manual', unplaceable: 'ERR_LINE_UNIT_NOT_PIECES',
  }],
};

/** Доска: длина и ширина из названия, высоты нет. */
const board: OrderZone = {
  orderId: 'PUR-ORD-9',
  positions: [{
    itemCode: 'MAT0099', itemName: 'Schnittholz 22x100x1200', quantity: 40, uom: 'Nos',
    lineRef: 'b1', length: 1200, width: 100, dimensionsSource: 'name',
  }],
};

const UNIT_HINT = 'Wird nicht geplant: der Ladungsplaner rechnet mit Stück und Palettenmaßen.';
/** Поля строки: первое поле с этой подписью — кузов в шапке экрана, дальше — строки позиций. */
const rowField = (label: string) => screen.getAllByLabelText(label)[1];
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

let onCalculate: ReturnType<typeof vi.fn<OnCalculate>>;
beforeEach(() => {
  globalThis.localStorage?.clear();
  onCalculate = vi.fn<OnCalculate>(() => true);
});

describe('SetupScreen в ERP — неразмещаемые строки', () => {
  it('рейс из одной строки в м³: строка в списке неразмещаемого с причиной, полей нет, расчёт не идёт', async () => {
    renderSetupErp([orderStateFromZone(m3Zone, 0)], onCalculate);
    const list = screen.getByTestId('unplaceable-list');
    expect(within(list).getByText('in m³: nicht planbar')).toBeInTheDocument();
    expect(within(list).getByText(UNIT_HINT)).toBeInTheDocument();
    expect(within(list).getByText('12,4 m³')).toBeInTheDocument();
    expect(within(list).getByText('PUR-ORD-5 · SCH205 Bretter 22x100x1200 mm frisch')).toBeInTheDocument();
    expect(within(list).getByText('Muster Holz Sp. z o.o.')).toBeInTheDocument();
    expect(within(list).queryByRole('spinbutton')).toBeNull();
    // строкой в карточке заказа она не рисуется
    expect(screen.queryByDisplayValue('Bretter 22x100x1200 mm frisch')).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'Berechnen' })[0]);
    expect(onCalculate).not.toHaveBeenCalled();
  });

  it.each([
    ['ERR_LINE_UNIT_NOT_PIECES', 'Cubic Meter', 'in m³: nicht planbar', true],
    ['ERR_LINE_QTY_UNKNOWN', 'Nos', 'Nicht planbar: Umrechnung in Lagereinheiten unbekannt', false],
    ['ERR_LINE_NO_ITEM', 'Nos', 'Nicht planbar: Position ohne Artikel', false],
    ['ERR_LINE_NOTHING_OPEN', 'Nos', 'Nicht planbar: nichts mehr offen', false],
  ] as const)('список неразмещаемого, причина %s: свой текст; пояснение «rechnet mit Stück» только у штучности', (reason, uom, text, unitHint) => {
    renderSetupErp([orderStateFromZone({ ...m3Zone, positions: [{ ...m3Zone.positions[0], uom, unplaceable: reason }] }, 0)], onCalculate);
    const list = screen.getByTestId('unplaceable-list');
    expect(within(list).getByText(text)).toBeInTheDocument();
    expect(!!within(list).queryByText(UNIT_HINT)).toBe(unitHint);
  });

  it('подстановка {uom} — через formatUom: сырого шаблона с фигурными скобками на экране нет', () => {
    renderSetupErp([orderStateFromZone({ ...m3Zone, positions: [{ ...m3Zone.positions[0], uom: 'Kilogram' }] }, 0)], onCalculate);
    const list = screen.getByTestId('unplaceable-list');
    expect(within(list).getByText('in Kilogram: nicht planbar')).toBeInTheDocument();
    expect(list.textContent).not.toMatch(/[{}]/);
  });

  it('неразмещаемая строка без sourceQuantity: количества нет, причина остаётся', () => {
    const { sourceQuantity: _drop, ...noQty } = m3Zone.positions[0];
    renderSetupErp([orderStateFromZone({ ...m3Zone, positions: [noQty] }, 0)], onCalculate);
    const list = screen.getByTestId('unplaceable-list');
    expect(within(list).queryByText(/\d+,\d+ m³|\d+ m³/)).toBeNull();
    expect(within(list).getByText('in m³: nicht planbar')).toBeInTheDocument();
  });

  it('без неразмещаемых строк списка нет', () => {
    renderSetupErp([orderStateFromZone(board, 0)], onCalculate);
    expect(screen.queryByTestId('unplaceable-list')).toBeNull();
  });

  it('строку можно убрать из списка: взвод, затем подтверждение', async () => {
    renderSetupErp([orderStateFromZone(board, 0), orderStateFromZone(m3Zone, 1)], onCalculate);
    const list = screen.getByTestId('unplaceable-list');
    await userEvent.click(within(list).getByRole('button', { name: 'Position aus der Berechnung entfernen' }));
    expect(screen.getByTestId('unplaceable-list')).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Löschen bestätigen' }));
    expect(screen.queryByTestId('unplaceable-list')).toBeNull();
    expect(screen.getByDisplayValue('Schnittholz 22x100x1200')).toBeInTheDocument();
  });
});

describe('SetupScreen в ERP — количество и происхождение габаритов', () => {
  it('дробные штуки: подсказка «2.597,361 Stk, geplant 2.598»; без sourceQuantity подсказки нет', () => {
    const frac: OrderZone = { orderId: 'PUR-ORD-7', positions: [{ itemCode: 'EUR101', itemName: 'Europalette 1200x800 neu', quantity: 2598, sourceQuantity: 2597.361,
      uom: 'Nos', lineRef: 'f1', length: 1200, width: 800, height: 144, dimensionsSource: 'catalog' }] };
    renderSetupErp([orderStateFromZone(frac, 0)], onCalculate);
    expect(screen.getByTestId('source-quantity')).toHaveTextContent('2.597,361 Stk, geplant 2.598');
    cleanup();
    const { sourceQuantity: _d, ...whole } = frac.positions[0];
    renderSetupErp([orderStateFromZone({ ...frac, positions: [whole] }, 0)], onCalculate);
    expect(screen.queryByTestId('source-quantity')).toBeNull();
    cleanup();
    renderSetupErp([orderStateFromZone({ ...frac, positions: [{ ...whole, sourceQuantity: 2598 }] }, 0)], onCalculate);
    expect(screen.queryByTestId('source-quantity')).toBeNull();
  });

  it('доска с размером в названии: высота пуста → заблокировано с причиной; после высоты считает, метка остаётся до правки ширины', async () => {
    renderSetupErp([orderStateFromZone(board, 0)], onCalculate);
    expect(screen.getByText('Länge und Breite aus dem Namen, bitte prüfen')).toBeInTheDocument();
    expect(screen.getByText('Höhe fehlt')).toBeInTheDocument();
    expect(screen.getByText('Noch nicht berechenbar: bei 1 Position fehlen Maße.')).toBeInTheDocument();
    expect(screen.getByText('Schnittholz 22x100x1200: Höhe.')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Berechnen' })[0]);
    expect(onCalculate).not.toHaveBeenCalled();
    // Нажатие при пробелах ведёт к строке: фокус уезжает в её поле артикула следующим кадром. Ждём
    // его, иначе он перехватит фокус посреди набора высоты.
    await nextFrame();
    await userEvent.type(rowField('Höhe'), '22');
    await userEvent.click(screen.getAllByRole('button', { name: 'Berechnen' })[0]);
    expect(onCalculate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Länge und Breite aus dem Namen, bitte prüfen')).toBeInTheDocument();
    await userEvent.clear(rowField('Breite'));
    await userEvent.type(rowField('Breite'), '120');
    expect(screen.queryByText('Länge und Breite aus dem Namen, bitte prüfen')).toBeNull();
  });

  it('пустые габариты без размера в названии: «Maße fehlen» с пояснением, по всем трём полям', () => {
    const blank: OrderZone = { orderId: 'PUR-ORD-3', positions: [{ itemCode: 'DIS101', itemName: 'Display-Halbpalette Typ H1', quantity: 204, uom: 'Nos', lineRef: 'd1', dimensionsSource: 'manual' }] };
    renderSetupErp([orderStateFromZone(blank, 0)], onCalculate);
    const hint = screen.getByTestId('dims-hint');
    expect(within(hint).getByText('Maße fehlen')).toBeInTheDocument();
    expect(within(hint).getByText('Im Namen steht kein Maß. Einmal eintragen: das ERP merkt sich die Maße am Artikel.')).toBeInTheDocument();
    expect(screen.getByText('Display-Halbpalette Typ H1: Länge, Breite, Höhe.')).toBeInTheDocument();
  });

  it('габариты из каталога ERP и полные: «Maße am Artikel gespeichert»', () => {
    const cat: OrderZone = { orderId: 'PUR-ORD-4', positions: [{ itemCode: 'EUR104', itemName: 'Europalette 1200x800 gebraucht', quantity: 204, uom: 'Nos',
      lineRef: 'c1', length: 1200, width: 800, height: 144, dimensionsSource: 'catalog' }] };
    renderSetupErp([orderStateFromZone(cat, 0)], onCalculate);
    expect(within(screen.getByTestId('dims-hint')).getByText('Maße am Artikel gespeichert')).toBeInTheDocument();
  });

  it('сохранение артикула подтверждает габариты: метка «aus dem Namen» → «Maße am Artikel gespeichert»', async () => {
    const upsertArticle = vi.fn(async (a: ArticleInput) => ({ ...a, source: 'erp', updatedAt: 'x', erpFields: ['name'] }) as Article);
    const dp = { upsertArticle } as unknown as DataProvider;
    renderSetupErp([orderStateFromZone(board, 0)], onCalculate, dp);
    await userEvent.type(rowField('Höhe'), '22');
    await userEvent.click(screen.getByTestId('rule-chip'));
    expect(screen.getByText(/Maße und Regeln sind am Artikel MAT0099 gespeichert/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Artikel aktualisieren' }));
    expect(upsertArticle).toHaveBeenCalledWith(expect.objectContaining({ itemCode: 'MAT0099', length: 1200, width: 100, height: 22 }));
    expect(await screen.findByText('Maße am Artikel gespeichert')).toBeInTheDocument();
    expect(screen.queryByText('Länge und Breite aus dem Namen, bitte prüfen')).toBeNull();
    expect(screen.getByText(/Maße und Regeln sind am Artikel MAT0099 gespeichert/)).toBeInTheDocument();
  });
});

describe('SetupScreen в ERP — блокировка расчёта', () => {
  it('кнопка расчёта при пробелах в габаритах и при рейсе только из м³ — aria-disabled с причиной, фокусируема', async () => {
    renderSetupErp([orderStateFromZone(m3Zone, 0)], onCalculate);
    const btn = screen.getAllByRole('button', { name: 'Berechnen' })[0];
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).not.toBeDisabled();
    for (const b of screen.getAllByRole('button', { name: 'Berechnen' })) expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Noch nicht berechenbar: keine Position in Stück.')).toBeInTheDocument();
    btn.focus();
    expect(btn).toHaveFocus();
  });

  it('aria-describedby обеих кнопок указывает на текст причины, который есть в разметке', () => {
    renderSetupErp([orderStateFromZone(board, 0)], onCalculate);
    for (const b of screen.getAllByRole('button', { name: 'Berechnen' })) {
      const id = b.getAttribute('aria-describedby');
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)).toHaveTextContent('Noch nicht berechenbar: bei 1 Position fehlen Maße.');
      expect(b).toHaveAccessibleDescription(/Schnittholz 22x100x1200: Höhe\./);
    }
  });

  it('цикл «импорт → высота → обновление страницы»: происхождение, правила и блокировка восстанавливаются из черновика', async () => {
    const boardRules: OrderZone = { ...board, positions: [{ ...board.positions[0], nestStepPairwise: 22, rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'none' } }] };
    const first = renderSetupErp([orderStateFromZone(boardRules, 0)], onCalculate);
    expect(screen.getAllByRole('button', { name: 'Berechnen' })[0]).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(rowField('Höhe'), '22');
    first.unmount();
    renderSetupErp(undefined, onCalculate); // без initialOrders → loadSetup() из хранилища
    expect(screen.getByText('Länge und Breite aus dem Namen, bitte prüfen')).toBeInTheDocument();
    expect(screen.queryByText('Höhe fehlt')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Berechnen' })[0]).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getAllByRole('button', { name: 'Berechnen' })[0]);
    expect(onCalculate.mock.calls[0][0].cargo[0]).toMatchObject({ rotation: 'none', state: 'verschachtelt', nesting: { stepHeight: 22 } });
  });
});

describe('SetupScreen в ERP — круг исправлений 1', () => {
  const savedDraft = () => JSON.parse(globalThis.localStorage.getItem(SETUP_STORAGE_KEY)!) as { orders: OrderState[] };

  it('нажатие при пробелах ведёт фокус в первое пустое поле размера, а не в поле артикула', async () => {
    renderSetupErp([orderStateFromZone(board, 0)], onCalculate);
    await userEvent.click(screen.getAllByRole('button', { name: 'Berechnen' })[0]);
    expect(rowField('Höhe')).toHaveFocus();
    await nextFrame(); // и позже фокус никто не перехватывает
    expect(rowField('Höhe')).toHaveFocus();
    await userEvent.keyboard('22');
    expect(rowField('Höhe')).toHaveValue(22);
    expect(screen.getByDisplayValue('Schnittholz 22x100x1200')).toBeInTheDocument();
    const p = savedDraft().orders[0].positions[0];
    expect(p.articleCode).toBe('MAT0099');
    expect(p.name).toBe('Schnittholz 22x100x1200');
    expect(onCalculate).not.toHaveBeenCalled();
  });

  it('порядок полей: длина, ширина, высота — без всех размеров фокус в длине', async () => {
    const blank: OrderZone = { orderId: 'PUR-ORD-3', positions: [{ itemCode: 'DIS101', itemName: 'Display-Halbpalette Typ H1', quantity: 204, uom: 'Nos', lineRef: 'd1', dimensionsSource: 'manual' }] };
    renderSetupErp([orderStateFromZone(blank, 0)], onCalculate);
    await userEvent.click(screen.getAllByRole('button', { name: 'Berechnen' })[1]);
    expect(rowField('Länge')).toHaveFocus();
  });

  it('правка размера снимает «Maße am Artikel gespeichert»; следующее сохранение возвращает', async () => {
    const cat: OrderZone = { orderId: 'PUR-ORD-4', positions: [{ itemCode: 'EUR104', itemName: 'Europalette 1200x800 gebraucht', quantity: 204, uom: 'Nos',
      lineRef: 'c1', length: 1200, width: 800, height: 144, dimensionsSource: 'catalog' }] };
    const upsertArticle = vi.fn(async (a: ArticleInput) => ({ ...a, source: 'erp', updatedAt: 'x', erpFields: ['name'] }) as Article);
    renderSetupErp([orderStateFromZone(cat, 0)], onCalculate, { upsertArticle } as unknown as DataProvider);
    expect(screen.getByText('Maße am Artikel gespeichert')).toBeInTheDocument();
    await userEvent.type(rowField('Höhe'), '0');
    expect(screen.queryByText('Maße am Artikel gespeichert')).toBeNull();
    await userEvent.click(screen.getByTestId('rule-chip'));
    await userEvent.click(screen.getByRole('button', { name: 'Artikel aktualisieren' }));
    expect(upsertArticle).toHaveBeenCalledWith(expect.objectContaining({ itemCode: 'EUR104', height: 1440 }));
    expect(await screen.findByText('Maße am Artikel gespeichert')).toBeInTheDocument();
  });

  it('позиция без имени в причине — «Position n»; при двух позициях — множественное число', async () => {
    renderSetupErp([orderStateFromZone(board, 0)], onCalculate);
    await userEvent.click(screen.getByRole('button', { name: '+ Position hinzufügen' }));
    expect(screen.getByText('Noch nicht berechenbar: bei 2 Positionen fehlen Maße.')).toBeInTheDocument();
    expect(screen.getByText('Schnittholz 22x100x1200: Höhe.')).toBeInTheDocument();
    expect(screen.getByText('Position 2: Länge, Breite, Höhe.')).toBeInTheDocument();
    expect(screen.getByTestId('calc-blocked').textContent).not.toMatch(/(^|\.)\s*:/);
  });
});

describe('SetupScreen в ERP — заказ только из неразмещаемых строк', () => {
  it('карточкой не рисуется; строка списка сама называет заказ и поставщика', () => {
    renderSetupErp([orderStateFromZone(board, 0), orderStateFromZone(m3Zone, 1)], onCalculate);
    expect(screen.queryByDisplayValue('PUR-ORD-5')).toBeNull();
    expect(screen.getByDisplayValue('PUR-ORD-9')).toBeInTheDocument();
    const list = screen.getByTestId('unplaceable-list');
    expect(within(list).getByText('PUR-ORD-5 · SCH205 Bretter 22x100x1200 mm frisch')).toBeInTheDocument();
    expect(within(list).getByText('Muster Holz Sp. z o.o.')).toBeInTheDocument();
  });

  it('последняя строка убрана из списка — заказ уходит из черновика целиком', async () => {
    renderSetupErp([orderStateFromZone(board, 0), orderStateFromZone(m3Zone, 1)], onCalculate);
    const list = screen.getByTestId('unplaceable-list');
    await userEvent.click(within(list).getByRole('button', { name: 'Position aus der Berechnung entfernen' }));
    await userEvent.click(within(list).getByRole('button', { name: 'Löschen bestätigen' }));
    const saved = JSON.parse(globalThis.localStorage.getItem(SETUP_STORAGE_KEY)!) as { orders: OrderState[] };
    expect(saved.orders.map((o) => o.orderId)).toEqual(['PUR-ORD-9']);
  });

  it('перестановка карточек перешагивает скрытый заказ', async () => {
    const other: OrderZone = { ...board, orderId: 'PUR-ORD-11' };
    renderSetupErp([orderStateFromZone(board, 0), orderStateFromZone(m3Zone, 1), orderStateFromZone(other, 2)], onCalculate);
    const ids = () => screen.getAllByLabelText('Auftrags-ID').map((el) => (el as HTMLInputElement).value);
    expect(ids()).toEqual(['PUR-ORD-9', 'PUR-ORD-11']);
    await userEvent.click(screen.getAllByRole('button', { name: 'Auftrag nach unten' })[0]);
    expect(ids()).toEqual(['PUR-ORD-11', 'PUR-ORD-9']);
  });

  it('у заказа со смешанными строками карточка остаётся — с одной размещаемой строкой', () => {
    const mixed: OrderZone = { ...board, positions: [...board.positions, m3Zone.positions[0]] };
    renderSetupErp([orderStateFromZone(mixed, 0)], onCalculate);
    expect(screen.getByDisplayValue('PUR-ORD-9')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Schnittholz 22x100x1200')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Bretter 22x100x1200 mm frisch')).toBeNull();
    expect(within(screen.getByTestId('unplaceable-list')).getByText('PUR-ORD-9 · SCH205 Bretter 22x100x1200 mm frisch')).toBeInTheDocument();
  });

  it('обычная сборка: такой заказ рисуется карточкой, как раньше', () => {
    renderSetup(null, [orderStateFromZone(m3Zone, 0)], onCalculate);
    expect(screen.getByDisplayValue('PUR-ORD-5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bretter 22x100x1200 mm frisch')).toBeInTheDocument();
    expect(screen.queryByTestId('unplaceable-list')).toBeNull();
  });
});

describe('SetupScreen в ERP — шапка заказа', () => {
  it('шапка заказа: поставщик и прямая поставка', () => {
    renderSetupErp([orderStateFromZone({ ...board, partner: 'Beispiel Paletten SIA', customer: 'Musterkunde Logistik GmbH' }, 0)], onCalculate);
    expect(screen.getByText('Beispiel Paletten SIA')).toBeInTheDocument();
    expect(screen.getByText('Direktlieferung an Musterkunde Logistik GmbH')).toBeInTheDocument();
  });
});

describe('SetupScreen — обычная сборка не меняется', () => {
  it('обычная сборка: пустая строка без подсказки «Maße fehlen» и без причины у кнопки', () => {
    renderSetup(null, [emptyOrder(1)], onCalculate);
    expect(screen.queryByText('Maße fehlen')).toBeNull();
    expect(screen.queryByText(/Noch nicht berechenbar/)).toBeNull();
    expect(screen.queryByTestId('dims-hint')).toBeNull();
    for (const b of screen.getAllByRole('button', { name: 'Berechnen' })) expect(b).not.toHaveAttribute('aria-disabled');
  });

  it('обычная сборка: импортированные строки без подсказок происхождения, количества и шапки поставщика', () => {
    renderSetup(null, [orderStateFromZone({ ...board, partner: 'Beispiel Paletten SIA', customer: 'Musterkunde Logistik GmbH' }, 0)], onCalculate);
    expect(screen.queryByTestId('dims-hint')).toBeNull();
    expect(screen.queryByText('Höhe fehlt')).toBeNull();
    expect(screen.queryByText('Beispiel Paletten SIA')).toBeNull();
    expect(screen.queryByText(/Direktlieferung/)).toBeNull();
    expect(screen.queryByText(/Noch nicht berechenbar/)).toBeNull();
  });
});
