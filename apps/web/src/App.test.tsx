import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

/** Габариты единственной позиции. С 5nb этапа 2 «Berechnen» не считает заявку с незаполненными
 *  размерами, а ведёт к первой ошибочной строке (спека §6), поэтому расчёту нужна пригодная к
 *  расчёту заявка. Индекс [1] — нулевые Länge/Breite/Höhe принадлежат кузову в липкой шапке.
 *  fireEvent, а не userEvent: это подготовка фикстуры, а не проверка ввода. */
function fillDims() {
  fireEvent.change(screen.getAllByLabelText('Länge')[1], { target: { value: '1200' } });
  fireEvent.change(screen.getAllByLabelText('Breite')[1], { target: { value: '800' } });
  fireEvent.change(screen.getAllByLabelText('Höhe')[1], { target: { value: '144' } });
}

/** Заполнить заявку и посчитать — типовое начало почти каждого теста этого файла. */
async function calculate() {
  fillDims();
  await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
}

/** Сделать ручную правку раскладки: выбрать стопку на виде сверху и повернуть её. Тот же приём, что
 *  в LadeplanScreen.test.tsx — единственный способ развести `edited` и `layout`. */
async function editStackManually() {
  await userEvent.click(screen.getAllByText('×2')[0]);
  await userEvent.click(screen.getByRole('button', { name: 'Stapel drehen' }));
}

const persistedLoad = () => JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}');

