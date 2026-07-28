import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Vehicle } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { PositionRow } from './PositionRow';
import { emptyPosition, type PositionState } from './setupState';

const vehicle: Vehicle = { id: 'v', name: 'v', length: 13620, width: 2480, height: 2700 };

function renderRow(over: Partial<PositionState> = {}, props: Partial<Parameters<typeof PositionRow>[0]> = {}) {
  const onSelect = vi.fn();
  const onChange = vi.fn();
  render(
    <LocaleProvider initial="de">
      <PositionRow
        position={{ ...emptyPosition(), name: 'Gestell A', length: 2400, width: 1000, height: 1900, ...over }}
        index={0} vehicle={vehicle} selected={false}
        onSelect={onSelect} onChange={onChange} armed={false} onArm={() => {}} onRemove={() => {}}
        {...props}
      />
    </LocaleProvider>,
  );
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
});
