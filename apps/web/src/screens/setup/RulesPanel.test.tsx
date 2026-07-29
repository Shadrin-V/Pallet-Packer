import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Vehicle } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { RulesPanel } from './RulesPanel';
import { emptyPosition, type PositionState } from './setupState';

const vehicle: Vehicle = { id: 'v', name: 'v', length: 13620, width: 2480, height: 2700 };

// A plain vi.fn() onChange never updates `position`, so a controlled Measure/Select input snaps
// its DOM value back to the stale prop after every keystroke (React's controlled-input contract) —
// typing "80" would then read back as "1208"/"1200" instead of 80. This wrapper keeps a local
// `position` copy in sync (like the real SetupScreen state does) while still recording every patch
// on the same spy the tests assert against.
function renderPanel(initial: PositionState | null, onChange = vi.fn()) {
  function Wrapper() {
    const [position, setPosition] = useState(initial);
    return (
      <RulesPanel
        position={position}
        orderId={position ? 'SO-1' : null}
        index={0}
        vehicle={vehicle}
        onChange={(patch) => {
          onChange(patch);
          setPosition((prev) => (prev ? { ...prev, ...patch } : prev));
        }}
        onSaveArticle={async () => undefined}
      />
    );
  }
  render(
    <LocaleProvider initial="ru">
      <Wrapper />
    </LocaleProvider>,
  );
  return onChange;
}

const nested = (): PositionState => ({
  ...emptyPosition(), name: 'Gestell A', length: 2400, width: 1000, height: 1900,
  state: 'verschachtelt', nestingMode: 'sequential', nestStepSequential: 120,
});

describe('RulesPanel', () => {
  it('shows the empty hint when nothing is selected', () => {
    renderPanel(null);
    expect(screen.getByText('Выберите позицию, чтобы увидеть её правила.')).toBeInTheDocument();
  });

  it('explains sequential nesting in words, not only as a formula', () => {
    renderPanel(nested());
    expect(screen.getByTestId('rule-sentences')).toHaveTextContent('Нижняя — 1900 мм');
  });

  it('states the orientation as a sentence', () => {
    renderPanel({ ...nested(), rotation: 'none' });
    expect(screen.getByTestId('rule-sentences')).toHaveTextContent('Ориентация фиксирована');
  });

  it('edits the nesting step through the panel', async () => {
    const onChange = renderPanel(nested());
    const step = screen.getByLabelText('Прирост высоты на паллету (Δh)');
    await userEvent.clear(step);
    await userEvent.type(step, '80');
    expect(onChange).toHaveBeenCalledWith({ nestStepSequential: 80 });
  });

  it('switches orientation through the panel', async () => {
    const onChange = renderPanel(nested());
    await userEvent.selectOptions(screen.getByLabelText('Ориентация'), 'fixed');
    expect(onChange).toHaveBeenCalledWith({ rotation: 'none', forkAccess: 'all4' });
  });

  it('formats the stack height through formatLength, never a hardcoded unit', () => {
    renderPanel(nested());
    expect(screen.getByTestId('stack-result')).toHaveTextContent('мм');
    expect(screen.getByTestId('stack-result')).not.toHaveTextContent('mm');
  });
});
