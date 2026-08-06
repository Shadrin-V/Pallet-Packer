import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderZone } from '@shadrin-v/contracts';
import { LocaleProvider } from '../i18n/LocaleContext';
import { DataProviderProvider } from '../data/DataProviderContext';
import type { DataProvider } from '../data/DataProvider';
import { SetupScreen } from './SetupScreen';
import { SETUP_STORAGE_KEY, emptyOrder, emptyPosition, type OrderState } from './setup/setupState';

const ZONE: OrderZone = {
  orderId: 'SO-1234',
  positions: [
    { itemCode: 'ABB101', itemName: 'Einwegpalette', quantity: 12, length: 800, width: 600, height: 144, dimensionsSource: 'erpnext-field' },
  ],
};

/** Провайдер-заглушка: реализован ровно тот метод, который трогает deep-link. */
function fakeProvider(importOrder: DataProvider['importOrder']): DataProvider {
  return { importOrder } as unknown as DataProvider;
}

function renderSetup(dp: DataProvider | null, initialOrders?: OrderState[]) {
  return render(
    <LocaleProvider initial="de">
      <DataProviderProvider value={dp}>
        <SetupScreen
          initialOrders={initialOrders}
          onCalculate={() => true}
          loadingMode="combined"
          orderGrouping="strict"
          onLoadingModeChange={() => {}}
          onOrderGroupingChange={() => {}}
        />
      </DataProviderProvider>
    </LocaleProvider>,
  );
}

