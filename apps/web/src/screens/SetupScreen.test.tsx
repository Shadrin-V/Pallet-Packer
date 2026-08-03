import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../i18n/LocaleContext';
import { SetupScreen, keepsArmed, type OrderState, type PositionState, type SetupScreenProps } from './SetupScreen';
import { emptyPosition } from './setup/setupState';
import { VEHICLE_PRESETS } from '../data/presets';
import { DataProviderProvider } from '../data/DataProviderContext';
import type { DataProvider } from '../data/DataProvider';
import type { Article, ArticleInput } from '@shadrin-v/contracts';

// Заглушки снимаются ЗДЕСЬ, а не в конце тела теста (LKWkalk-3c5). Тесты узкого экрана подменяют
// `matchMedia`, и когда такой тест падал по таймауту (флейк LKWkalk-bmi), строка снятия в конце тела
// не выполнялась: заглушка «узкого экрана» переживала тест и валила каскадом все последующие широкие
// — одно настоящее падение превращалось в горсть ложных, и гейт врал о причине.
afterEach(() => {
  vi.unstubAllGlobals();
});


/** Стратегия расчёта — проп сверху (5nb этап 2): экран её только показывает и меняет колбэком,
 *  владеет ею App. `opts` перекрывает любой проп, чтобы тесту не приходилось расширять хелпер
 *  каждый раз, когда нужен ещё один вход. */
function renderSetup(
  onCalculate: (l: Load) => void,
  onReset?: () => void,
  opts: Partial<SetupScreenProps> = {},
) {
  return render(
    <LocaleProvider initial="de">
      <SetupScreen
        onCalculate={onCalculate}
        onReset={onReset}
        loadingMode="combined"
        orderGrouping="strict"
        onLoadingModeChange={() => {}}
        onOrderGroupingChange={() => {}}
        {...opts}
      />
    </LocaleProvider>,
  );
}

/** Позиция с валидными габаритами: с 5nb этапа 2 «Berechnen» не считает заявку с незаполненными
 *  размерами (§6 — это ошибка, а не мелочь), поэтому фикстура по умолчанию расчётопригодна, а
 *  дефект тест вносит точечно. */
const position = (p: Partial<PositionState> = {}): PositionState => ({
  ...emptyPosition(),
  name: 'EPAL 1',
  length: 1200,
  width: 800,
  height: 144,
  quantity: 10,
  ...p,
});

const order = (orderId: string, positions: PositionState[]): OrderState => ({
  key: `key-${orderId}`,
  orderId,
  colorIndex: 0,
  positions,
});

/** Заполнить габариты i-й позиции экрана (0-based). Индекс +1, потому что нулевые Länge/Breite/Höhe
 *  принадлежат кузову в шапке. fireEvent, а не userEvent: это подготовка фикстуры, а не проверка
 *  ввода, и лишние сотни синтетических нажатий только кормят известный флейк (LKWkalk-bmi). */
function fillDims(i = 0, dims: { l: string; w: string; h: string } = { l: '1200', w: '800', h: '144' }) {
  fireEvent.change(screen.getAllByLabelText('Länge')[i + 1], { target: { value: dims.l } });
  fireEvent.change(screen.getAllByLabelText('Breite')[i + 1], { target: { value: dims.w } });
  fireEvent.change(screen.getAllByLabelText('Höhe')[i + 1], { target: { value: dims.h } });
}

/** The header's "Berechnen" — index [0] of the two now-identical buttons (Task 7 adds a second one
 *  next to the plan, below the last order). None of these existing tests care WHICH button is
 *  pressed — both call the same handleCalculate — so they consistently pick the header one instead
 *  of the now-ambiguous `getByRole`. The bottom button (index [1]) has its own dedicated tests. */
const berechnenHeader = () => screen.getAllByRole('button', { name: 'Berechnen' })[0];

const ERP_ARTICLE: Article = {
  itemCode: 'ABB101',
  name: 'Einwegpalette 600x800',
  length: 800,
  width: 600,
  height: 144,
  nestStepPairwise: 22,
  rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly', maxTiers: 5 },
  source: 'erp',
  erpFields: ['length', 'width', 'height'],
  updatedAt: 'x',
};

function renderSetupWithCatalogue(dpOverrides: Partial<DataProvider> = {}) {
  // Full Article shape (not a loose cast): saveArticle's caller now binds the row to whatever this
  // resolves with (Finding 1), so a fixture missing e.g. `erpFields` would crash that code path.
  const upsertArticle = vi.fn(
    async (a: ArticleInput) => ({ ...a, source: 'local' as const, erpFields: [], updatedAt: 'x' }) satisfies Article,
  );
  const dp = { searchArticles: async () => [ERP_ARTICLE], upsertArticle, ...dpOverrides } as unknown as DataProvider;
  render(
    <LocaleProvider initial="de">
      <DataProviderProvider value={dp}>
        <SetupScreen
          onCalculate={() => {}}
          loadingMode="combined"
          orderGrouping="strict"
          onLoadingModeChange={() => {}}
          onOrderGroupingChange={() => {}}
        />
      </DataProviderProvider>
    </LocaleProvider>,
  );
  return { upsertArticle };
}

