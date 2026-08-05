import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

/** Изолированный путь к предохранителю `App.onCalculate` (p3p.16 финальное ревью, Important 1).
 *
 *  Экранный гейт (`SetupScreen.handleCalculate`, `first?.where` / `showReasons`) и предохранитель
 *  `App` смотрят на один и тот же ввод через один и тот же `validateLoad` — валидная с точки зрения
 *  экрана заявка автоматически валидна и для предохранителя, поэтому «естественным» вводом до него
 *  не добраться: клик перехватывает экранный гейт раньше. Это эшелонированная защита, а не дубль:
 *  внешний рубеж (App) обязан держать линию сам по себе, даже если внутренний (SetupScreen) её уже
 *  не удержал — например, из-за будущего расхождения экранной валидации с движком.
 *
 *  Единственный способ проверить именно ЭТОТ рубеж изолированно — развести источники ошибки:
 *  подменить `calculateLayout` так, чтобы он вернул раскладку с непустым `errors`, оставив реальный
 *  `validateLoad` нетронутым. Тогда экранный гейт (он видит только `validateLoad`) молчит, клик
 *  доходит до `onCalculate`, и отказ происходит именно в `App.onCalculate:144`.
 *
 *  Мок — в отдельном файле: `vi.mock` действует на весь файл, а подмена `calculateLayout` в
 *  App.test.tsx сломала бы остальные 30 тестов там (обычный `calculate()` перестал бы строить план).
 */
vi.mock('@shadrin-v/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shadrin-v/engine')>();
  return {
    ...actual,
    // validateLoad НЕ подменяется — экранный гейт SetupScreen должен молчать при валидном вводе.
    calculateLayout: () => ({
      placements: [],
      unplaced: [],
      metrics: { totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
      contractVersion: actual.ENGINE_CONTRACT_VERSION,
      errors: [{ code: 'ERR_EMPTY_LOAD' }],
    }),
  };
});

function fillDims() {
  fireEvent.change(screen.getAllByLabelText('Länge')[1], { target: { value: '1200' } });
  fireEvent.change(screen.getAllByLabelText('Breite')[1], { target: { value: '800' } });
  fireEvent.change(screen.getAllByLabelText('Höhe')[1], { target: { value: '144' } });
}

const berechnenHeader = () => screen.getAllByRole('button', { name: 'Berechnen' })[0];

describe('предохранитель App.onCalculate — изолированный путь мимо экранного гейта', () => {
  it('валидная по validateLoad заявка, но calculateLayout вернул errors → план не появляется, localStorage не пишется', async () => {
    render(<App />);
    fillDims(); // валидная заявка: реальный validateLoad ошибок не увидит, экранный гейт не сработает

    expect(screen.getByTestId('empty-plan')).toBeInTheDocument();
    await userEvent.click(berechnenHeader());

    // Отказ произошёл именно в App.onCalculate: экран план не построил.
    expect(screen.getByTestId('empty-plan')).toBeInTheDocument();
    expect(localStorage.getItem('ladungsplaner.load')).toBeNull();
  });
});
