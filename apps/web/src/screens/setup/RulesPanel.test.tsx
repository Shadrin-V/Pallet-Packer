import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Vehicle } from '@shadrin-v/engine';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { RulesPanel, type RulesPanelProps } from './RulesPanel';
import { emptyPosition, type PositionState } from './setupState';
import type { SetupMessage } from './setupValidation';

const vehicle: Vehicle = { id: 'v', name: 'v', length: 13620, width: 2480, height: 2700 };

// A plain vi.fn() onChange never updates `position`, so a controlled Measure/Select input snaps
// its DOM value back to the stale prop after every keystroke (React's controlled-input contract) —
// typing "80" would then read back as "1208"/"1200" instead of 80. This wrapper keeps a local
// `position` copy in sync (like the real SetupScreen state does) while still recording every patch
// on the same spy the tests assert against.
function renderPanel(
  initial: PositionState | null,
  onChange = vi.fn(),
  extra: Partial<RulesPanelProps> = {},
) {
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
        {...extra}
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

// Ревью, дефект 2: замена условия делегации на `if (false && ...)` оставляла оба файла тестов
// зелёными 11/11 — сама делегация оказалась ничем не покрыта. Эти тесты обязаны краснеть, если
// делегация отключена.
describe('RulesPanel — empty-state delegation to LoadSummary (5nb, задача 3)', () => {
  const summary = { orders: 1, positions: 2, units: 10, cargoVolume: 1_000_000, vehicleVolume: 2_000_000 };
  const messages: SetupMessage[] = [];

  it('shows the load summary instead of the old placeholder when summary/messages/onGoTo are given', () => {
    renderPanel(null, vi.fn(), { summary, messages, onGoTo: vi.fn() });
    expect(screen.queryByText('Выберите позицию, чтобы увидеть её правила.')).toBeNull();
    // 'Груз' — заголовок сводки LoadSummary (setup.summary.title, ru); он появляется только через
    // делегацию, старая заглушка его не знает.
    expect(screen.getByText('Груз')).toBeInTheDocument();
  });

  it('keeps the old placeholder when the empty-state props are not given', () => {
    renderPanel(null);
    expect(screen.getByText('Выберите позицию, чтобы увидеть её правила.')).toBeInTheDocument();
    expect(screen.queryByText('Груз')).toBeNull();
  });
});

// LKWkalk-clb: кнопка сохранения не блокировалась на время запроса, поэтому двойной клик слал две
// одинаковые записи. Upsert идемпотентен, так что последствия косметические, но вторая запись —
// лишний круг по сети и вторая возможность отрисовать ошибку.
describe('RulesPanel — сохранение артикула не дублируется (clb)', () => {
  const saveable = (): PositionState => ({
    ...emptyPosition(), name: 'Gitterbox', length: 1200, width: 800, height: 970,
  });

  it('не шлёт вторую запись, пока первая в полёте, и снова принимает клик после ответа', async () => {
    let settle!: () => void;
    const onSaveArticle = vi.fn(
      () => new Promise<undefined>((resolve) => { settle = () => resolve(undefined); }),
    );
    renderPanel(saveable(), vi.fn(), { onSaveArticle });

    const btn = screen.getByRole('button', { name: 'Сохранить артикул в базу' });
    await userEvent.click(btn);
    expect(onSaveArticle).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();

    await userEvent.click(btn); // второй клик по той же кнопке, ответа ещё нет
    expect(onSaveArticle).toHaveBeenCalledTimes(1);

    settle();
    await waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);
    expect(onSaveArticle).toHaveBeenCalledTimes(2);
  });

  it('снимает блокировку и после неудачного сохранения — иначе повторить было бы нечем', async () => {
    const onSaveArticle = vi.fn(async () => { throw new Error('network'); });
    renderPanel(saveable(), vi.fn(), { onSaveArticle });

    const btn = screen.getByRole('button', { name: 'Сохранить артикул в базу' });
    await userEvent.click(btn);
    expect(await screen.findByText('Не удалось сохранить. Попробуйте ещё раз.')).toBeInTheDocument();
    expect(btn).toBeEnabled();
  });
});