describe('SetupScreen', () => {
  it('renders the localized title and a default vehicle + order', () => {
    renderSetup(() => {});
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ladungsplaner');
    // default preset vehicle dimensions present (LKW Standard; vehicle "Länge" is the first field)
    expect((screen.getAllByLabelText('Länge')[0] as HTMLInputElement).value).toBe('13600');
    // one order id seeded
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-1');
  });

  it('builds a Load with the order zone and calls onCalculate', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    fillDims(); // §6: без габаритов «Berechnen» ведёт к ошибке вместо расчёта
    await userEvent.click(berechnenHeader());

    expect(onCalculate).toHaveBeenCalledTimes(1);
    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.vehicle.name).toBe('LKW Standard');
    expect(load.cargo).toHaveLength(1);
    expect(load.cargo[0].orderId).toBe('SO-1');
    expect(load.cargo[0].state).toBe('entschachtelt');
  });

  it('defaults orientation to free (no fork constraint) and hides the fork-axis control', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]); // orientation now lives in the rules panel
    expect((screen.getByLabelText('Ausrichtung') as HTMLSelectElement).value).toBe('free');
    expect(screen.queryByLabelText('Gabelzufahrt')).not.toBeInTheDocument();
  });

  it('a two-sided orientation sets forkAccess/forkAxis on the built Load (ADR 018)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]); // orientation lives in the rules panel
    await userEvent.selectOptions(screen.getByLabelText('Ausrichtung'), 'twoSided');
    // the fork-entry axis control now appears. getByRole, not getByLabelText: the panel wraps the
    // select and its InfoHint under one <label>, which makes dom-testing-library's label-text
    // heuristic match both — getByRole resolves the select's own accessible name unambiguously.
    expect(screen.getByRole('combobox', { name: 'Gabelzufahrt' })).toBeInTheDocument();
    fillDims();
    await userEvent.click(berechnenHeader());

    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    expect(load.cargo[0].forkAccess).toBe('twoSides');
    expect(load.cargo[0].forkAxis).toBe('length');
    expect(load.cargo[0].rotation).toBe('yawOnly');
  });

  it('shows a hint on the two-sided orientation about rear/side loading (4bj.13)', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]); // orientation lives in the rules panel
    // no hint while the orientation is the default "free"
    expect(screen.queryByRole('button', { name: 'Nur 2 Seiten' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Ausrichtung'), 'twoSided');
    // the info button appears next to the two-sided controls; its tooltip explains the constraint
    await userEvent.click(screen.getByRole('button', { name: 'Nur 2 Seiten' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/hinten/i);
  });

  // Раньше этот тест фиксировал `anyInvalid`: кнопка гасла. По §6 она больше не гаснет никогда —
  // погашенная кнопка не фокусируется и не объявляется скринридером, то есть прячет и причину, и
  // адрес ошибки. Осталось то же требование «с плохим Δh не считаем», но выраженное новым способом.
  it('Verschachtelt without a valid Δh no longer disables Berechnen — the press leads to the row', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    fillDims(); // габариты в порядке, единственная ошибка — шаг вложения
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]); // nesting rules live in the panel
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    const berechnen = berechnenHeader();
    expect(berechnen).toBeEnabled();
    await userEvent.click(berechnen);
    expect(onCalculate).not.toHaveBeenCalled();
  });

  it('Verschachtelt with a valid Δh emits nesting and enables Berechnen', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    // nesting rules live in the panel now — select the row first (there is no more auto-expanding
    // accordion to do it for us).
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await userEvent.type(screen.getByLabelText('Höhenzuwachs je Palette (Δh)'), '22');
    fillDims();
    const berechnen = berechnenHeader();
    expect(berechnen).toBeEnabled();
    await userEvent.click(berechnen);

    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.cargo[0].state).toBe('verschachtelt');
    expect(load.cargo[0].nesting).toMatchObject({ nestable: true, stepHeight: 22, nestingMode: 'pairwise' });
  });

  it('keeps a separate constructive step per nesting mode (pairwise ≠ sequential)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    // select the row → the rules panel opens; switch it to verschachtelt → the step field appears
    const STEP = 'Höhenzuwachs je Palette (Δh)';
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await userEvent.type(screen.getByLabelText(STEP), '22'); // pairwise is the default mode
    await userEvent.selectOptions(screen.getByLabelText('Verschachtelungsmodus'), 'sequential');
    // the sequential step is its own field and starts empty, it does not inherit 22
    expect((screen.getByLabelText(STEP) as HTMLInputElement).value).toBe('');
    await userEvent.type(screen.getByLabelText(STEP), '30');
    await userEvent.selectOptions(screen.getByLabelText('Verschachtelungsmodus'), 'pairwise');
    expect((screen.getByLabelText(STEP) as HTMLInputElement).value).toBe('22');

    fillDims(); // включая Höhe 144 — иначе заявка без габаритов не считается вовсе (§6)
    await userEvent.click(berechnenHeader());
    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    // the engine still receives a single stepHeight — the one matching the selected mode
    expect(load.cargo[0].nesting).toMatchObject({ nestable: true, stepHeight: 22, nestingMode: 'pairwise' });
  });

  it('defaults the nesting mode to pairwise once Ver is selected in the panel (E5)', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]); // select the row to open the panel
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect((screen.getByLabelText('Verschachtelungsmodus') as HTMLSelectElement).value).toBe('pairwise');
    // pairwise step-height label is shown (Höhe der oberen Bretter), and the allow-unpaired toggle appears
    expect(screen.getByText('Höhe der oberen Bretter (h_d)')).toBeInTheDocument();
    expect(screen.getByText('Einzelne Palette oben zulassen')).toBeInTheDocument();
  });

  it('adding a position keeps the panel on the selected row and still triggers the button (T1)', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]); // select the row, open the panel
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(screen.getByLabelText('Verschachtelungsmodus')).toBeInTheDocument();
    // Ladungsart (preset select) is gone (rgv.8) — the article combobox is the row's identity control.
    expect(screen.getAllByRole('combobox', { name: 'Artikel' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /Position hinzufügen/ }));

    // there is no accordion any more to collapse — the panel stays on the selected position…
    expect(screen.getByLabelText('Verschachtelungsmodus')).toBeInTheDocument();
    // …and the add button's click was not swallowed: a position was actually added
    expect(screen.getAllByRole('combobox', { name: 'Artikel' })).toHaveLength(2);
  });

  it('reveals the Stapelbar hint tooltip on demand (E1)', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    // the info button carries the Stapelbar label; there are two such elements (field + info) → pick the button
    await userEvent.click(screen.getByRole('button', { name: 'Stapelbar' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Ebenen/);
  });

  it('applies an EPAL pallet preset to the position dimensions (built-in suggestion, no provider needed)', async () => {
    // The built-in PALLET_PRESETS still surface through the combobox as 'standard' suggestions —
    // this works even with no DataProvider in the tree (renderSetup has none), same guarantee the
    // old Ladungsart select gave.
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'EPAL 2');
    await userEvent.click(await screen.findByRole('option', { name: /EPAL 2/ }));
    await userEvent.click(berechnenHeader());

    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.cargo[0]).toMatchObject({ length: 1200, width: 1000, height: 162 });
  });

  it('persists the setup across a remount (no reset on refresh, #4)', async () => {
    const { unmount } = renderSetup(() => {});
    const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
    await userEvent.clear(orderId);
    await userEvent.type(orderId, 'SO-99');
    unmount();
    renderSetup(() => {});
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-99');
  });

  it('migrates a draft saved before the two constructive steps existed (legacy stepHeight)', async () => {
    // A draft persisted by an older build: one PositionState.stepHeight, no nestStepPairwise/Sequential.
    const legacyPosition = {
      id: 'p1',
      name: 'EPAL 1',
      length: 1200,
      width: 800,
      height: 144,
      quantity: 10,
      state: 'verschachtelt',
      rotation: 'yawOnly',
      forkAxis: 'length',
      stepHeight: 22,
      nestingMode: 'pairwise',
      maxNested: '',
      allowUnpairedTop: false,
      maxTiers: '',
    };
    globalThis.localStorage.setItem(
      'ladungsplaner.setup',
      JSON.stringify({
        vehicle: { id: 'v1', name: 'LKW Standard', length: 13600, width: 2480, height: 2700 },
        orders: [{ key: 'o1', orderId: 'SO-1', colorIndex: 0, positions: [legacyPosition] }],
      }),
    );

    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    // the legacy number reappears in the field the current mode (pairwise) reads from — not lost
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-1');
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    expect((screen.getByLabelText('Höhenzuwachs je Palette (Δh)') as HTMLInputElement).value).toBe('22');

    await userEvent.click(berechnenHeader());
    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    expect(load.cargo[0].nesting).toMatchObject({ nestable: true, stepHeight: 22, nestingMode: 'pairwise' });
  });

  // Finding 4: the migration above only ever exercised nestingMode 'pairwise'. The same legacy
  // draft can equally have been left in 'sequential' mode; the migration must route stepHeight
  // into nestStepSequential in that case, not silently drop it.
  it('migrates a draft saved before the two constructive steps existed (legacy stepHeight, sequential mode)', async () => {
    const legacyPosition = {
      id: 'p1',
      name: 'EPAL 1',
      length: 1200,
      width: 800,
      height: 144,
      quantity: 10,
      state: 'verschachtelt',
      rotation: 'yawOnly',
      forkAxis: 'length',
      stepHeight: 30,
      nestingMode: 'sequential',
      maxNested: '',
      allowUnpairedTop: false,
      maxTiers: '',
    };
    globalThis.localStorage.setItem(
      'ladungsplaner.setup',
      JSON.stringify({
        vehicle: { id: 'v1', name: 'LKW Standard', length: 13600, width: 2480, height: 2700 },
        orders: [{ key: 'o1', orderId: 'SO-1', colorIndex: 0, positions: [legacyPosition] }],
      }),
    );

    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-1');
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    expect((screen.getByLabelText('Höhenzuwachs je Palette (Δh)') as HTMLInputElement).value).toBe('30');

    await userEvent.click(berechnenHeader());
    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    expect(load.cargo[0].nesting).toMatchObject({ nestable: true, stepHeight: 30, nestingMode: 'sequential' });
  });

  it('Demo fills a multi-order plan and computes it immediately (T3)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.click(screen.getByRole('button', { name: 'Demo' }));

    // form filled: 4 demo orders, several positions
    const orderIds = (screen.getAllByLabelText('Auftrags-ID') as HTMLInputElement[]).map((i) => i.value);
    expect(orderIds).toEqual(['SO-1001', 'SO-1002', 'SO-1003', 'SO-1004']);
    expect(screen.getAllByRole('combobox', { name: 'Artikel' }).length).toBeGreaterThan(4);

    // and computed straight away, exercising the whole feature set
    expect(onCalculate).toHaveBeenCalledTimes(1);
    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.vehicle.name).toBe('LKW Standard');
    expect(new Set(load.cargo.map((c) => c.orderId)).size).toBe(4);
    expect(load.cargo.some((c) => c.state === 'verschachtelt')).toBe(true);
    expect(load.cargo.some((c) => c.state === 'entschachtelt')).toBe(true);
    expect(load.cargo.some((c) => c.nesting.nestingMode === 'sequential')).toBe(true);
    expect(load.cargo.some((c) => c.nesting.nestingMode === 'pairwise')).toBe(true);
    // 'full' is gone from the UI (Sonderpalette is now plain yawOnly); demo shows the two-sided
    // fork-access case instead (4bj.13).
    expect(new Set(load.cargo.map((c) => c.rotation))).toEqual(new Set(['yawOnly', 'none']));
    expect(load.cargo.some((c) => c.forkAccess === 'twoSides')).toBe(true);
    expect(load.cargo.some((c) => c.stacking.maxTiers === 6)).toBe(true);
  });

  // Demo is a carousel of three showcases walked in a FIXED order (rgv.5), and it lives in the
  // Orders header next to "+ Auftrag", not beside the destructive Reset (rgv.4).
  it('cycles through the three demo variants and wraps around', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    const demo = screen.getByRole('button', { name: 'Demo' });

    const firstOrderIds = async () => {
      await userEvent.click(demo);
      const load = onCalculate.mock.calls.at(-1)![0] as Load;
      return [...new Set(load.cargo.map((c) => c.orderId))].join(',');
    };

    const first = await firstOrderIds();
    const second = await firstOrderIds();
    const third = await firstOrderIds();
    const fourth = await firstOrderIds();

    expect(new Set([first, second, third]).size).toBe(3); // three distinct showcases
    expect(fourth).toBe(first); // …and back to the start
  });

  it('names the loaded demo variant, and drops the caption once the user edits', async () => {
    renderSetup(vi.fn());
    await userEvent.click(screen.getByRole('button', { name: 'Demo' }));
    expect(screen.getByTestId('demo-caption')).toHaveTextContent('Demo 1/3: Gemischte Aufträge');

    const orderId = screen.getAllByLabelText('Auftrags-ID')[0] as HTMLInputElement;
    await userEvent.type(orderId, 'X');
    expect(screen.queryByTestId('demo-caption')).not.toBeInTheDocument();
  });

  it('reset clears the setup back to defaults (#4)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onReset = vi.fn();
    renderSetup(() => {}, onReset);
    const orderId = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
    await userEvent.clear(orderId);
    await userEvent.type(orderId, 'SO-77');
    await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect((screen.getByLabelText('Auftrags-ID') as HTMLInputElement).value).toBe('SO-1');
    expect(onReset).toHaveBeenCalled();
  });

  describe('reordering the order queue (4bj.11)', () => {
    /** Add a second order so there are two cards (SO-1, SO-2) to reorder. */
    async function twoOrders() {
      const onCalculate = vi.fn();
      renderSetup(onCalculate);
      await userEvent.click(screen.getAllByRole('button', { name: /Auftrag hinzufügen/ })[0]);
      return onCalculate;
    }

    it('a single order shows no move controls (nothing to reorder)', () => {
      renderSetup(() => {});
      expect(screen.queryAllByRole('button', { name: 'Auftrag nach oben' })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: 'Auftrag nach unten' })).toHaveLength(0);
    });

    it('moving the first order down swaps it with the second (list order = cargo priority)', async () => {
      const onCalculate = await twoOrders();
      // move SO-1 down
      await userEvent.click(screen.getAllByRole('button', { name: 'Auftrag nach unten' })[0]);

      expect((screen.getAllByLabelText('Auftrags-ID') as HTMLInputElement[]).map((i) => i.value)).toEqual(
        ['SO-2', 'SO-1'],
      );
      fillDims(0);
      fillDims(1);
      await userEvent.click(berechnenHeader());
      const load = onCalculate.mock.calls.at(-1)![0] as Load;
      expect([...new Set(load.cargo.map((c) => c.orderId))]).toEqual(['SO-2', 'SO-1']);
    });

    it('moving the second order up swaps it with the first', async () => {
      await twoOrders();
      await userEvent.click(screen.getAllByRole('button', { name: 'Auftrag nach oben' })[1]);
      expect((screen.getAllByLabelText('Auftrags-ID') as HTMLInputElement[]).map((i) => i.value)).toEqual(
        ['SO-2', 'SO-1'],
      );
    });

    it('an order keeps its colour when reordered (QA: move must be visible)', async () => {
      renderSetup(() => {});
      // three orders: SO-1, SO-2, SO-3 → colour series 1, 2, 3
      await userEvent.click(screen.getAllByRole('button', { name: /Auftrag hinzufügen/ })[0]);
      await userEvent.click(screen.getAllByRole('button', { name: /Auftrag hinzufügen/ })[0]);
      const colourOf = (orderId: string) => {
        const input = (screen.getAllByLabelText('Auftrags-ID') as HTMLInputElement[]).find((i) => i.value === orderId)!;
        return input.closest('section')!.getAttribute('style') ?? '';
      };
      expect(colourOf('SO-2')).toContain('--s2');
      // move SO-2 up to the first slot; its colour must stay --s2 (bound to the order, not the row)
      await userEvent.click(screen.getAllByRole('button', { name: 'Auftrag nach oben' })[1]);
      expect((screen.getAllByLabelText('Auftrags-ID') as HTMLInputElement[]).map((i) => i.value)).toEqual(['SO-2', 'SO-1', 'SO-3']);
      expect(colourOf('SO-2')).toContain('--s2');
    });

    it('disables up on the first order and down on the last', async () => {
      await twoOrders();
      const up = screen.getAllByRole('button', { name: 'Auftrag nach oben' });
      const down = screen.getAllByRole('button', { name: 'Auftrag nach unten' });
      expect(up[0]).toBeDisabled();
      expect(up[1]).toBeEnabled();
      expect(down[0]).toBeEnabled();
      expect(down[1]).toBeDisabled();
    });
  });

  it('adds a second order zone (add-order action is duplicated top + bottom, E10)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    const addButtons = screen.getAllByRole('button', { name: /Auftrag hinzufügen/ });
    expect(addButtons.length).toBe(2); // top bar + below the last order
    await userEvent.click(addButtons[1]); // the bottom duplicate
    fillDims(0);
    fillDims(1);
    await userEvent.click(berechnenHeader());

    const load = onCalculate.mock.calls[0][0] as Load;
    const orderIds = [...new Set(load.cargo.map((c) => c.orderId))];
    expect(orderIds).toEqual(['SO-1', 'SO-2']);
  });
});

