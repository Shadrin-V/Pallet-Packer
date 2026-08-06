import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { OrderZone } from '@shadrin-v/contracts';
import { LocaleProvider } from '../i18n/LocaleContext';
import { DataProviderProvider } from '../data/DataProviderContext';
import type { DataProvider } from '../data/DataProvider';
import { SetupScreen } from './SetupScreen';
import { SETUP_STORAGE_KEY, emptyOrder, type OrderState } from './setup/setupState';

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

  it('импортирует заказ из ?order=, добавляет его к черновику и вычищает параметр', async () => {
    globalThis.history.replaceState(null, '', '/?order=SO-1234');
    const importOrder = vi.fn().mockResolvedValue(ZONE);

    renderSetup(fakeProvider(importOrder));

    await waitFor(() => expect(screen.getByDisplayValue('SO-1234')).toBeInTheDocument());
    // Черновик ДОПОЛНЕН, а не заменён: стартовый SO-1 на месте.
    expect(screen.getByDisplayValue('SO-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Einwegpalette')).toBeInTheDocument();
    expect(importOrder).toHaveBeenCalledTimes(1);
    expect(importOrder).toHaveBeenCalledWith('SO-1234');
    expect(globalThis.location.search).toBe('');
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
  });
});
