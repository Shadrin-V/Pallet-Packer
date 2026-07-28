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
    expect(screen.getByTestId('rule-chip')).not.toHaveTextContent('0');
  });

  it('selects the position when the chip is pressed', async () => {
    const { onSelect } = renderRow();
    await userEvent.click(screen.getByTestId('rule-chip'));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('no longer renders the orientation select or the state toggle', () => {
    renderRow();
    expect(screen.queryByRole('combobox', { name: 'cargoType.orientation.label' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'cargoType.nesting.label' })).toBeNull();
  });

  it('has no hardcoded English label left', () => {
    renderRow();
    expect(screen.queryByLabelText('details')).toBeNull();
  });
});