// Master-detail (LKWkalk-5nb, Task 5): the rules panel is a persistent selection, not a per-row
// accordion. Selecting a row's chip shows its rules in the panel; the selection is view state only
// (not part of the persisted draft) and tolerates pointing at a row that no longer exists.
describe('SetupScreen — rules panel selection (5nb)', () => {
  it('opens the rules panel for the position whose chip was pressed', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    expect(screen.getByText('So wird gerechnet')).toBeInTheDocument();
  });

  // Review finding (Task 5, round 2): the original version of this test only had ONE position row
  // in scope (the fixture's default), so `getAllByLabelText('Länge')[1]` — meant to be "some OTHER
  // row" — was actually the very row the chip had just selected. The assertion still caught "typing
  // closes the panel", but never exercised the scenario the name promises: the selection surviving
  // an edit made to a DIFFERENT row. Naming the first row makes its identity in the panel checkable,
  // so editing the second row can be proven not to have moved the selection.
  it('keeps the panel on the selected position while another row is edited', async () => {
    renderSetup(() => {});
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'Erste');
    await userEvent.click(screen.getByRole('button', { name: /Position hinzufügen/ })); // a second row to edit instead
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]); // select the FIRST row
    // getAllByLabelText('Länge')[2]: [0] vehicle bar, [1] first position, [2] second position — the
    // one NOT selected.
    await userEvent.type(screen.getAllByLabelText('Länge')[2], '1200');
    expect(screen.getByText('So wird gerechnet')).toBeInTheDocument();
    // the panel still names the FIRST row, not the second one that was just edited
    expect(screen.getByText('Erste')).toBeInTheDocument();
  });

  it('does not persist the selection across a remount', async () => {
    const { unmount } = renderSetup(() => {});
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    unmount();
    renderSetup(() => {});
    // Пустое состояние панели — теперь сводка загрузки (§6), а не прежняя заглушка «выберите
    // позицию»: панель никогда не пустует. Признак «ничего не выбрано» — отсутствие разбора.
    expect(screen.getByText('Ladung')).toBeInTheDocument();
    expect(screen.queryByText('So wird gerechnet')).toBeNull();
  });
});

