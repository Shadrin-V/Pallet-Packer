import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

// Переключатели стратегии живут на ОБОИХ экранах: одно состояние, два места правки (5nb этап 2,
// решение владельца 3). Запрос без области видимости находит две кнопки с одним именем, поэтому
// каждый тест обязан сказать, чей переключатель он имеет в виду.
const planActions = () => within(screen.getByTestId('ladeplan-actions'));
const setupHeader = () => within(screen.getByTestId('setup-header'));

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

  it('defaults the loading-mode switch to combined and recomputes+persists on change', async () => {
    render(<App />);
    await calculate();

    // Default strategy is combined → "Automatisch" is the pressed option.
    expect(planActions().getByRole('button', { name: 'Hinten und Seite' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(planActions().getByRole('button', { name: 'Von hinten' }));

    // The recomputed plan is persisted with the chosen loadingMode (layout is derived, not stored).
    const persisted = JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}');
    expect(persisted.loadingMode).toBe('rear');
    expect(planActions().getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
    // …и шапка «Настройки» показывает ту же стратегию: значение одно на два экрана (5nb этап 2)
    expect(setupHeader().getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('order-grouping toggle defaults off (strict) and recomputes+persists densityFirst on change', async () => {
    render(<App />);
    await calculate();

    // Перезапрос на каждом шаге: пересчёт перерисовывает панель действий, и удержанная ссылка на
    // узел устарела бы.
    const toggle = () => planActions().getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement;
    expect(toggle().checked).toBe(false); // strict by default

    await userEvent.click(toggle());
    expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').orderGrouping).toBe('densityFirst');

    await userEvent.click(toggle());
    expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').orderGrouping).toBe('strict');
  });

  it('persists a stable orderId→colour map so the plan matches Setup after a reload (QA #2)', async () => {
    render(<App />);
    await calculate();
    // the default single order SO-1 gets palette slot 0; the map is persisted alongside the plan
    expect(JSON.parse(localStorage.getItem('ladungsplaner.orderColors') ?? '{}')).toEqual({ 'SO-1': 0 });
  });

  it('clicking the order-grouping info hint does not toggle the strategy', async () => {
    render(<App />);
    await calculate();

    // The hint's "i" button shares the aria-label but is a button, not the checkbox.
    await userEvent.click(planActions().getByRole('button', { name: 'Dichte vor Auftragstrennung' }));
    expect((planActions().getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement).checked).toBe(false);
  });

  // Стратегия расчёта — одно состояние на два экрана (5nb этап 2, решение владельца 3). До первого
  // расчёта её вообще негде было выбрать: переключатели жили только на готовом ладеплане.
  describe('стратегия — одно состояние на «Настройку» и ладеплан (5nb этап 2)', () => {
    it('режим погрузки, выбранный в шапке «Настройки», уходит в расчёт', async () => {
      render(<App />);
      await userEvent.click(setupHeader().getByRole('button', { name: 'Von hinten' }));
      // плана ещё нет — выбор ничего не пересчитывает, а просто ждёт «Berechnen»
      expect(screen.getByTestId('empty-plan')).toBeInTheDocument();

      await calculate();

      expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').loadingMode).toBe('rear');
      // на ладеплане отмечен тот же режим — значение одно на оба экрана
      expect(planActions().getByRole('button', { name: 'Von hinten', pressed: true })).toBeInTheDocument();
    });

    it('галочка «Плотность важнее группировки» из шапки тоже доезжает до расчёта', async () => {
      render(<App />);
      await userEvent.click(setupHeader().getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }));

      await calculate();

      expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').orderGrouping).toBe('densityFirst');
      expect(
        (planActions().getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement).checked,
      ).toBe(true);
    });
  });

  describe('strategy is preserved across a Setup recompute (4bj.12)', () => {
    it('keeps the chosen loadingMode when Berechnen is pressed again from Setup', async () => {
      render(<App />);
      await calculate();
      await userEvent.click(planActions().getByRole('button', { name: 'Von hinten' })); // pick rear

      // Edit the setup and recompute — the strategy must survive.
      const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
      await userEvent.clear(orderId);
      await userEvent.type(orderId, 'SO-7');
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

      expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').loadingMode).toBe('rear');
      expect(planActions().getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps the chosen orderGrouping when Berechnen is pressed again from Setup', async () => {
      render(<App />);
      await calculate();
      await userEvent.click(planActions().getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' })); // densityFirst

      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

      expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').orderGrouping).toBe('densityFirst');
      expect((planActions().getByRole('checkbox', { name: 'Dichte vor Auftragstrennung' }) as HTMLInputElement).checked).toBe(true);
    });

    it('Demo pins the rear strategy explicitly to showcase fork access (4bj.13)', async () => {
      render(<App />);
      await calculate();
      // combined is the current default; Demo overrides it to rear (not inherited from prior state).
      expect(planActions().getByRole('button', { name: 'Hinten und Seite' })).toHaveAttribute('aria-pressed', 'true');

      await userEvent.click(screen.getByRole('button', { name: 'Demo' }));

      // The strategy is reflected in the (in-memory) Ladeplan; Demo is transient so it is not
      // persisted (see the demo-transience tests). Placement of the two-sided position is guarded
      // in data/demo.test.ts against the engine directly.
      expect(planActions().getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
      // Стратегия того, что реально посчиталось, становится текущей и в шапке «Настройки» —
      // иначе один и тот же параметр показывался бы на двух экранах по-разному (5nb этап 2).
      expect(setupHeader().getByRole('button', { name: 'Von hinten' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('Reset clears the strategy so the next plan is fresh combined', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<App />);
      await calculate();
      await userEvent.click(planActions().getByRole('button', { name: 'Von hinten' })); // rear

      await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
      // Сброс очистил и заявку, поэтому габариты вводятся заново — иначе «Berechnen» уведёт к
      // ошибочной строке вместо расчёта (§6).
      await calculate();

      expect(JSON.parse(localStorage.getItem('ladungsplaner.load') ?? '{}').loadingMode ?? 'combined').toBe('combined');
      expect(planActions().getByRole('button', { name: 'Hinten und Seite' })).toHaveAttribute('aria-pressed', 'true');
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

    it('toggling a strategy on the Demo preview keeps it transient (does not persist) (QA)', async () => {
      render(<App />);
      await calculate();
      const loadBefore = localStorage.getItem('ladungsplaner.load');

      await userEvent.click(screen.getByRole('button', { name: 'Demo' })); // transient preview (rear)
      await userEvent.click(planActions().getByRole('button', { name: 'Hinten und Seite' })); // change strategy on it

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
});