describe('SetupScreen — deep-link импорта заказа (s17)', () => {
  beforeEach(() => {
    globalThis.localStorage?.removeItem(SETUP_STORAGE_KEY);
    globalThis.history.replaceState(null, '', '/');
  });

  it('нетронутая стартовая заготовка ЗАМЕЩАЕТСЯ импортированным заказом, а не дополняется (F2)', async () => {
    // Решение владельца 2026-08-06: чистый браузер даёт [emptyOrder(1)] — ровно одну нетронутую
    // заготовку с пустой позицией. Она даёт блокирующую ошибку «укажите размеры», и добавление
    // импортированного заказа поверх неё упирало бы главный сценарий фичи в заблокированный расчёт
    // из-за карточки, которую логист не создавал. Поэтому заготовка замещается.
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockResolvedValue(ZONE);

    renderSetup(fakeProvider(importOrder));

    await waitFor(() => expect(screen.getByDisplayValue('SO-1234')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('SO-1')).not.toBeInTheDocument();
    expect(screen.getAllByDisplayValue('SO-1234')).toHaveLength(1);
    expect(screen.getByDisplayValue('Einwegpalette')).toBeInTheDocument();
    expect(importOrder).toHaveBeenCalledTimes(1);
    expect(importOrder).toHaveBeenCalledWith('SO-1234');
    expect(globalThis.location.search).toBe('');
  });

  it('черновик с реальным содержимым ДОПОЛНЯЕТСЯ импортированным заказом, а не замещается (F2)', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockResolvedValue(ZONE);
    const filled: OrderState[] = [
      {
        ...emptyOrder(1),
        positions: [{ ...emptyPosition(), name: 'Handpalette', length: 1200, width: 800, height: 150 }],
      },
    ];

    renderSetup(fakeProvider(importOrder), filled);

    await waitFor(() => expect(screen.getByDisplayValue('SO-1234')).toBeInTheDocument());
    expect(screen.getByDisplayValue('SO-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Handpalette')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Einwegpalette')).toBeInTheDocument();
    expect(importOrder).toHaveBeenCalledTimes(1);
    expect(globalThis.location.search).toBe('');
  });

  it('deepLinkDoneRef защищает от повторного импорта, если черновик правят, пока запрос висит (F1)', async () => {
    // Прод-сценарий, не дев-костыль StrictMode: ERPNext отвечает медленно, логист правит черновик
    // (клик по «+ Auftrag hinzufügen»), пока запрос ещё в полёте. Эффект deep-link зависит от
    // [orders, dp], а `orders` меняется на КАЖДОЕ такое действие — без караульного ref эффект
    // перезапустился бы и позвал `importOrder` второй раз поверх ещё не завершённого первого.
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    let resolveImport!: (zone: OrderZone) => void;
    const pending = new Promise<OrderZone>((resolve) => {
      resolveImport = resolve;
    });
    const importOrder = vi.fn().mockReturnValue(pending);

    renderSetup(fakeProvider(importOrder));

    await waitFor(() => expect(importOrder).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    const [addOrderButton] = screen.getAllByRole('button', { name: '+ Auftrag hinzufügen' });
    await user.click(addOrderButton);

    expect(importOrder).toHaveBeenCalledTimes(1);

    resolveImport(ZONE);
    await waitFor(() => expect(screen.getByDisplayValue('SO-1234')).toBeInTheDocument());
  });

  it('не импортирует заказ, который уже есть в черновике, и в ERPNext не ходит', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockResolvedValue(ZONE);
    const existing: OrderState[] = [{ ...emptyOrder(1), orderId: 'SO-1234' }];

    renderSetup(fakeProvider(importOrder), existing);

    // Дубль отсекается ДО запроса, поэтому проверяем и вызов, и очистку параметра.
    await waitFor(() => expect(globalThis.location.search).toBe(''));
    expect(importOrder).not.toHaveBeenCalled();
    expect(screen.getAllByDisplayValue('SO-1234')).toHaveLength(1);
  });

  it('не импортирует заказ, если orderId в черновике совпадает с точностью до пробелов (F3)', async () => {
    // setupValidation.ts:95 уже считает « SO-1234 » и «SO-1234» одним заказом (там есть trim);
    // deep-link обязан рассуждать так же, иначе лишний пробел в номере даёт вторую карточку.
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockResolvedValue(ZONE);
    const existing: OrderState[] = [{ ...emptyOrder(1), orderId: '  SO-1234  ' }];

    renderSetup(fakeProvider(importOrder), existing);

    await waitFor(() => expect(globalThis.location.search).toBe(''));
    expect(importOrder).not.toHaveBeenCalled();
    // getByDisplayValue нормализует пробелы при сравнении — единственная карточка всё ещё несёт
    // сырое значение поля '  SO-1234  ' (проверено выше отсутствием второго вызова importOrder).
    expect(screen.getAllByDisplayValue('SO-1234')).toHaveLength(1);
  });

  it('без ?order= в ERPNext не ходит', async () => {
    const importOrder = vi.fn().mockResolvedValue(ZONE);

    renderSetup(fakeProvider(importOrder));

    await waitFor(() => expect(screen.getByDisplayValue('SO-1')).toBeInTheDocument());
    expect(importOrder).not.toHaveBeenCalled();
  });

  it('при ошибке импорта черновик и адрес не трогаются — F5 повторит попытку', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockRejectedValue({ code: 'ERR_ERPNEXT_UNCONFIGURED' });

    renderSetup(fakeProvider(importOrder));

    await waitFor(() => expect(importOrder).toHaveBeenCalledTimes(1));
    expect(screen.queryByDisplayValue('SO-1234')).not.toBeInTheDocument();
    expect(globalThis.location.search).toBe('?order=SO-1234');
    // Стартовый заказ уцелел — импорт не тронул черновик, а не просто не добавил свой.
    expect(screen.getByDisplayValue('SO-1')).toBeInTheDocument();
  });

  it('при отказе ERPNext показывает заметку про настройку', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockRejectedValue({ code: 'ERR_ERPNEXT_UNCONFIGURED' });

    renderSetup(fakeProvider(importOrder));

    // getByTestId, а не getByRole('status'): экран уже несёт role="status" у сводки блокировки
    // расчёта в шапке (всегда — черновик стартует с незаполненной строкой) и у пустого
    // live-региона результата расчёта — простое findByRole('status') неоднозначно уже без нашей
    // заметки. Роль всё равно проверяем явно атрибутом ниже.
    const notice = await screen.findByTestId('import-failure-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('ERPNext');
  });

  it('тело без кода даёт общую заметку с номером заказа', async () => {
    // Неизвестный заказ сейчас приходит дефолтной 500 Fastify, где поля code нет вовсе
    // (LKWkalk-w0k). Общая ветка — не подстраховка, а самый частый случай: опечатка в номере.
    globalThis.history.replaceState(null, '', '/?order=SO-9999');
    const importOrder = vi.fn().mockRejectedValue({ statusCode: 500, message: 'boom' });

    renderSetup(fakeProvider(importOrder));

    const notice = await screen.findByTestId('import-failure-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('SO-9999');
  });

  it('заметку можно закрыть', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-9999');
    const importOrder = vi.fn().mockRejectedValue({ statusCode: 500 });

    renderSetup(fakeProvider(importOrder));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Hinweis schließen' }));

    // queryByTestId, а не queryByRole('status') — см. комментарий выше: экран несёт и другие
    // role="status" регионы (шапка, live-регион результата), не связанные с заметкой импорта.
    expect(screen.queryByTestId('import-failure-notice')).not.toBeInTheDocument();
  });
});
