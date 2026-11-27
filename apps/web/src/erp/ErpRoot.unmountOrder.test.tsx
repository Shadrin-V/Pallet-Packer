import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { ErpRoot } from './ErpRoot';
import { sessionSignal } from './sessionSignal';
import { writeStored } from '../lib/draftStorage';

// Порядок «замок → размонтирование» (ErpRoot.leave): экран, который сохраняет черновик в своей очистке
// при размонтировании, — самый поздний писатель из возможных. Если замок встаёт после размонтирования,
// эта запись проходит. Программа подменена таким экраном, чтобы порядок был виден тесту.
vi.mock('../App', () => ({
  App: function SavesOnUnmount() {
    useEffect(() => () => writeStored('ladungsplaner.setup', '{"saved":"on-unmount"}'), []);
    return <p>app-mounted</p>;
  },
}));

const SESSION = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de' as const, csrfToken: 'tok', appVersion: '0.21.570' };

function setup(sessionMock: ReturnType<typeof vi.fn>) {
  const expired = sessionSignal();
  const changed = sessionSignal();
  const source = { session: sessionMock, close: vi.fn() } as never;
  render(<ErpRoot source={source} subscribeExpired={expired.subscribe} subscribeChanged={changed.subscribe} />);
  return { expired, changed };
}

const saved = () => Object.keys(localStorage).some((k) => localStorage.getItem(k)?.includes('on-unmount'));

describe('ErpRoot: замок хранения встаёт раньше размонтирования', () => {
  it('истечение сессии: запись при размонтировании не проходит', async () => {
    const { expired } = setup(vi.fn().mockResolvedValue(SESSION));
    await screen.findByText('app-mounted');
    act(() => expired.notify());
    expect(screen.queryByText('app-mounted')).toBeNull();
    expect(saved()).toBe(false);
  });

  it('смена пользователя (сигнал провайдера): запись при размонтировании не проходит', async () => {
    const { changed } = setup(vi.fn().mockResolvedValue(SESSION));
    await screen.findByText('app-mounted');
    act(() => changed.notify());
    expect(screen.queryByText('app-mounted')).toBeNull();
    expect(saved()).toBe(false);
  });

  it('смена пользователя (фокус): запись при размонтировании не проходит', async () => {
    setup(vi.fn().mockResolvedValueOnce(SESSION).mockResolvedValueOnce({ ...SESSION, user: 'boris@firma.de' }));
    await screen.findByText('app-mounted');
    fireEvent.focus(window);
    await screen.findByRole('button', { name: 'Seite neu laden' });
    expect(saved()).toBe(false);
  });
});