// Шапка, сводка и новое поведение «Рассчитать» (LKWkalk-5nb этап 2, спека §6). Кнопка больше не
// гаснет: при ошибке нажатие не считает, а ведёт к первой ошибочной строке — причина и адрес
// перестают быть невидимыми.
describe('SetupScreen — «Рассчитать» и сводка (5nb этап 2)', () => {
  it('«Рассчитать» не гаснет при ошибке, а выбирает первую ошибочную позицию', async () => {
    const onCalculate = vi.fn();
    // verschachtelt без шага вложения — ошибка stepInvalid; габариты при этом в порядке
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', name: 'EPAL 1', state: 'verschachtelt' })])],
    });
    const calc = berechnenHeader();
    expect(calc).toBeEnabled();
    await userEvent.click(calc);

    expect(onCalculate).not.toHaveBeenCalled();
    // панель разбора открылась именно на этой строке (в широком режиме это <aside>, а не диалог —
    // отсюда проверка по содержимому панели, а не по роли)
    expect(await screen.findByText('So wird gerechnet')).toBeInTheDocument();
    expect(screen.getByLabelText('Artikel')).toHaveValue('EPAL 1');
    // …и фокус уехал в первое поле строки. waitFor: фокус ставится в requestAnimationFrame.
    await waitFor(() => expect(screen.getByLabelText('Artikel')).toHaveFocus());
  });

  it('«Рассчитать» ведёт к ПЕРВОЙ ошибочной строке, а не к любой', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialOrders: [
        order('SO-1001', [
          position({ id: 'p1', name: 'Heil' }),
          position({ id: 'p2', name: 'Kaputt', width: '' }),
          position({ id: 'p3', name: 'Auch kaputt', height: '' }),
        ]),
      ],
    });
    await userEvent.click(berechnenHeader());
    expect(await screen.findByText('So wird gerechnet')).toBeInTheDocument();
    // Панель называет разбираемую строку текстом (имена строк живут в input.value, не в тексте),
    // поэтому getByText однозначно указывает на выбранную: вторая, первая ошибочная, — не третья.
    expect(screen.getByText('Kaputt')).toBeInTheDocument();
    expect(screen.queryByText('Auch kaputt')).toBeNull();
  });

  it('без ошибок «Рассчитать» считает', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
    });
    await userEvent.click(berechnenHeader());
    expect(onCalculate).toHaveBeenCalledOnce();
  });

  it('предупреждение расчёт не блокирует', async () => {
    const onCalculate = vi.fn();
    // количество 0 — законный способ временно исключить позицию, а не ошибка (§6)
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', quantity: 0 })])],
    });
    await userEvent.click(berechnenHeader());
    expect(onCalculate).toHaveBeenCalledOnce();
  });

  it('клик по сообщению в сводке открывает его строку', async () => {
    renderSetup(() => {}, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', name: 'EPAL 1', width: '' })])],
    });
    await userEvent.click(screen.getByRole('button', { name: /EPAL 1.*Maße unvollständig/ }));
    expect(screen.getByLabelText('Artikel')).toHaveValue('EPAL 1');
    expect(screen.getByText('So wird gerechnet')).toBeInTheDocument();
  });

  it('сводка в пустом состоянии панели считает заказы, позиции и единицы', () => {
    renderSetup(() => {}, undefined, {
      initialOrders: [
        order('SO-1001', [position({ id: 'p1', quantity: 10 }), position({ id: 'p2', quantity: 5 })]),
      ],
    });
    // 1 заказ · 2 позиции · 15 единиц — панель без выбора занята делом, а не заглушкой
    const summary = screen.getByText('Ladung').closest('aside')!;
    expect(within(summary).getByText('2')).toBeInTheDocument();
    expect(within(summary).getByText('15')).toBeInTheDocument();
    expect(within(summary).getByText('Alles bereit zur Berechnung.')).toBeInTheDocument();
  });

  it('кладёт выбранную стратегию в Load явно, а не оставляет её прежнему плану', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
      loadingMode: 'rear',
      orderGrouping: 'densityFirst',
    });
    await userEvent.click(berechnenHeader());
    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    expect(load.loadingMode).toBe('rear');
    expect(load.orderGrouping).toBe('densityFirst');
  });

  // Ревью Задачи 5: `onVehicleChange` шапки можно было заменить на пустышку, и все 99 тестов
  // проходили — правка кузова не была покрыта ничем. Кузов задаёт весь расчёт, так что путь
  // «поле в шапке → состояние экрана → Load и сохранённый черновик» обязан быть прибит.
  it('правка габаритов кузова в шапке доезжает до Load и до черновика', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
    });
    // [0] — поле кузова в шапке; [1] и дальше принадлежат строкам позиций
    fireEvent.change(screen.getAllByLabelText('Länge')[0], { target: { value: '7200' } });
    fireEvent.change(screen.getAllByLabelText('Höhe')[0], { target: { value: '2600' } });
    await userEvent.click(berechnenHeader());

    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    expect(load.vehicle.length).toBe(7200);
    expect(load.vehicle.height).toBe(2600);
    const saved = JSON.parse(globalThis.localStorage.getItem('ladungsplaner.setup') ?? '{}');
    expect(saved.vehicle).toMatchObject({ length: 7200, height: 2600 });
  });

  it('смена пресета кузова в шапке заменяет габариты целиком', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
    });
    await userEvent.selectOptions(screen.getByLabelText('Fahrzeug'), 'Wechselbrücke');
    await userEvent.click(berechnenHeader());

    const preset = VEHICLE_PRESETS.find((p) => p.name === 'Wechselbrücke')!;
    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    expect(load.vehicle).toMatchObject({ name: preset.name, length: preset.length, width: preset.width, height: preset.height });
  });

  // Защита от потери ручных правок раскладки переехала сюда с переключателей ладеплана: они больше
  // ничего не пересчитывают, а «Рассчитать» строит план с нуля (5nb этап 2, решение владельца 2).
  it('«Рассчитать» предупреждает о потере ручных правок раскладки и при отказе не считает', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
      hasManualEdits: true,
    });
    await userEvent.click(berechnenHeader());
    expect(confirm).toHaveBeenCalledOnce();
    expect(onCalculate).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('без ручных правок «Рассчитать» ни о чём не спрашивает', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onCalculate = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
    });
    await userEvent.click(berechnenHeader());
    expect(confirm).not.toHaveBeenCalled();
    expect(onCalculate).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('переключатели стратегии в шапке зовут колбэк, а не считают', async () => {
    const onCalculate = vi.fn();
    const onLoadingModeChange = vi.fn();
    renderSetup(onCalculate, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
      onLoadingModeChange,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Von hinten' }));
    expect(onLoadingModeChange).toHaveBeenCalledWith('rear');
    expect(onCalculate).not.toHaveBeenCalled();
  });

  // Task 7 (owner complaint): the header's "Berechnen" is sticky, so it is still on screen after a
  // press — but the plan it produces renders far below the fold, off screen, and nothing visible
  // happens where the user is looking. A second, identical primary button sits right above the plan
  // (below the last order) so the result appears next to the action that produced it. This is not
  // the duplication oversight it looks like: the button used to live exactly here, was moved into
  // the header (§6, "under six orders you had to scroll a long way to reach it"), and is back now
  // for the opposite reason. The two solve different problems — reachability vs. proximity to the
  // result — so removing either one reintroduces the complaint the other was added to fix.
  describe('вторая кнопка «Рассчитать» рядом с планом (Task 7)', () => {
    it('кнопок расчёта две — в шапке и под последним заказом', () => {
      renderSetup(() => {});
      expect(screen.getAllByRole('button', { name: 'Berechnen' })).toHaveLength(2);
    });

    it('нижняя кнопка считает так же, как верхняя', async () => {
      const onCalculate = vi.fn();
      renderSetup(onCalculate, undefined, {
        initialOrders: [order('SO-1001', [position({ id: 'p1' })])],
      });
      // [0] — шапка, [1] — новая, под последним заказом; обе зовут один и тот же handleCalculate.
      const [, bottom] = screen.getAllByRole('button', { name: 'Berechnen' });
      await userEvent.click(bottom);
      expect(onCalculate).toHaveBeenCalledTimes(1);
    });

    it('итог расчёта объявляется вслух', async () => {
      renderSetup(() => {}, undefined, {
        initialOrders: [order('SO-1001', [position({ id: 'p1', quantity: 10 })])],
      });
      // Пусто до первого расчёта — иначе живая область объявила бы результат, которого ещё нет.
      expect(screen.getByTestId('calc-announce')).toHaveTextContent('');
      const [, bottom] = screen.getAllByRole('button', { name: 'Berechnen' });
      await userEvent.click(bottom);
      expect(screen.getByTestId('calc-announce')).toHaveTextContent(/\d+/);
    });

    it('«Рассчитать» с ошибкой ведёт к строке, а не объявляет мнимый результат', async () => {
      // Та же фикстура, что и у «выбирает первую ошибочную позицию» выше: verschachtelt без шага —
      // stepInvalid, габариты в порядке. Нажатие не считает вовсе (goTo), поэтому объявлять здесь
      // нечего — announce должен остаться пустым, а не показать цифры несостоявшегося расчёта.
      renderSetup(() => {}, undefined, {
        initialOrders: [order('SO-1001', [position({ id: 'p1', name: 'EPAL 1', state: 'verschachtelt' })])],
      });
      const [, bottom] = screen.getAllByRole('button', { name: 'Berechnen' });
      await userEvent.click(bottom);
      expect(screen.getByTestId('calc-announce')).toHaveTextContent('');
    });
  });
});

