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

/** Header's "Berechnen" — index [0] of the two identical buttons since Task 7 added a second one
 *  next to the plan (below the last order in Setup). None of the tests in this file care WHICH
 *  button is pressed — both call the same handleCalculate — so they consistently pick the header
 *  one instead of the now-ambiguous `getByRole`. */
const berechnenHeader = () => screen.getAllByRole('button', { name: 'Berechnen' })[0];

/** Заполнить заявку и посчитать — типовое начало почти каждого теста этого файла. */
async function calculate() {
  fillDims();
  await userEvent.click(berechnenHeader());
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
    expect(screen.queryByRole('group', { name: 'Draufsicht' })).not.toBeInTheDocument();
  });

  it('replaces the empty state with the plan once computed, and offers no "Zurück"', async () => {
    render(<App />);
    await calculate();

    expect(screen.getByRole('group', { name: 'Draufsicht' })).toBeInTheDocument();
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
    expect(screen.getByRole('group', { name: 'Draufsicht' })).toBeInTheDocument();
    // …and the Setup input is still there with its value (SetupScreen was not remounted).
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-42');
  });

  it('persists a stable orderId→colour map so the plan matches Setup after a reload (QA #2)', async () => {
    render(<App />);
    await calculate();
    // the default single order SO-1 gets palette slot 0; the map is persisted alongside the plan
    expect(JSON.parse(localStorage.getItem('ladungsplaner.orderColors') ?? '{}')).toEqual({ 'SO-1': 0 });
  });

  // LKWkalk-9tq: sticky прижимает элемент только в пределах РОДИТЕЛЯ. Пока шапка жила внутри
  // <main> экрана «Настройка», а план был соседом, прокрутка в ладеплан увозила её за экран
  // (Chrome, 1440×900: на 100% прокрутки header.top = −572,8, «Рассчитать» недоступен с 75%) —
  // вопреки спеке §6 «всегда на виду». Тест пришпиливает структурный инвариант, который и делает
  // sticky сквозным: у шапки и плана общий родитель-контейнер.
  describe('липкая шапка держится и над планом (9tq)', () => {
    const stickyHeader = () =>
      document.querySelector('.sticky.top-0') as HTMLElement | null;

    it('родитель липкой шапки содержит план (пустое состояние)', () => {
      render(<App />);
      const header = stickyHeader();
      expect(header).not.toBeNull();
      expect(header!.parentElement!.contains(screen.getByTestId('empty-plan'))).toBe(true);
    });

    it('родитель липкой шапки содержит план (посчитанный)', async () => {
      render(<App />);
      await calculate();
      const header = stickyHeader();
      expect(header).not.toBeNull();
      expect(header!.parentElement!.contains(document.querySelector('.plan-sheet')!)).toBe(true);
    });

    it('печать: setup скрыт, план — нет (print:hidden не накрывает план)', async () => {
      render(<App />);
      await calculate();
      const plan = document.querySelector('.plan-sheet') as HTMLElement;
      // Ни один предок плана не несёт print:hidden — иначе печать отдала бы пустую страницу.
      for (let el = plan.parentElement; el; el = el.parentElement) {
        expect(el.classList.contains('print:hidden')).toBe(false);
      }
      // А сама шапка настроек на печать не идёт.
      expect(stickyHeader()!.className).toContain('print:hidden');
    });
  });

  it('clicking the order-grouping info hint does not toggle the strategy', () => {
    render(<App />);
    // The hint's "i" button carries its own name since 2tp — it must never reach the checkbox.
    fireEvent.click(screen.getByRole('button', { name: 'Erklärung zur Auftragstrennung' }));
    expect((screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement).checked).toBe(false);
  });

  // Стратегия расчёта живёт в шапке «Настройки» и НИГДЕ БОЛЬШЕ (5nb этап 2, решения владельца 1 и
  // 2): с ладеплана переключатели убраны, а те, что остались, ничего не пересчитывают — они только
  // запоминают выбор для следующего «Рассчитать».
  describe('стратегия — только в шапке «Настройки» и только для следующего расчёта', () => {
    it('на ладеплане переключателей стратегии больше нет', async () => {
      render(<App />);
      await calculate();
      expect(screen.getByRole('group', { name: 'Draufsicht' })).toBeInTheDocument(); // план на экране
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

      await userEvent.click(berechnenHeader());

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
      await userEvent.click(berechnenHeader());
    }

    it('без ручных правок «Рассчитать» не спрашивает ничего', async () => {
      const confirm = vi.spyOn(window, 'confirm');
      await planWithEditableStack();
      await userEvent.click(berechnenHeader());
      expect(confirm).not.toHaveBeenCalled();
    });

    it('после ручной правки «Рассчитать» предупреждает и при отказе не считает', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      await planWithEditableStack();
      await editStackManually();

      fireEvent.change(screen.getAllByLabelText('Länge')[1], { target: { value: '900' } });
      await userEvent.click(berechnenHeader());

      expect(confirm).toHaveBeenCalledOnce();
      expect(persistedLoad().cargo[0].length).toBe(1200); // расчёта не было
    });

    it('после ручной правки «Рассчитать» считает, если пользователь согласился', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await planWithEditableStack();
      await editStackManually();

      fireEvent.change(screen.getAllByLabelText('Länge')[1], { target: { value: '900' } });
      await userEvent.click(berechnenHeader());

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
      await userEvent.click(berechnenHeader());

      expect(persistedLoad().loadingMode).toBe('rear');
      expect(screen.getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps the chosen orderGrouping when Berechnen is pressed again from Setup', async () => {
      render(<App />);
      await calculate();
      await userEvent.click(screen.getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })); // densityFirst

      await userEvent.click(berechnenHeader());

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

describe('предохранитель: раскладка с ошибками не становится планом', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Заявка с валидным кузовом, но пустым грузом → движок отвечает ERR_EMPTY_LOAD (validate.ts:74-76).
   *  Сюда, а не в шапку «Настройки», потому что проверяется граница App (сохранённый Load), а не
   *  экран: сам код ошибки для этого теста неважен — важно только то, что `layout.errors` непуст. */
  const brokenLoad = {
    vehicle: { id: 'v', name: 'LKW', length: 13600, width: 2450, height: 2450 },
    cargo: [],
    loadingMode: 'combined',
    orderGrouping: 'strict',
  };

  it('сохранённый Load с ошибками не восстанавливается: план пуст, ключи плана вычищены', () => {
    localStorage.setItem('ladungsplaner.load', JSON.stringify(brokenLoad));
    localStorage.setItem('ladungsplaner.orderColors', JSON.stringify({ 'SO-1': 0 }));
    localStorage.setItem('ladungsplaner.strategy', JSON.stringify({ loadingMode: 'rear' }));
    render(<App />);
    expect(screen.getByTestId('empty-plan')).toBeInTheDocument();
    expect(localStorage.getItem('ladungsplaner.load')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.orderColors')).toBeNull();
    // Негодный ПЛАН выброшен, но не работа пользователя: черновик «Настройки» и выбранная стратегия
    // к плану не относятся и обязаны пережить его отказ.
    expect(localStorage.getItem('ladungsplaner.strategy')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Von hinten', pressed: true })).toBeInTheDocument();
  });

  // Тест «результата нет» с чистого листа прошёл бы и при неверной очистке: начинаем с готового
  // плана и ручной правки, потому что отказ обязан быть атомарным — он ничего не разрушает.
  it('отказ не разрушает уже показанный план и ручные правки', async () => {
    // Ручная правка ниже поднимает hasManualEdits, и второй клик по «Berechnen» проходит через
    // отдельный гейт подтверждения SetupScreen (handleCalculate, discardEditsConfirm) ДО того, как
    // дойти до предохранителя App.onCalculate. Незамоканный window.confirm в jsdom — это
    // notImplementedMethod (возвращает undefined → трактуется как отказ пользователя), так что без
    // мока тест «проходит» вообще ничего не проверив: клик глотается чужим гейтом. Мокаем true —
    // тем же приёмом, что и соседние тесты этого файла (:208, :220) — чтобы клик действительно
    // дошёл до движка и до нашего предохранителя.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    // Menge=2, как в planWithEditableStack: editStackManually кликает по стопке «×2», а
    // одиночная позиция (Menge по умолчанию 1) такой стопки не даёт — обычный calculate() тут
    // недостаточен для сценария «есть, что редактировать».
    fillDims();
    fireEvent.change(screen.getAllByLabelText('Menge')[0], { target: { value: '2' } });
    await userEvent.click(berechnenHeader());
    await editStackManually();
    const before = screen.getByRole('group', { name: 'Draufsicht' }).innerHTML;

    // Ломаем заявку: обнуляем длину кузова в шапке — движок ответит ERR_INVALID_DIMENSION.
    fireEvent.change(screen.getAllByLabelText('Länge')[0], { target: { value: '0' } });
    await userEvent.click(berechnenHeader());

    expect(screen.getByRole('group', { name: 'Draufsicht' }).innerHTML).toBe(before);
    expect(screen.queryByTestId('empty-plan')).toBeNull();
  });
});
