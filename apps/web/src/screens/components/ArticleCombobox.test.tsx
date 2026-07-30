import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Article } from '@shadrin-v/contracts';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { DataProviderProvider } from '../../data/DataProviderContext';
import type { DataProvider } from '../../data/DataProvider';
import { ArticleCombobox, type ArticleSuggestion } from './ArticleCombobox';

// ArticleCombobox is a controlled input. A test double that never echoes typed text back
// via `onChange` (e.g. `onChange={() => {}}`) leaves `value` pinned to its initial prop, so
// React resets the DOM to that value after every keystroke and only the trailing character
// of a multi-character `userEvent.type()` ever survives into the component's debounced
// query. This wrapper holds `value` in real state, exactly as the eventual SetupScreen
// caller will, so typing accumulates the way it does in production.
function ControlledCombobox({
  onPick,
  ariaLabel,
}: {
  onPick: (s: ArticleSuggestion) => void;
  ariaLabel: string;
}) {
  const [value, setValue] = useState('');
  return <ArticleCombobox value={value} onChange={setValue} onPick={onPick} ariaLabel={ariaLabel} />;
}

const ABB: Article = {
  itemCode: 'ABB101',
  name: 'Einwegpalette 600x800',
  length: 800,
  width: 600,
  height: 144,
  nestStepPairwise: 22,
  rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
  source: 'erp',
  updatedAt: 'x',
};

function renderBox(opts: { search?: (q: string) => Promise<Article[]>; onPick?: (s: ArticleSuggestion) => void } = {}) {
  const dp = { searchArticles: opts.search ?? (async () => [ABB]) } as unknown as DataProvider;
  const onPick = opts.onPick ?? vi.fn();
  render(
    <LocaleProvider initial="de">
      <DataProviderProvider value={dp}>
        <ControlledCombobox onPick={onPick} ariaLabel="Artikel" />
      </DataProviderProvider>
    </LocaleProvider>,
  );
  return { onPick };
}

describe('ArticleCombobox', () => {
  it('suggests catalogue articles as the user types', async () => {
    renderBox();
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    await waitFor(() => expect(screen.getByRole('option', { name: /ABB101/ })).toBeInTheDocument());
  });

  it('picking a suggestion reports the whole article, dimensions and rules included', async () => {
    const { onPick } = renderBox();
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    await userEvent.click(await screen.findByRole('option', { name: /ABB101/ }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ itemCode: 'ABB101', length: 800, nestStepPairwise: 22, origin: 'erp' }),
    );
  });

  it('offers the built-in pallet presets even when the catalogue has no match', async () => {
    renderBox({ search: async () => [] });
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'EPAL 1');
    const option = await screen.findByRole('option', { name: /EPAL 1/ });
    expect(option).toBeInTheDocument();
  });

  it('survives a failing catalogue request (offline) by showing the built-ins only', async () => {
    renderBox({ search: async () => { throw new Error('offline'); } });
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'EPAL 2');
    expect(await screen.findByRole('option', { name: /EPAL 2/ })).toBeInTheDocument();
  });

  it('shows the no-matches hint when neither the catalogue nor the built-ins match', async () => {
    renderBox({ search: async () => [] });
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), '9');
    expect(await screen.findByText('Keine Treffer — Maße bitte eingeben')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('sends the query the user actually typed, not just its last character', async () => {
    const search = vi.fn(async () => []);
    renderBox({ search });
    const input = screen.getByRole('combobox', { name: 'Artikel' });

    // Positive case: the full typed text reaches both the catalogue search and the
    // built-in preset filter, not merely the character that happens to be typed last.
    await userEvent.type(input, 'EPAL 1');
    await waitFor(() => expect(search).toHaveBeenCalledWith('EPAL 1'));
    expect(await screen.findByRole('option', { name: /EPAL 1/ })).toBeInTheDocument();

    // Negative case: 'zz1' is not a substring of any preset name, so it must not match —
    // even though its last character ('1') alone would substring-match "EPAL 1". A harness
    // (or a component) that only ever sees the trailing character would show a false
    // positive here instead of the no-matches hint.
    await userEvent.clear(input);
    await userEvent.type(input, 'zz1');
    await waitFor(() => expect(search).toHaveBeenCalledWith('zz1'));
    expect(await screen.findByText('Keine Treffer — Maße bitte eingeben')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  // LKWkalk-e2g. Оба оверлея висели на жёсткой `w-80` (320 px), не связанной со своим containing
  // block — полем артикула. Замерено в Chrome: поле 259–290 px на любой ширине, то есть оверлей
  // всегда шире поля; на 375 px обрезающий предок (`section.overflow-hidden` карточки заказа) сам
  // 320 px, и правые 38 px оверлея пропадали — `elementFromPoint` по правому краю отдавал `null`.
  // Внутрь карточки 320 px на 375 px не влезает ни при каком якоре, поэтому оверлей обязан
  // сжиматься: `max-w-full` берёт min(320 px, ширина поля). jsdom раскладку не считает и CSS не
  // грузит, поэтому стережём объявление, а не результат: фиксированная ширина у оверлея допустима
  // только вместе с ограничителем.
  const overlayWidthUnclamped = (el: Element) =>
    /(^|\s)w-(?!full\b)[^\s]+/.test(el.className) && !/(^|\s)max-w-full(\s|$)/.test(el.className);

  it('keeps the suggestion overlay inside the field it is anchored to (no unclamped fixed width)', async () => {
    renderBox();
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), 'abb');
    const listbox = await screen.findByRole('listbox');
    expect(overlayWidthUnclamped(listbox)).toBe(false);
  });

  it('keeps the no-matches overlay inside the field it is anchored to (no unclamped fixed width)', async () => {
    renderBox({ search: async () => [] });
    await userEvent.type(screen.getByRole('combobox', { name: 'Artikel' }), '9');
    const status = await screen.findByRole('status');
    expect(overlayWidthUnclamped(status)).toBe(false);
  });

  // LKWkalk-0il п.1: ARIA-ссылки комбобокса не должны висеть в пустоте.
  it('clearing the query drops aria-activedescendant instead of pointing at an unmounted option', async () => {
    renderBox();
    const input = screen.getByRole('combobox', { name: 'Artikel' });
    await userEvent.type(input, 'abb');
    await screen.findByRole('option', { name: /ABB101/ });
    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant');

    await userEvent.clear(input);
    // Список размонтирован — активного пункта больше нет, и ссылка обязана исчезнуть вместе с ним.
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('aria-controls never references an id that is not in the document (no-matches state)', async () => {
    renderBox({ search: async () => [] });
    const input = screen.getByRole('combobox', { name: 'Artikel' });
    await userEvent.type(input, '9');
    await screen.findByRole('status'); // показан хинт «нет совпадений», listbox не отрендерен
    const controls = input.getAttribute('aria-controls');
    if (controls !== null) {
      expect(document.getElementById(controls)).not.toBeNull();
    }
  });

  it('navigates with arrow keys and picks with Enter, closes with Escape', async () => {
    const { onPick } = renderBox();
    const input = screen.getByRole('combobox', { name: 'Artikel' });
    await userEvent.type(input, 'abb');
    await screen.findByRole('option', { name: /ABB101/ });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ itemCode: 'ABB101' }));
    await userEvent.type(input, 'abb');
    await screen.findByRole('option', { name: /ABB101/ });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