describe('App shell (single page)', () => {
  it('renders the Setup title', () => {
    render(<App />);
    expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent('Ladungsplaner');
  });

  // One page, not two: the plan section is part of the page from the start (rgv.2). Before the first
  // Berechnen it stands in as an empty state; "Zurück" is gone with the two-screen flow (rgv.1).
  it('shows the plan section as an empty state before the first Berechnen', () => {
    render(<App />);
    const empty = screen.getByTestId('empty-plan');
    expect(empty).toHaveTextContent('Ladeplan');
    expect(empty).toHaveTextContent(/Aufträge ausfüllen und «Berechnen» drücken/);
    expect(screen.queryByRole('img', { name: 'Draufsicht' })).not.toBeInTheDocument();
  });

  it('replaces the empty state with the plan once computed, and offers no "Zurück"', async () => {
    render(<App />);
    await calculate();

    expect(screen.getByRole('img', { name: 'Draufsicht' })).toBeInTheDocument();
    expect(screen.queryByTestId('empty-plan')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zurück' })).not.toBeInTheDocument();
  });

  it('keeps Setup mounted and preserves input after Berechnen (no reset)', async () => {
    render(<App />);
    const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
    await userEvent.clear(orderId);
    await userEvent.type(orderId, 'SO-42');
    await calculate();

    // Ladeplan result appears on the same page…
    expect(screen.getByRole('img', { name: 'Draufsicht' })).toBeInTheDocument();
    // …and the Setup input is still there with its value (SetupScreen was not remounted).
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-42');
  });

  it('persists a stable orderId→colour map so the plan matches Setup after a reload (QA #2)', async () => {
    render(<App />);
    await calculate();
    // the default single order SO-1 gets palette slot 0; the map is persisted alongside the plan
    expect(JSON.parse(localStorage.getItem('ladungsplaner.orderColors') ?? '{}')).toEqual({ 'SO-1': 0 });
  });

  it('clicking the order-grouping info hint does not toggle the strategy', () => {
    render(<App />);
    // The hint's "i" button shares the aria-label but is a button, not the checkbox.
    fireEvent.click(screen.getByRole('button', { name: 'Dichte vor Auftragstrennung' }));
    expect((screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement).checked).toBe(false);
  });

  // Стратегия расчёта живёт в шапке «Настройки» и НИГДЕ БОЛЬШЕ (5nb этап 2, решения владельца 1 и
  // 2): с ладеплана переключатели убраны, а те, что остались, ничего не пересчитывают — они только
  // запоминают выбор для следующего «Рассчитать».
  describe('стратегия — только в шапке «Настройки» и только для следующего расчёта', () => {
    it('на ладеплане переключателей стратегии больше нет', async () => {
      render(<App />);
      await calculate();
      expect(screen.getByRole('img', { name: 'Draufsicht' })).toBeInTheDocument(); // план на экране
      // ровно один комплект на всю страницу — тот, что в шапке «Настройки»
      expect(screen.getAllByRole('button', { name: 'Von hinten' })).toHaveLength(1);
      expect(screen.getAllByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })).toHaveLength(1);
      expect(screen.getAllByRole('group', { name: 'Belademodus' })).toHaveLength(1);
    });

    it('режим погрузки, выбранный до расчёта, уходит в расчёт', async () => {
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));
      // плана ещё нет — выбор ничего не пересчитывает, а просто ждёт «Berechnen»
      expect(screen.getByTestId('empty-plan')).toBeInTheDocument();

      await calculate();

      expect(persistedLoad().loadingMode).toBe('rear');
      expect(screen.getByRole('button', { name: 'Von hinten', pressed: true })).toBeInTheDocument();
    });

    it('галочка «Плотность важнее группировки» из шапки тоже доезжает до расчёта', async () => {
      render(<App />);
      await userEvent.click(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }));

      await calculate();

      expect(persistedLoad().orderGrouping).toBe('densityFirst');
      expect((screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement).checked).toBe(true);
    });

    // Решение владельца 1. Прежний общий обработчик пересчитывал готовый план из СТАРОГО
    // result.load: поправленная тем временем заявка в него не попадала, и план молча расходился с
    // тем, что показывает «Настройка».
    it('при существующем плане смена режима в шапке НЕ пересчитывает его — применяет следующий «Рассчитать»', async () => {
      render(<App />);
      await calculate();
      expect(persistedLoad().loadingMode).toBe('combined');

      // заявку правим ПОСЛЕ расчёта, затем меняем режим — пересчёта быть не должно
      fireEvent.change(screen.getAllByLabelText('Länge')[1], { target: { value: '900' } });
      await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));

      const stillOld = persistedLoad();
      expect(stillOld.loadingMode).toBe('combined'); // сохранённый план не тронут
      expect(stillOld.cargo[0].length).toBe(1200);

      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

      const fresh = persistedLoad();
      expect(fresh.loadingMode).toBe('rear'); // выбор применён…
      expect(fresh.cargo[0].length).toBe(900); // …вместе с новой заявкой, а не со старой
    });
  });

  // Раньше о потере ручных правок предупреждали переключатели стратегии на ладеплане
  // (withDiscardGuard). Они больше не пересчитывают, и единственное действие, которое строит
  // раскладку заново, — «Рассчитать»; защита переехала на него (5nb этап 2, решение владельца 2).
  describe('ручные правки раскладки и «Рассчитать»', () => {
    afterEach(() => vi.restoreAllMocks());

    /** План из двух стопок одного типа: «×2» на виде сверху — то, что можно выбрать и повернуть. */
    async function planWithEditableStack() {
      render(<App />);
      fillDims();
      fireEvent.change(screen.getAllByLabelText('Menge')[0], { target: { value: '2' } });
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
    }

    it('без ручных правок «Рассчитать» не спрашивает ничего', async () => {
      const confirm = vi.spyOn(window, 'confirm');
      await planWithEditableStack();
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
      expect(confirm).not.toHaveBeenCalled();
    });

    it('после ручной правки «Рассчитать» предупреждает и при отказе не считает', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      await planWithEditableStack();
      await editStackManually();

      fireEvent.change(screen.getAllByLabelText('Länge')[1], { target: { value: '900' } });
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

      expect(confirm).toHaveBeenCalledOnce();
      expect(persistedLoad().cargo[0].length).toBe(1200); // расчёта не было
    });

    it('после ручной правки «Рассчитать» считает, если пользователь согласился', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await planWithEditableStack();
      await editStackManually();

      fireEvent.change(screen.getAllByLabelText('Länge')[1], { target: { value: '900' } });
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

      expect(persistedLoad().cargo[0].length).toBe(900);
    });
  });

  describe('strategy is preserved across a Setup recompute (4bj.12)', () => {
    it('keeps the chosen loadingMode when Berechnen is pressed again from Setup', async () => {
      render(<App />);
      await calculate();
      await userEvent.click(screen.getByRole('button', { name: 'Von hinten' })); // pick rear

      // Edit the setup and recompute — the strategy must survive.
      const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
      await userEvent.clear(orderId);
      await userEvent.type(orderId, 'SO-7');
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

      expect(persistedLoad().loadingMode).toBe('rear');
      expect(screen.getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps the chosen orderGrouping when Berechnen is pressed again from Setup', async () => {
      render(<App />);
      await calculate();
      await userEvent.click(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })); // densityFirst

      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

      expect(persistedLoad().orderGrouping).toBe('densityFirst');
      expect((screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement).checked).toBe(true);
    });

    it('Demo pins the rear strategy explicitly to showcase fork access (4bj.13)', async () => {
      render(<App />);
      await calculate();
      // combined is the current default; Demo overrides it to rear (not inherited from prior state).
      expect(screen.getByRole('button', { name: 'Hinten und Seite' })).toHaveAttribute('aria-pressed', 'true');

      await userEvent.click(screen.getByRole('button', { name: 'Demo' }));

      // Demo is transient so it is not persisted (see the demo-transience tests); placement of the
      // two-sided position is guarded in data/demo.test.ts against the engine directly. Проверяем
      // переключатель в шапке «Настройки» — единственный на странице (5nb этап 2): стратегия того,
      // что реально посчиталось, становится текущей, иначе он врал бы о показанном плане.
      expect(screen.getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('Reset clears the strategy so the next plan is fresh combined', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<App />);
      await calculate();
      await userEvent.click(screen.getByRole('button', { name: 'Von hinten' })); // rear

      await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
      // Сброс очистил и заявку, поэтому габариты вводятся заново — иначе «Berechnen» уведёт к
      // ошибочной строке вместо расчёта (§6).
      await calculate();

      expect(persistedLoad().loadingMode ?? 'combined').toBe('combined');
      expect(screen.getByRole('button', { name: 'Hinten und Seite' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('Demo is a transient preview — it does not overwrite the persisted setup or plan (QA)', async () => {
      render(<App />);
      const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
      await userEvent.clear(orderId);
      await userEvent.type(orderId, 'SO-42');
      await calculate();

      const setupBefore = localStorage.getItem('ladungsplaner.setup');
      const loadBefore = localStorage.getItem('ladungsplaner.load');

      await userEvent.click(screen.getByRole('button', { name: 'Demo' }));
      // demo is shown in the UI…
      expect((screen.getAllByLabelText('Auftrags-ID')[0] as HTMLInputElement).value).toBe('SO-1001');
      // …but nothing demo-related was persisted (transient preview)
      expect(localStorage.getItem('ladungsplaner.setup')).toBe(setupBefore);
      expect(localStorage.getItem('ladungsplaner.load')).toBe(loadBefore);
    });

    // Прежде переключатель стратегии пересчитывал Demo-превью, и тест сторожил, чтобы пересчёт не
    // сделал превью сохраняемым. Пересчёта больше нет (решение владельца 1) — сторожим то же
    // свойство на том, что осталось: превью показано, переключатель тронут, хранилище не тронуто.
    it('смена стратегии при показанном Demo-превью ничего не пересчитывает и не сохраняет (QA)', async () => {
      render(<App />);
      await calculate();
      const loadBefore = localStorage.getItem('ladungsplaner.load');

      await userEvent.click(screen.getByRole('button', { name: 'Demo' })); // transient preview (rear)
      await userEvent.click(screen.getByRole('button', { name: 'Hinten und Seite' })); // change strategy on it

      // still a preview → the persisted plan must be untouched
      expect(localStorage.getItem('ladungsplaner.load')).toBe(loadBefore);
    });

    it('a reload after Demo returns to the pre-demo state, not the demo (QA)', async () => {
      const { unmount } = render(<App />);
      const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
      await userEvent.clear(orderId);
      await userEvent.type(orderId, 'SO-42');
      await calculate();
      await userEvent.click(screen.getByRole('button', { name: 'Demo' }));
      unmount();

      render(<App />);
      expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-42');
    });
  });

  // Финальное ревью этапа 2, находка I4: черновик заявки перезагрузку переживал, а выбранная в шапке
  // стратегия — нет. До этой ветки дыры не было: стратегию выбирали только на готовом плане, и она
  // жила внутри сохранённого Load; с переездом выбора в шапку «до расчёта» ей понадобился свой ключ.
  describe('выбранная стратегия переживает перезагрузку', () => {
    it('режим погрузки, выбранный без единого расчёта, восстанавливается', async () => {
      const { unmount } = render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Von der Seite' }));
      unmount();

      render(<App />);
      expect(screen.getByRole('button', { name: 'Von der Seite' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('галочка «Плотность важнее группировки» тоже', async () => {
      const { unmount } = render(<App />);
      await userEvent.click(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }));
      unmount();

      render(<App />);
      expect(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })).toBeChecked();
    });

    it('стратегия Demo-превью не сохраняется — превью не переживает перезагрузку целиком', async () => {
      const { unmount } = render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Demo' })); // пришпиливает rear
      expect(screen.getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
      unmount();

      render(<App />);
      expect(screen.getByRole('button', { name: 'Hinten und Seite' })).toHaveAttribute('aria-pressed', 'true');
    });

    // LKWkalk-wmd: choose* сохранял СНИМОК обоих полей из текущего состояния, а состояние после
    // Demo показывает пришпиленную демо-стратегию (rear/strict) — не выбор пользователя. Щелчок по
    // одному переключателю утаскивал в хранилище и второе, демонстрационное поле. Сохраняться
    // должно только то поле, которое пользователь реально тронул.
    it('галочка группировки при показанном Demo не сохраняет демо-режим rear (wmd)', async () => {
      const { unmount } = render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Demo' })); // пришпиливает rear
      await userEvent.click(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }));
      unmount();

      render(<App />);
      // Галочка — выбор пользователя, переживает перезагрузку; rear пользователь не выбирал.
      expect(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Hinten und Seite' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('выбор режима после Demo не затирает сохранённую галочку демо-значением (wmd, симметрия)', async () => {
      const { unmount } = render(<App />);
      await userEvent.click(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }));
      await userEvent.click(screen.getByRole('button', { name: 'Demo' })); // пришпиливает strict — галочка гаснет
      await userEvent.click(screen.getByRole('button', { name: 'Von der Seite' }));
      unmount();

      render(<App />);
      expect(screen.getByRole('button', { name: 'Von der Seite' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })).toBeChecked();
    });

    it('«Сброс» забывает и сохранённую стратегию', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { unmount } = render(<App />);
      await userEvent.click(screen.getByRole('button', { name: 'Von der Seite' }));
      await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
      unmount();

      render(<App />);
      expect(screen.getByRole('button', { name: 'Hinten und Seite' })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