describe('SetupScreen article combobox', () => {
  it('has no preset dropdown and no separate name field any more (rgv.8)', () => {
    renderSetup(() => {});
    expect(screen.queryByLabelText('Ladungsart')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Artikel' })).toBeInTheDocument();
  });

  it('picking an article fills dimensions, both steps and the rules', async () => {
    renderSetupWithCatalogue();
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    await userEvent.click(await screen.findByRole('option', { name: /ABB101/ }));
    expect((screen.getAllByLabelText('Länge')[1] as HTMLInputElement).value).toBe('800');
    expect((screen.getAllByLabelText('Höhe')[1] as HTMLInputElement).value).toBe('144');
    // rules came along: the row switched to verschachtelt and carries the pairwise step
    expect((screen.getByLabelText('Höhenzuwachs je Palette (Δh)') as HTMLInputElement).value).toBe('22');
  });

  it('dimensions that came from ERP are read-only, ones ERPNext never supplied stay editable', async () => {
    // ERPNext supplied length+width only; height is blank over there, so it must stay editable
    renderSetupWithCatalogue({
      searchArticles: async () => [{ ...ERP_ARTICLE, height: undefined, erpFields: ['length', 'width'] }],
    } as Partial<DataProvider>);
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    await userEvent.click(await screen.findByRole('option', { name: /ABB101/ }));
    expect(screen.getAllByLabelText('Länge')[1]).toHaveAttribute('readonly');
    expect(screen.getAllByLabelText('Höhe')[1]).not.toHaveAttribute('readonly');
  });

  // Finding 2: the inverse of the read-only test above. The whole branch is about not freezing a
  // user's own value, but nothing pinned that typing over a *picked* ERP article releases the
  // fields it locked. Production code already does this (ArticleCombobox's onChange clears
  // articleCode + locked) — this test only makes sure it stays true.
  it('typing over a picked ERP article clears the binding and every lock (inverse of the read-only test)', async () => {
    renderSetupWithCatalogue();
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    await userEvent.click(await screen.findByRole('option', { name: /ABB101/ }));
    // sanity: picking ABB101 did lock length/width/height (erpFields on the fixture)
    expect(screen.getAllByLabelText('Länge')[1]).toHaveAttribute('readonly');
    expect(screen.getAllByLabelText('Breite')[1]).toHaveAttribute('readonly');
    expect(screen.getAllByLabelText('Höhe')[1]).toHaveAttribute('readonly');
    // the row is bound, so the panel button already reads "update"
    expect(screen.getByRole('button', { name: 'Artikel aktualisieren' })).toBeInTheDocument();

    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), ' X');

    expect(screen.getAllByLabelText('Länge')[1]).not.toHaveAttribute('readonly');
    expect(screen.getAllByLabelText('Breite')[1]).not.toHaveAttribute('readonly');
    expect(screen.getAllByLabelText('Höhe')[1]).not.toHaveAttribute('readonly');
    // unbound: the button falls back to "save", not "update"
    expect(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' })).toBeInTheDocument();
  });

  it('saves a typed-in article to the catalogue', async () => {
    const { upsertArticle } = renderSetupWithCatalogue({ searchArticles: async () => [] } as Partial<DataProvider>);
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'NEU-1');
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
    await userEvent.type(screen.getAllByLabelText('Breite')[1], '800');
    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' }));
    expect(upsertArticle).toHaveBeenCalledWith(
      expect.objectContaining({ itemCode: 'NEU-1', length: 1200, width: 800, height: 144 }),
    );
  });

  // Finding 1: a successful save used to discard the Article the server returned, so the row's
  // articleCode was never set and the button kept reading "save" instead of "update" — a spec
  // deviation (§ "Кнопка «Сохранить артикул в базу»"). The row must bind to the save response.
  it('binds the row to the saved article: the button flips from "save" to "update" (Finding 1)', async () => {
    const savedArticle: Article = {
      itemCode: 'NEU-1',
      name: 'NEU-1',
      length: 1200,
      width: 800,
      height: 144,
      rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
      source: 'local',
      updatedAt: 'x',
      erpFields: [],
    };
    const upsertArticle = vi.fn(async () => savedArticle);
    renderSetupWithCatalogue({ searchArticles: async () => [], upsertArticle } as Partial<DataProvider>);
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'NEU-1');
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
    await userEvent.type(screen.getAllByLabelText('Breite')[1], '800');
    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    expect(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' }));

    expect(await screen.findByRole('button', { name: 'Artikel aktualisieren' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Artikel in die Datenbank speichern' })).not.toBeInTheDocument();
  });

  it('does NOT flip the button label when the save rejects (Finding 1, negative case)', async () => {
    const upsertArticle = vi.fn(async () => {
      throw new Error('network down');
    });
    renderSetupWithCatalogue({ searchArticles: async () => [], upsertArticle } as Partial<DataProvider>);
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'NEU-1');
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
    await userEvent.type(screen.getAllByLabelText('Breite')[1], '800');
    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);

    await userEvent.click(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' }));

    expect(await screen.findByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Artikel aktualisieren' })).not.toBeInTheDocument();
  });

  // Finding 3: подсказка у запертого поля называет артикул («меняется в ERPNext, артикул такой-то»).
  it('the locked-field hint names the bound article (Finding 3)', async () => {
    renderSetupWithCatalogue();
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    await userEvent.click(await screen.findByRole('option', { name: /ABB101/ }));

    await userEvent.click(screen.getAllByRole('button', { name: 'Erklärung zur Artikelbindung' })[0]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('ABB101');
  });

  // Finding 3: «активна при введённом артикуле и заполненных габаритах» — present, disabled, not
  // conditionally hidden.
  it('the save button is always present in the details panel, disabled until article + dimensions are complete (Finding 3)', async () => {
    renderSetupWithCatalogue({ searchArticles: async () => [] } as Partial<DataProvider>);
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);

    const saveButton = () => screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' });
    expect(saveButton()).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'NEU-1');
    expect(saveButton()).toBeDisabled(); // dimensions still missing

    await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
    await userEvent.type(screen.getAllByLabelText('Breite')[1], '800');
    expect(saveButton()).toBeDisabled(); // height still missing

    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    expect(saveButton()).toBeEnabled();
  });

  it('a row without a picked article still computes (free text, manual dimensions)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'Sonderkiste');
    fillDims(0, { l: '500', w: '400', h: '300' });
    await userEvent.click(berechnenHeader());
    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    expect(load.cargo[0].name).toBe('Sonderkiste');
  });

  // Finding 1: a rejected upsertArticle used to escape as an unhandled rejection with no user
  // feedback — the button looked like it worked. The call site that owns the panel's UI state must
  // catch it and show a message there.
  it('shows a localized error next to the save button when saving fails, with no unhandled rejection', async () => {
    const rejections: unknown[] = [];
    const onRejection = (err: unknown) => rejections.push(err);
    process.on('unhandledRejection', onRejection);
    try {
      const upsertArticle = vi.fn(async () => {
        throw new Error('network down');
      });
      renderSetupWithCatalogue({ searchArticles: async () => [], upsertArticle } as Partial<DataProvider>);
      await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'NEU-1');
      await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
      await userEvent.type(screen.getAllByLabelText('Breite')[1], '800');
      await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
      await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
      await userEvent.click(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' }));

      expect(await screen.findByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).toBeInTheDocument();
      // give a straggling unhandled rejection a tick to surface before asserting none did
      await new Promise((r) => setTimeout(r, 0));
      expect(rejections).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });

  it('clears a stale save error once a later save succeeds, and a successful save shows no message', async () => {
    const savedArticle: Article = {
      itemCode: 'NEU-1',
      name: 'NEU-1',
      length: 1200,
      width: 800,
      height: 144,
      rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
      source: 'local',
      updatedAt: 'x',
      erpFields: [],
    };
    const upsertArticle = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(savedArticle);
    renderSetupWithCatalogue({ searchArticles: async () => [], upsertArticle } as Partial<DataProvider>);
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'NEU-1');
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
    await userEvent.type(screen.getAllByLabelText('Breite')[1], '800');
    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);

    const saveButton = () => screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' });
    await userEvent.click(saveButton());
    expect(await screen.findByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).toBeInTheDocument();

    await userEvent.click(saveButton());
    expect(screen.queryByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).not.toBeInTheDocument();
  });

  // Review finding (Task 5, round 2): RulesPanel owns `saveError` in its own component state, but
  // the screen now renders a SINGLE panel instance that never unmounts across a selection change —
  // unlike the old per-row accordion, which died with the row it belonged to. Without a reset, a
  // failed save on row A leaves its error message hanging under row B's save button once the user
  // selects B, even though B was never saved. Only a later SUCCESSFUL save cleared it, which
  // instead misdescribes it as the correct row's own submission.
  it('does not leak a stale save error from one row into the panel of another (Task 5 review)', async () => {
    const upsertArticle = vi.fn(async () => {
      throw new Error('network down');
    });
    renderSetupWithCatalogue({ searchArticles: async () => [], upsertArticle } as Partial<DataProvider>);
    await userEvent.click(screen.getByRole('button', { name: /Position hinzufügen/ })); // a second row to select

    // fail a save on the FIRST row
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    await userEvent.type(screen.getAllByRole('combobox', { name: 'Artikel' })[0], 'NEU-1');
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
    await userEvent.type(screen.getAllByLabelText('Breite')[1], '800');
    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    await userEvent.click(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' }));
    expect(await screen.findByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).toBeInTheDocument();

    // select the SECOND row — its own save was never attempted, so its panel must be clean
    await userEvent.click(screen.getAllByTestId('rule-chip')[1]);
    expect(screen.queryByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).not.toBeInTheDocument();
  });

  // Finding 2: the feature's headline promise ("save an article, see it offered as a suggestion in
  // another row") had no coverage at any layer once the preset tests were deleted. A stateful fake
  // DataProvider stands in for the server catalogue: upsertArticle stores, searchArticles reads back.
  it('a saved article is offered as a suggestion in a different row (headline promise)', async () => {
    const catalogue: Article[] = [];
    const dp: DataProvider = {
      searchArticles: async (query: string) => {
        const needle = query.trim().toLowerCase();
        return catalogue.filter(
          (a) => a.itemCode.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle),
        );
      },
      upsertArticle: async (a: ArticleInput) => {
        const saved: Article = { ...a, source: 'local', erpFields: [], updatedAt: 'x' };
        catalogue.push(saved);
        return saved;
      },
    } as unknown as DataProvider;

    render(
      <LocaleProvider initial="de">
        <DataProviderProvider value={dp}>
          <SetupScreen
            onCalculate={() => {}}
            loadingMode="combined"
            orderGrouping="strict"
            onLoadingModeChange={() => {}}
            onOrderGroupingChange={() => {}}
          />
        </DataProviderProvider>
      </LocaleProvider>,
    );

    // save an article on the first position row
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'NEU-42');
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
    await userEvent.type(screen.getAllByLabelText('Breite')[1], '800');
    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' }));

    // add a second position row and look the saved article up there
    await userEvent.click(screen.getByRole('button', { name: /Position hinzufügen/ }));
    const secondCombobox = screen.getAllByRole('combobox', { name: 'Artikel' })[1];
    await userEvent.type(secondCombobox, 'NEU-42');

    expect(await screen.findByRole('option', { name: /NEU-42/ })).toBeInTheDocument();
  });
});

