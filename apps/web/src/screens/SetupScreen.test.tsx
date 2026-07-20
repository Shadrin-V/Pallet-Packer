import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../i18n/LocaleContext';
import { SetupScreen } from './SetupScreen';
import { DataProviderProvider } from '../data/DataProviderContext';
import type { DataProvider } from '../data/DataProvider';
import type { Article, ArticleInput } from '@shadrin-v/contracts';

function renderSetup(onCalculate: (l: Load) => void, onReset?: () => void) {
  return render(
    <LocaleProvider initial="de">
      <SetupScreen onCalculate={onCalculate} onReset={onReset} />
    </LocaleProvider>,
  );
}

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
        <SetupScreen onCalculate={() => {}} />
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
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    expect(onCalculate).toHaveBeenCalledTimes(1);
    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.vehicle.name).toBe('LKW Standard');
    expect(load.cargo).toHaveLength(1);
    expect(load.cargo[0].orderId).toBe('SO-1');
    expect(load.cargo[0].state).toBe('entschachtelt');
  });

  it('defaults orientation to free (no fork constraint) and hides the fork-axis control', () => {
    renderSetup(() => {});
    expect((screen.getByLabelText('Ausrichtung') as HTMLSelectElement).value).toBe('free');
    expect(screen.queryByLabelText('Gabelzufahrt')).not.toBeInTheDocument();
  });

  it('a two-sided orientation sets forkAccess/forkAxis on the built Load (ADR 018)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    await userEvent.selectOptions(screen.getByLabelText('Ausrichtung'), 'twoSided');
    // the fork-entry axis control now appears
    expect(screen.getByLabelText('Gabelzufahrt')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    expect(load.cargo[0].forkAccess).toBe('twoSides');
    expect(load.cargo[0].forkAxis).toBe('length');
    expect(load.cargo[0].rotation).toBe('yawOnly');
  });

  it('shows a hint on the two-sided orientation about rear/side loading (4bj.13)', async () => {
    renderSetup(() => {});
    // no hint while the orientation is the default "free"
    expect(screen.queryByRole('button', { name: 'Nur 2 Seiten' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Ausrichtung'), 'twoSided');
    // the info button appears next to the two-sided controls; its tooltip explains the constraint
    await userEvent.click(screen.getByRole('button', { name: 'Nur 2 Seiten' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/hinten/i);
  });

  it('Verschachtelt without a valid Δh disables Berechnen', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(screen.getByRole('button', { name: 'Berechnen' })).toBeDisabled();
  });

  it('Verschachtelt with a valid Δh emits nesting and enables Berechnen', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    // switching to Ver auto-expands the details panel (E9) — no separate details click needed
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await userEvent.type(screen.getByLabelText('Höhenzuwachs je Palette (Δh)'), '22');
    const berechnen = screen.getByRole('button', { name: 'Berechnen' });
    expect(berechnen).toBeEnabled();
    await userEvent.click(berechnen);

    const load = onCalculate.mock.calls[0][0] as Load;
    expect(load.cargo[0].state).toBe('verschachtelt');
    expect(load.cargo[0].nesting).toMatchObject({ nestable: true, stepHeight: 22, nestingMode: 'pairwise' });
  });

  it('keeps a separate constructive step per nesting mode (pairwise ≠ sequential)', async () => {
    const onCalculate = vi.fn();
    renderSetup(onCalculate);
    // switch the row to verschachtelt → the nesting panel with the step field appears
    const STEP = 'Höhenzuwachs je Palette (Δh)';
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await userEvent.type(screen.getByLabelText(STEP), '22'); // pairwise is the default mode
    await userEvent.selectOptions(screen.getByLabelText('Verschachtelungsmodus'), 'sequential');
    // the sequential step is its own field and starts empty, it does not inherit 22
    expect((screen.getByLabelText(STEP) as HTMLInputElement).value).toBe('');
    await userEvent.type(screen.getByLabelText(STEP), '30');
    await userEvent.selectOptions(screen.getByLabelText('Verschachtelungsmodus'), 'pairwise');
    expect((screen.getByLabelText(STEP) as HTMLInputElement).value).toBe('22');

    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
    const load = onCalculate.mock.calls.at(-1)![0] as Load;
    // the engine still receives a single stepHeight — the one matching the selected mode
    expect(load.cargo[0].nesting).toMatchObject({ nestable: true, stepHeight: 22, nestingMode: 'pairwise' });
  });

  it('auto-expands details on Ver and defaults the nesting mode to pairwise (E5/E9)', async () => {
    renderSetup(() => {});
    // no details click: switching to Ver opens the panel by itself (E9)
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect((screen.getByLabelText('Verschachtelungsmodus') as HTMLSelectElement).value).toBe('pairwise');
    // pairwise step-height label is shown (Höhe der oberen Bretter), and the allow-unpaired toggle appears
    expect(screen.getByText('Höhe der oberen Bretter (h_d)')).toBeInTheDocument();
    expect(screen.getByText('Einzelne Palette oben zulassen')).toBeInTheDocument();
  });

  it('adding a position collapses the panel AND still triggers the button (T1)', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'Ver' })); // auto-opens details
    expect(screen.getByLabelText('Verschachtelungsmodus')).toBeInTheDocument();
    // Ladungsart (preset select) is gone (rgv.8) — the article combobox is the row's identity control.
    expect(screen.getAllByRole('combobox', { name: 'Artikel' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /Position hinzufügen/ }));

    // panel collapsed…
    expect(screen.queryByLabelText('Verschachtelungsmodus')).not.toBeInTheDocument();
    // …and the click-outside handler did not swallow the button: a position was actually added
    expect(screen.getAllByRole('combobox', { name: 'Artikel' })).toHaveLength(2);
  });

  it('reveals the Stapelbar hint tooltip on demand (E1)', async () => {
    renderSetup(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'details' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'details' }));
    expect((screen.getByLabelText('Höhenzuwachs je Palette (Δh)') as HTMLInputElement).value).toBe('22');

    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'details' }));
    expect((screen.getByLabelText('Höhenzuwachs je Palette (Δh)') as HTMLInputElement).value).toBe('30');

    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
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
      await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));

    const load = onCalculate.mock.calls[0][0] as Load;
    const orderIds = [...new Set(load.cargo.map((c) => c.orderId))];
    expect(orderIds).toEqual(['SO-1', 'SO-2']);
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
    await userEvent.click(screen.getByRole('button', { name: 'details' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'details' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'details' }));

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

    await userEvent.click(screen.getAllByRole('button', { name: 'Artikel' })[0]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('ABB101');
  });

  // Finding 3: «активна при введённом артикуле и заполненных габаритах» — present, disabled, not
  // conditionally hidden.
  it('the save button is always present in the details panel, disabled until article + dimensions are complete (Finding 3)', async () => {
    renderSetupWithCatalogue({ searchArticles: async () => [] } as Partial<DataProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'details' }));

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
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '500');
    await userEvent.click(screen.getByRole('button', { name: 'Berechnen' }));
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
      await userEvent.click(screen.getByRole('button', { name: 'details' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'details' }));

    const saveButton = () => screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' });
    await userEvent.click(saveButton());
    expect(await screen.findByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).toBeInTheDocument();

    await userEvent.click(saveButton());
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
      upsertArticle: async (a) => {
        const saved: Article = { ...a, source: 'local', erpFields: [], updatedAt: 'x' };
        catalogue.push(saved);
        return saved;
      },
    } as unknown as DataProvider;

    render(
      <LocaleProvider initial="de">
        <DataProviderProvider value={dp}>
          <SetupScreen onCalculate={() => {}} />
        </DataProviderProvider>
      </LocaleProvider>,
    );

    // save an article on the first position row
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'NEU-42');
    await userEvent.type(screen.getAllByLabelText('Länge')[1], '1200');
    await userEvent.type(screen.getAllByLabelText('Breite')[1], '800');
    await userEvent.type(screen.getAllByLabelText('Höhe')[1], '144');
    await userEvent.click(screen.getByRole('button', { name: 'details' }));
    await userEvent.click(screen.getByRole('button', { name: 'Artikel in die Datenbank speichern' }));

    // add a second position row and look the saved article up there
    await userEvent.click(screen.getByRole('button', { name: /Position hinzufügen/ }));
    const secondCombobox = screen.getAllByRole('combobox', { name: 'Artikel' })[1];
    await userEvent.type(secondCombobox, 'NEU-42');

    expect(await screen.findByRole('option', { name: /NEU-42/ })).toBeInTheDocument();
  });
});
