import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { calculateLayout, type CargoType, type Layout, type Load } from '@shadrin-v/engine';
import { LocaleProvider } from '../i18n/LocaleContext';
import { LadeplanScreen } from './LadeplanScreen';
import { installSvgGeometry } from './components/svgTestGeometry';

installSvgGeometry();

const cube = (id: string, over: Partial<CargoType> = {}): CargoType => ({
  id,
  name: id,
  length: 1000,
  width: 1000,
  height: 1000,
  quantity: 1,
  rotation: 'none',
  stacking: { stackable: true },
  nesting: { nestable: false },
  state: 'entschachtelt',
  orderId: 'SO-1',
  ...over,
});
const load: Load = {
  vehicle: { id: 'v', name: 'Test', length: 2000, width: 2000, height: 2000 },
  cargo: [cube('a', { quantity: 3 }), cube('b', { quantity: 1, stacking: { stackable: true, maxTiers: 1 } })],
};

function renderPlan(l: Load, layout: Layout) {
  return render(
    <LocaleProvider initial="de">
      <LadeplanScreen load={l} layout={layout} />
    </LocaleProvider>,
  );
}

describe('LadeplanScreen capacity and weight note', () => {
  it('в легенде обычной сборки — максимум по каждой позиции, не в печать', () => {
    renderPlan(load, calculateLayout(load));
    const caps = screen.getAllByTestId('legend-capacity');
    expect(caps.map((e) => e.textContent)).toEqual(['max. in diesen LKW: 8', 'max. in diesen LKW: 4']);
    caps.forEach((e) => expect(e.className).toContain('print:hidden'));
  });

  it('на листе плана сказано, что вес не проверяется, и это идёт в печать', () => {
    renderPlan(load, calculateLayout(load));
    const note = screen.getByTestId('weight-not-checked');
    expect(note).toHaveTextContent('Gewicht wird nicht geprüft');
    expect(note).toHaveTextContent(
      'Der Ladungsplaner rechnet nur mit Maßen. Zulässiges Gesamtgewicht und Achslasten prüfst du selbst.',
    );
    expect(note.closest('.plan-sheet')).not.toBeNull();
    for (let el: Element | null = note; el; el = el.parentElement) expect(el.className).not.toMatch(/print:hidden/);
  });
});