// Removing a position / an order takes it out of THIS calculation only — the catalogue article in
// SQLite (and ERPNext) is untouched. Deletion is armed-confirm, not window.confirm (ADR 022).
describe('SetupScreen — removing from the calculation', () => {
  const trashes = () => screen.getAllByRole('button', { name: 'Position aus der Berechnung entfernen' });
  const orderTrashes = () => screen.getAllByRole('button', { name: 'Auftrag aus der Berechnung entfernen' });
  /** One combobox per position row — the row's identity control, so its count is the row count. */
  const rows = () => screen.getAllByRole('combobox', { name: 'Artikel' });
  const orderIds = () => screen.getAllByLabelText('Auftrags-ID');
  const addPosition = () => screen.getByRole('button', { name: /Position hinzufügen/ });
  const addOrder = () => screen.getAllByRole('button', { name: /Auftrag hinzufügen/ })[0];

  it('does NOT delete on the first press — that press only arms', async () => {
    renderSetup(() => {});
    await userEvent.click(addPosition());
    const before = rows().length;
    expect(before).toBe(2);

    await userEvent.click(trashes()[0]);

    expect(rows()).toHaveLength(before);
    expect(screen.getByRole('button', { name: 'Löschen bestätigen' })).toBeInTheDocument();
  });

  it('deletes on the second press', async () => {
    renderSetup(() => {});
    await userEvent.click(addPosition());
    const before = rows().length;

    await userEvent.click(trashes()[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(rows()).toHaveLength(before - 1);
  });

  it('arms exactly one button at a time', async () => {
    renderSetup(() => {});
    await userEvent.click(addPosition());

    await userEvent.click(trashes()[0]);
    // row 0's trash is now the armed button, so trashes()[0] is the SECOND row's
    await userEvent.click(trashes()[0]);

    expect(screen.getAllByRole('button', { name: 'Löschen bestätigen' })).toHaveLength(1);
  });

  it('disarms on Escape', async () => {
    renderSetup(() => {});
    await userEvent.click(addPosition());
    await userEvent.click(trashes()[0]);

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
    expect(rows()).toHaveLength(2); // …and disarming is not deleting
  });

  it('disarms on a click elsewhere', async () => {
    renderSetup(() => {});
    await userEvent.click(addPosition());
    await userEvent.click(trashes()[0]);

    await userEvent.click(screen.getAllByLabelText('Länge')[0]); // the vehicle length field

    expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
    expect(rows()).toHaveLength(2);
  });

  it('disarms itself after the timeout', async () => {
    // fireEvent, not userEvent: userEvent's internal awaits never settle under a frozen clock, so
    // its very first click hangs. fireEvent dispatches synchronously and still bubbles to document.
    // Only the two timer functions the arming effect uses are faked.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      renderSetup(() => {});
      fireEvent.click(addPosition());
      fireEvent.click(trashes()[0]);
      expect(screen.getByRole('button', { name: 'Löschen bestätigen' })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(4000);
      });

      expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
      expect(rows()).toHaveLength(2); // timing out is not deleting
    } finally {
      vi.useRealTimers();
    }
  });

  it('removing the last position takes the order with it — no empty order can exist', async () => {
    renderSetup(() => {});
    await userEvent.click(addOrder());
    expect(orderIds()).toHaveLength(2);

    // the second order has exactly one position
    const t = trashes();
    await userEvent.click(t[t.length - 1]);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(orderIds()).toHaveLength(1);
    expect((orderIds()[0] as HTMLInputElement).value).toBe('SO-1');
    expect(rows()).toHaveLength(1);
  });

  it('removing the last order leaves a fresh empty one — the screen is never empty', async () => {
    renderSetup(() => {});
    await userEvent.type(rows()[0], 'Sonderkiste');
    expect((rows()[0] as HTMLInputElement).value).toBe('Sonderkiste');

    await userEvent.click(orderTrashes()[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(orderIds()).toHaveLength(1);
    expect(rows()).toHaveLength(1);
    expect((rows()[0] as HTMLInputElement).value).toBe(''); // a fresh order, not the old one
  });

  // Finding 5 (final review wave): the confirm button ArmedDelete focused while armed unmounts the
  // instant it is clicked; without an explicit refocus, focus falls to <body> and a keyboard user
  // loses their place. An order delete always lands on "+ Auftrag hinzufügen" — it is the one
  // control guaranteed to survive that outcome. A position delete is more specific (LKWkalk-78x,
  // see the two tests below): it only falls back to "+ Auftrag hinzufügen" when the deleted
  // position was the order's last, taking the whole order with it; otherwise focus stays inside
  // the card, on a sibling row.
  it('after deleting a position focus lands on the next row of the same order', async () => {
    renderSetup(() => {});
    await userEvent.click(addPosition()); // a second position in SO-1

    const before = rows();
    await userEvent.click(trashes()[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(before[1]).toHaveFocus();
  });

  it('after deleting the LAST row of a multi-row order focus lands on the PREVIOUS row', async () => {
    renderSetup(() => {});
    await userEvent.click(addPosition());
    await userEvent.click(addPosition()); // three positions in SO-1

    const before = rows();
    await userEvent.click(trashes()[2]); // arm the third (last) row
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(before[1]).toHaveFocus(); // the second row — there is no "next" one to fall to
  });

  it('after deleting the last position of an order focus lands on "+ Auftrag hinzufügen"', async () => {
    renderSetup(() => {});
    // The default order has exactly one position — deleting it takes the whole order with it
    // (the untouchable cascade rule above), so no sibling row survives to receive focus.

    await userEvent.click(trashes()[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(addOrder()).toHaveFocus();
  });

  // The rules panel names a position by id (SetupScreen's `selection`), which is never persisted
  // and must never survive the row it names — a dangling selection would either crash the panel
  // or, worse, silently show stale rules for a row that no longer exists. The order itself must
  // stay put here (a second position survives), so this pins the case a cascade delete would mask:
  // the order KEEPS its key, only the selected row within it vanishes.
  it('clears the panel selection when the selected position is deleted, even though its order survives', async () => {
    renderSetup(() => {});
    await userEvent.click(addPosition()); // a second position in SO-1
    // Пустое состояние панели — сводка загрузки (§6); «So wird gerechnet» есть только при разборе.
    expect(screen.queryByText('So wird gerechnet')).toBeNull();

    await userEvent.click(screen.getAllByTestId('rule-chip')[1]); // select the SECOND row
    expect(screen.getByText('So wird gerechnet')).toBeInTheDocument();

    await userEvent.click(trashes()[1]); // delete that same (selected) row
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(screen.queryByText('So wird gerechnet')).toBeNull();
    expect(screen.getByText('Ladung')).toBeInTheDocument();
  });

  it('moves focus to "+ Auftrag hinzufügen" after confirming an order delete', async () => {
    renderSetup(() => {});
    await userEvent.click(addOrder());

    await userEvent.click(orderTrashes()[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));

    expect(addOrder()).toHaveFocus();
  });

  it('a surviving order keeps its colour slot when another order is removed', async () => {
    // buildOrderColors is rebuilt from the CURRENT list on every calculate, so a removed order
    // cannot leave an entry behind — and the survivor keeps the slot it was created with.
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.click(addOrder());

    await userEvent.click(orderTrashes()[0]); // remove the FIRST order (SO-1, slot 0)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));
    fillDims(0);
    await userEvent.click(berechnenHeader());

    expect(onCalculate.mock.calls.at(-1)?.[1]?.orderColors).toEqual({ 'SO-2': 1 });
  });

  // Finding 1: addOrder used to mint `SO-${os.length + 1}`, which is only collision-free while
  // orders can never be removed. Delete the first of two orders, then add — the freed number
  // ("2") must not be reused while SO-2 still exists, or the two orders collapse into one colour
  // and one legend row downstream (buildOrderColors keys by orderId).
  it('gives a new order an id distinct from every surviving order, even after deleting one (Finding 1)', async () => {
    renderSetup(() => {});
    await userEvent.click(addOrder()); // SO-1, SO-2

    await userEvent.click(orderTrashes()[0]); // delete SO-1 (the first)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }));
    expect((orderIds()[0] as HTMLInputElement).value).toBe('SO-2');

    await userEvent.click(addOrder());

    const ids = orderIds().map((el) => (el as HTMLInputElement).value);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2); // distinct — no collision with the surviving SO-2
  });

  // Finding 1 (wave 2): emptyOrder used to derive colorIndex from the SAME number nextOrderNumber
  // computed for the id — but nextOrderNumber only recognizes ids matching /^SO-(\d+)$/, so a
  // renamed order is invisible to it and its slot gets handed out again. `Auftrags-ID` is a freely
  // editable field whose whole purpose is to carry the real order number, so "rename the default
  // order, then add a second" is the ordinary first-use flow, not an edge case — pins the first row
  // of the reviewer's table (rename SO-1 → AB-4711, then add → colours must stay distinct).
  it('a newly added order gets a colour slot distinct from a renamed order (Finding 1 colour regression)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    const orderIdField = screen.getByLabelText('Auftrags-ID') as HTMLInputElement;
    await userEvent.clear(orderIdField);
    await userEvent.type(orderIdField, 'AB-4711');

    await userEvent.click(addOrder());
    fillDims(0);
    fillDims(1);
    await userEvent.click(berechnenHeader());

    const orderColors = onCalculate.mock.calls.at(-1)?.[1]?.orderColors as Record<string, number>;
    const values = Object.values(orderColors);
    expect(values).toHaveLength(2);
    expect(new Set(values).size).toBe(2); // distinct — no shared palette slot
  });

  // Finding 3 (wave 2): the shipped focus-fix test (ArmedDelete.test.tsx) only flips the `armed`
  // prop via `rerender` on the isolated component — a prop flip, not a real gesture. Arm the trash
  // button here by an actual KEYBOARD activation (Enter on the focused button, as a real user
  // would) on the live SetupScreen, and check focus lands on the confirm button that replaces it.
  // LKWkalk-yxn — the browser-only arming defect. In Chrome the click that arms a trash button has
  // the <svg> as its target; React 18 flushes discrete-event updates synchronously, so the trash and
  // its <svg> are already unmounted by the time the click reaches the document-level disarm
  // listener. `closest()` on a DETACHED node walks only its own orphan subtree, finds no
  // `[data-armed-delete]`, and the guard concludes "clicked outside" — the gesture that armed the
  // control disarmed it in the same breath, so it could never be armed at all outside jsdom (where
  // `act()` defers the re-render until after dispatch, hiding the race from every existing test).
  //
  // Reproduce the condition head-on: press a node that is attached at dispatch time and detach it
  // mid-dispatch (a capture-phase listener stands in for React's synchronous flush), leaving its
  // `[data-armed-delete]` wrapper in place exactly as React does. The armed control must survive.
  // A hand-built DOM stand-in, not the live row, so that nothing React owns is yanked out from
  // under it — the guard cannot tell the difference, only attachment matters.
  const pressAndDetachMidDispatch = (type: 'pointerDown' | 'click') => {
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-armed-delete', '');
    const button = document.createElement('button');
    const icon = document.createElement('span'); // stands in for the trash <svg>
    button.append(icon);
    wrapper.append(button);
    document.body.append(wrapper);
    const detach = () => button.remove(); // React swaps the wrapper's child, keeping the wrapper
    document.addEventListener(type === 'pointerDown' ? 'pointerdown' : 'click', detach, true);
    try {
      fireEvent[type](icon);
    } finally {
      document.removeEventListener(type === 'pointerDown' ? 'pointerdown' : 'click', detach, true);
      wrapper.remove();
    }
  };

  it.each(['pointerDown', 'click'] as const)(
    'stays armed when the %s that would disarm it has a target detached mid-dispatch (LKWkalk-yxn)',
    async (type) => {
      renderSetup(() => {});
      await userEvent.click(trashes()[0]);
      expect(screen.getByRole('button', { name: 'Löschen bestätigen' })).toBeInTheDocument();

      await act(async () => {
        pressAndDetachMidDispatch(type);
      });

      expect(screen.getByRole('button', { name: 'Löschen bestätigen' })).toBeInTheDocument();
    },
  );

  // …while a press on a node that really is outside still disarms — the detached-target exemption
  // must not turn the guard into "never disarm".
  it('a pointerdown outside the control still disarms it', async () => {
    renderSetup(() => {});
    await userEvent.click(trashes()[0]);

    await act(async () => {
      fireEvent.pointerDown(screen.getAllByLabelText('Länge')[0]);
    });

    expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
    expect(rows()).toHaveLength(1); // …and disarming is not deleting
  });

  it('arming a trash button by keyboard (Enter) moves focus to the confirm button', async () => {
    renderSetup(() => {});
    trashes()[0].focus();

    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Löschen bestätigen' })).toHaveFocus();
  });
});

// The guard is exported (rather than inline in the effect) so the detached-target rule can be
// stated once, plainly, next to the integration test above that exercises it through a real
// dispatch. Both layers matter: this one names the rule, that one proves it is wired up.
describe('keepsArmed — the disarm guard', () => {
  const build = () => {
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-armed-delete', '');
    const inner = document.createElement('span');
    wrapper.append(inner);
    document.body.append(wrapper);
    return { wrapper, inner };
  };

  it('keeps the control armed for a press inside an armed-delete wrapper', () => {
    const { wrapper, inner } = build();
    expect(keepsArmed(inner)).toBe(true);
    wrapper.remove();
  });

  it('lets a press on an unrelated attached element disarm', () => {
    const outside = document.createElement('div');
    document.body.append(outside);
    expect(keepsArmed(outside)).toBe(false);
    outside.remove();
  });

  it('keeps the control armed for a target detached mid-dispatch, where closest() goes blind', () => {
    const { wrapper, inner } = build();
    inner.remove(); // detached: closest() now walks an orphan subtree with no wrapper in it
    expect(inner.closest('[data-armed-delete]')).toBeNull(); // the trap the old guard fell into
    expect(keepsArmed(inner)).toBe(true);
    wrapper.remove();
  });

  it('keeps the control armed for a target that is not an Element (no closest) or is null', () => {
    expect(keepsArmed(null)).toBe(true);
    expect(keepsArmed(document)).toBe(true);
  });
});

describe('SetupScreen — the name belongs to ERPNext', () => {
  const ERP_NAMED = {
    itemCode: 'ABB101',
    name: 'Gitterbox',
    length: 1200,
    width: 800,
    height: 970,
    rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
    source: 'erp',
    updatedAt: '2026-07-21T00:00:00.000Z',
    erpFields: ['length', 'width', 'height', 'name'],
  } as const;

  // Finding 3 (final review wave): length/width/height each get an InfoHint next to the field the
  // moment they are locked; the name combobox got none — the only explanation was the
  // unboundFromErp notice, which only appears AFTER the user starts retyping, inside the collapsed
  // details panel. This pins the missing affordance: a hint next to the combobox itself, present as
  // soon as the row is bound, before any retyping.
  it('shows a lock hint next to the article combobox for an ERP-named article, and none for a local one', async () => {
    // erpFields: ['name'] only (no dimensions locked) isolates the name hint from the pre-existing
    // per-dimension hints — с 0il у всех хинтов привязки одно СВОЁ имя (article.lockedHintLabel),
    // и фикстура с запертыми габаритами дала бы пять кнопок вместо одной.
    const NAME_ONLY = { ...ERP_NAMED, erpFields: ['name'] as const };
    const LOCAL = { ...ERP_NAMED, itemCode: 'LOC1', name: 'Eigenbau', source: 'local', erpFields: [] } as const;
    renderSetupWithCatalogue({ searchArticles: vi.fn().mockResolvedValue([NAME_ONLY, LOCAL]) });

    const box = screen.getByLabelText('Artikel');
    await userEvent.type(box, 'ABB');
    await userEvent.click(await screen.findByText('Gitterbox'));
    expect(screen.getByRole('button', { name: 'Erklärung zur Artikelbindung' })).toBeInTheDocument(); // the hint toggle

    await userEvent.clear(box);
    await userEvent.type(box, 'Eig');
    await userEvent.click(await screen.findByText('Eigenbau'));
    expect(screen.queryByRole('button', { name: 'Erklärung zur Artikelbindung' })).toBeNull();
  });

  it('explains where the name is changed once the user edits it away from an ERP article', async () => {
    renderSetupWithCatalogue({ searchArticles: vi.fn().mockResolvedValue([ERP_NAMED]) });

    const box = screen.getByLabelText('Artikel');
    await userEvent.type(box, 'ABB');
    await userEvent.click(await screen.findByText('Gitterbox'));
    // The notice lives in the rules panel, next to the save button it explains the consequence of.
    // Picking a suggestion selects the row and opens the panel unconditionally (Task 5) — no extra
    // click needed, unlike the old per-row accordion that only auto-expanded for verschachtelt.
    await userEvent.type(box, ' NEU');

    expect(screen.getByText(/ERPNext/)).toBeInTheDocument();
  });

  it('says nothing for an article whose name ERPNext never supplied', async () => {
    const LOCAL = { ...ERP_NAMED, itemCode: 'LOC1', name: 'Eigenbau', source: 'local', erpFields: [] } as const;
    renderSetupWithCatalogue({ searchArticles: vi.fn().mockResolvedValue([LOCAL]) });

    const box = screen.getByLabelText('Artikel');
    await userEvent.type(box, 'Eig');
    await userEvent.click(await screen.findByText('Eigenbau'));
    // The notice lives in the rules panel, which picking a suggestion opens unconditionally
    // (Task 5) — the panel is already showing this row, so the assertion below is meaningful.
    await userEvent.type(box, ' 2');

    expect(screen.queryByText(/ERPNext/)).toBeNull();
  });

  it('still lets a brand-new local article be created from free text', async () => {
    const upsertArticle = vi.fn().mockImplementation(async (a) => ({ ...a, source: 'local', updatedAt: 'x', erpFields: [] }));
    renderSetupWithCatalogue({ upsertArticle, searchArticles: vi.fn().mockResolvedValue([]) });

    // getAllByLabelText, index [1]: the vehicle bar (index [0]) has its own Länge/Breite/Höhe
    // fields with the same aria-labels, same idiom as the other saveArticle tests in this file.
    await userEvent.type(screen.getByLabelText('Artikel'), 'Sonderpalette');
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '1340');
    await userEvent.type(screen.getAllByLabelText('Breite')[1], '890');
    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '178');
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]); // free text, not a pick — open the panel to reach Save
    await userEvent.click(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' }));

    expect(upsertArticle).toHaveBeenCalledOnce();
    expect(upsertArticle.mock.calls[0][0].itemCode).toBe('Sonderpalette');
  });

  it('picking a suggestion clears a previous ERPNext notice', async () => {
    const LOCAL = { ...ERP_NAMED, itemCode: 'LOC1', name: 'Eigenbau', source: 'local', erpFields: [] } as const;
    renderSetupWithCatalogue({ searchArticles: vi.fn().mockResolvedValue([ERP_NAMED, LOCAL]) });

    const box = screen.getByLabelText('Artikel');
    await userEvent.type(box, 'ABB');
    await userEvent.click(await screen.findByText('Gitterbox'));
    // Picking a suggestion selects the row and opens the panel unconditionally (Task 5) — the
    // notice (and its absence) is observable right away, no extra click needed.
    await userEvent.type(box, ' NEU');
    expect(screen.getByText(/ERPNext/)).toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, 'Eig');
    await userEvent.click(await screen.findByText('Eigenbau'));

    expect(screen.queryByText(/ERPNext/)).toBeNull();
  });

  it('keeps warning after retyping the exact ERP name back, so the row is not silently re-forked (Finding 2)', async () => {
    renderSetupWithCatalogue({ searchArticles: vi.fn().mockResolvedValue([ERP_NAMED]) });

    const box = screen.getByLabelText('Artikel');
    await userEvent.type(box, 'ABB');
    await userEvent.click(await screen.findByText('Gitterbox'));
    await userEvent.type(box, ' NEU');
    expect(screen.getByText(/ERPNext/)).toBeInTheDocument();

    // Retype the exact original ERP name. The row is STILL unbound from ERPNext — a Save here would
    // create a brand-new article reusing the ERP article's name — so the notice must not disappear
    // just because the text happens to match again.
    await userEvent.clear(box);
    await userEvent.type(box, 'Gitterbox');

    expect(screen.getByText(/ERPNext/)).toBeInTheDocument();
  });
});

