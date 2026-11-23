import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Vehicle } from '@shadrin-v/engine';
import type { ErpSession } from '@shadrin-v/contracts';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { HostProvider, type Host } from '../../host/HostContext';
import type { ErpSource } from '../../data/ErpSource';
import { PositionRow } from './PositionRow';
import { emptyPosition, type PositionState } from './setupState';

const vehicle: Vehicle = { id: 'v', name: 'v', length: 13620, width: 2480, height: 2700 };

const ERP_HOST: Host = {
  kind: 'erp',
  session: { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 't', appVersion: '0.0.0' } satisfies ErpSession,
  source: {} as ErpSource,
};

function renderRow(over: Partial<PositionState> = {}, props: Partial<Parameters<typeof PositionRow>[0]> = {}, host?: Host) {
  const onSelect = vi.fn();
  const onChange = vi.fn();
  const row = (
    <PositionRow
      position={{ ...emptyPosition(), name: 'Gestell A', length: 2400, width: 1000, height: 1900, ...over }}
      index={0} vehicle={vehicle} selected={false} panelMounted
      onSelect={onSelect} onDeselect={() => {}} onChange={onChange} armed={false} onArm={() => {}} onRemove={() => {}}
      {...props}
    />
  );
  render(<LocaleProvider initial="de">{host ? <HostProvider value={host}>{row}</HostProvider> : row}</LocaleProvider>);
  return { onSelect, onChange };
}

describe('PositionRow', () => {
  it('shows the plain stacking chip and the units per stack', () => {
    renderRow();
    const chip = screen.getByTestId('rule-chip');
    expect(chip).toHaveTextContent('Stapel');
    expect(chip).toHaveTextContent('1');           // 2700 / 1900 → 1
  });

  it('names the nesting step on the chip', () => {
    renderRow({ state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: 120 });
    expect(screen.getByTestId('rule-chip')).toHaveTextContent('120');
  });

  it('omits the count while dimensions are incomplete', () => {
    renderRow({ height: '' });
    // The per-stack count only renders as a dedicated element carrying an aria-label built from
    // `setup.chip.perStack` ("{count} pro Stapel"); asserting `not.toHaveTextContent('0')` would
    // also pass if the badge rendered as "1" (or any non-zero count) — it doesn't prove the badge is
    // absent. Query the marker itself instead.
    expect(screen.queryByLabelText(/pro Stapel$/)).toBeNull();
  });

  it('selects the position when the chip is pressed', async () => {
    const { onSelect } = renderRow();
    await userEvent.click(screen.getByTestId('rule-chip'));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('no longer renders the orientation select or the state toggle', () => {
    renderRow();
    // `renderRow` wraps in `<LocaleProvider initial="de">`, so accessible names are the real German
    // dictionary values ("Ausrichtung" / "Verschachtelung" — de.ts), never the raw translation keys.
    // Querying by key here would never match regardless of what the component renders, making these
    // assertions vacuous (see review finding 2: proven with a temporary revert, see task report).
    expect(screen.queryByRole('combobox', { name: 'Ausrichtung' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Verschachtelung' })).toBeNull();
  });

  it('has no hardcoded English label left', () => {
    renderRow();
    expect(screen.queryByLabelText('details')).toBeNull();
  });

  // LKWkalk-0il п.2: хинты запертых полей носили имя самого комбобокса ('Artikel') — скринридер
  // объявлял кнопки и поле ввода одним именем, а getByRole(..., { name: 'Artikel' }) становился
  // неоднозначным (SetupScreen.test.tsx даже строил фикстуры в обход). Тот же приём, что 2tp и
  // lu6: у подсказки собственный ключ.
  it('lock hints carry their own name, distinct from the combobox (0il)', () => {
    renderRow({
      articleCode: 'ABB101',
      locked: { name: true, length: true, width: true, height: true },
    });
    // Комбобокс по имени находится однозначно, несмотря на четыре открытых хинта.
    expect(screen.getByRole('combobox', { name: 'Artikel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Artikel' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Erklärung zur Artikelbindung' })).toHaveLength(4);
  });

  describe('происхождение габаритов (сборка для ERP)', () => {
    it('каталог и полные габариты → «Maße am Artikel gespeichert»', () => {
      renderRow({ dimsFromCatalog: true }, {}, ERP_HOST);
      expect(screen.getByTestId('dims-hint')).toHaveTextContent('Maße am Artikel gespeichert');
    });

    it('из названия без высоты → «aus dem Namen» и «Höhe fehlt»', () => {
      renderRow({ dimsFromName: true, height: '' }, {}, ERP_HOST);
      const hint = screen.getByTestId('dims-hint');
      expect(hint).toHaveTextContent('Länge und Breite aus dem Namen, bitte prüfen');
      expect(hint).toHaveTextContent('Höhe fehlt');
    });

    it('без габаритов и без метки названия → «Maße fehlen» с пояснением', () => {
      renderRow({ length: '', width: '', height: '' }, {}, ERP_HOST);
      expect(screen.getByTestId('dims-hint')).toHaveTextContent('Maße fehlen');
      expect(screen.getByTestId('dims-hint')).toHaveTextContent('Im Namen steht kein Maß.');
    });

    it('правка длины снимает метку «aus dem Namen»; без метки патч прежний', async () => {
      const { onChange } = renderRow({ dimsFromName: true }, {}, ERP_HOST);
      await userEvent.type(screen.getByLabelText('Länge'), '1');
      expect(onChange).toHaveBeenLastCalledWith({ length: 24001, dimsFromName: undefined });
      expect(Object.keys(onChange.mock.lastCall![0])).toContain('dimsFromName');
    });

    it('обычная сборка: тех же меток нет', () => {
      renderRow({ dimsFromName: true, height: '', sourceQuantity: 2.5, uom: 'Nos' });
      expect(screen.queryByTestId('dims-hint')).toBeNull();
      expect(screen.queryByTestId('source-quantity')).toBeNull();
    });

    it('обычная сборка: правка длины даёт прежний патч без новых ключей', async () => {
      const { onChange } = renderRow();
      await userEvent.type(screen.getByLabelText('Länge'), '1');
      expect(Object.keys(onChange.mock.lastCall![0])).toEqual(['length']);
    });
  });
});
