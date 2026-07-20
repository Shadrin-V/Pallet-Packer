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