describe('SetupScreen — narrow-screen drawer (5nb, Task 6)', () => {
  it('closes the narrow-screen drawer on Escape and returns focus to the chip', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));
    renderSetup(() => {});
    const chip = screen.getAllByTestId('rule-chip')[0];
    await userEvent.click(chip);
    expect(screen.getByRole('dialog', { name: 'Regeln' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chip).toHaveFocus();
  });

  it('an armed delete on another row wins the first Escape; the drawer only closes on the next one (Important review fix)', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));
    renderSetup(() => {});
    await userEvent.click(screen.getByRole('button', { name: /Position hinzufügen/ }));

    const chip = screen.getAllByTestId('rule-chip')[0];
    await userEvent.click(chip); // open the drawer for row 0

    // Arm row 1's delete while row 0's drawer is open — the drawer has no backdrop below xl, so
    // the list stays fully interactive underneath it.
    const trashes = screen.getAllByRole('button', { name: 'Position aus der Berechnung entfernen' });
    await userEvent.click(trashes[1]);
    expect(screen.getByRole('button', { name: 'Löschen bestätigen' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Regeln' })).toBeInTheDocument();

    // First Escape: cancels the armed delete (the more dangerous, more recent state) — the drawer
    // for row 0 must NOT also close from the same keypress.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Regeln' })).toBeInTheDocument();

    // Second Escape: nothing left armed, so now it closes the drawer and returns focus to the chip.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chip).toHaveFocus();
  });
});

// Находки финального ревью этапа 2 (5nb): у сводки не было поверхности на узком экране (I1), из
// панели правил не было выхода в широком (I2), а «Рассчитать» на телефоне ставил фокус ЗА
// полноэкранным drawer (I3). matchMedia в jsdom нет вовсе, поэтому по умолчанию useIsWide отвечает
// «широко» — узкий экран тесты подставляют сами.
describe('SetupScreen — сводка и выход из панели в обоих режимах (финальное ревью)', () => {
  const narrow = () =>
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));

  it('на узком экране сводка и предупреждения видны и без выбранной строки (I1)', () => {
    narrow();
    // Количество 0 — предупреждение: расчёт возможен, но позиция в него не войдёт (§6). Ниже 1280px
    // такому сообщению негде было показаться: колонка рендерилась только в широком режиме, drawer —
    // только при выбранной строке.
    renderSetup(() => {}, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', quantity: 0 })])],
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Ladung')).toBeInTheDocument();
    expect(screen.getByText(/Menge 0/)).toBeInTheDocument();
  });

  it('на узком экране сводка остаётся под списком и при открытом drawer — список не прыгает', async () => {
    narrow();
    renderSetup(() => {}, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', quantity: 0 })])],
    });
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    expect(screen.getByRole('dialog', { name: 'Regeln' })).toBeInTheDocument();
    expect(screen.getByText('Ladung')).toBeInTheDocument();
  });

  it('в широком режиме повторный клик по чипу закрывает разбор и возвращает сводку (I2)', async () => {
    renderSetup(() => {}, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', name: 'EPAL 1' })])],
    });
    const chip = screen.getAllByTestId('rule-chip')[0];
    await userEvent.click(chip);
    expect(screen.getByText('So wird gerechnet')).toBeInTheDocument();
    expect(screen.queryByText('Ladung')).toBeNull();

    await userEvent.click(chip);
    expect(screen.getByText('Ladung')).toBeInTheDocument();
    expect(screen.queryByText('So wird gerechnet')).toBeNull();
    expect(chip).toHaveFocus();
  });

  it('в широком режиме Esc тоже возвращает к сводке', async () => {
    renderSetup(() => {}, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', name: 'EPAL 1' })])],
    });
    const chip = screen.getAllByTestId('rule-chip')[0];
    await userEvent.click(chip);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('Ladung')).toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  it('взведённое удаление и в широком режиме забирает первый Esc себе', async () => {
    renderSetup(() => {}, undefined, {
      initialOrders: [
        order('SO-1001', [position({ id: 'p1', name: 'EPAL 1' }), position({ id: 'p2', name: 'EPAL 2' })]),
      ],
    });
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    const trashes = screen.getAllByRole('button', { name: 'Position aus der Berechnung entfernen' });
    await userEvent.click(trashes[1]);

    // Первый Esc — разоружение (договорённость Task 6), панель разбора при этом не закрывается…
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Löschen bestätigen' })).toBeNull();
    expect(screen.getByText('So wird gerechnet')).toBeInTheDocument();
    // …и только следующий возвращает сводку.
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('Ladung')).toBeInTheDocument();
  });

  it('в широком режиме у панели разбора есть крестик, и он тоже ведёт к сводке (I2)', async () => {
    renderSetup(() => {}, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', name: 'EPAL 1' })])],
    });
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Regeln schließen' }));
    expect(screen.getByText('Ladung')).toBeInTheDocument();
  });

  it('на узком экране «Рассчитать» с ошибкой уводит фокус В панель, а не в поле за ней (I3)', async () => {
    narrow();
    renderSetup(() => {}, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', name: 'EPAL 1', width: '' })])],
    });
    await userEvent.click(berechnenHeader());

    const drawer = await screen.findByRole('dialog', { name: 'Regeln' });
    // waitFor: фокус ставится в requestAnimationFrame.
    await waitFor(() => expect(drawer).toHaveFocus());
    // Поле артикула строки на 375px лежит ЗА панелью — каретка там равносильна вводу в никуда.
    expect(screen.getByLabelText('Artikel')).not.toHaveFocus();
  });

  it('на узком экране клик по сообщению сводки тоже уводит фокус в панель', async () => {
    narrow();
    renderSetup(() => {}, undefined, {
      initialOrders: [order('SO-1001', [position({ id: 'p1', name: 'EPAL 1', width: '' })])],
    });
    await userEvent.click(screen.getByRole('button', { name: /EPAL 1.*Maße unvollständig/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Regeln' });
    await waitFor(() => expect(drawer).toHaveFocus());
  });
  // Esc отменяет самое внутреннее. Раз Esc теперь закрывает панель и в широком режиме, открытый
  // список подсказок обязан забирать нажатие себе (ArticleCombobox.stopPropagation) — иначе одно
  // нажатие делало бы два дела: гасило список И закрывало разбор, которого пользователь не трогал.
  it('Esc при открытом списке подсказок гасит только список, панель разбора остаётся', async () => {
    renderSetupWithCatalogue();
    await userEvent.click(screen.getAllByTestId('rule-chip')[0]);
    const box = screen.getByRole('combobox', { name: 'Artikel' });
    await userEvent.type(box, 'Git');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('So wird gerechnet')).toBeInTheDocument();
  });
});

// Хвосты ревью финальной волны 5nb: разметка панели разбора обещала вспомогательным технологиям
// больше, чем давала. LKWkalk-bab — landmark без имени; LKWkalk-58v — aria-controls в пустоту.
describe('SetupScreen — панель разбора: честная разметка (bab, 58v)', () => {
  const narrow = () =>
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));

  // bab: <aside> — landmark complementary. Без имени он объявлен, но не назван: скринридер
  // перечисляет его как безымянный ориентир, а тест не может запросить его по имени.
  it('даёт широкой панели разбора доступное имя (bab)', () => {
    renderSetup(() => {});
    expect(screen.getByRole('complementary', { name: 'Regeln' })).toBeInTheDocument();
  });

  // 58v: в узком режиме drawer монтируется только при выбранной строке, а чип нёс aria-controls
  // всегда — до первого клика атрибут указывал на id, которого нет нигде в DOM. Для AT это хуже
  // отсутствующего атрибута: обещанная цель не находится.
  it('не оставляет aria-controls чипа висеть в пустоту до первого выбора (58v)', async () => {
    narrow();
    renderSetup(() => {});
    const chip = screen.getAllByTestId('rule-chip')[0];
    expect(chip).not.toHaveAttribute('aria-controls');

    await userEvent.click(chip);
    const target = chip.getAttribute('aria-controls');
    expect(target).toBeTruthy();
    expect(document.getElementById(target as string)).toBeInTheDocument();
  });

  // Широкий режим: панель смонтирована всегда, поэтому связь чипа с ней должна быть заявлена сразу.
  it('в широком режиме чип связан с панелью с самого начала (58v)', () => {
    renderSetup(() => {});
    const chip = screen.getAllByTestId('rule-chip')[0];
    const target = chip.getAttribute('aria-controls');
    expect(target).toBeTruthy();
    expect(document.getElementById(target as string)).toBeInTheDocument();
  });
});
