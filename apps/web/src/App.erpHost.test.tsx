// Шаг выбора груза — только в сборке для ERP: обычная сборка (без хоста) его не рисует.
import { describe, expect, it, vi, type Mocked } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ErpSession } from '@shadrin-v/contracts';
import { App } from './App';
import { HostProvider } from './host/HostContext';
import type { ErpSource } from './data/ErpSource';

const SESSION: ErpSession = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 't', appVersion: '0.0.0' };

describe('App: шаг выбора груза', () => {
  it('шаг выбора груза есть только при хосте ERP', async () => {
    const fake: Mocked<ErpSource> = {
      session: vi.fn(),
      loadTrip: vi.fn(),
      listOpenLines: vi.fn().mockResolvedValue([]),
      importLines: vi.fn(),
    };
    render(<HostProvider value={{ kind: 'erp', session: SESSION, source: fake }}><App /></HostProvider>);
    expect(screen.getByRole('region', { name: 'Positionen wählen' })).toBeInTheDocument();
    await screen.findByRole('table');
    expect(fake.listOpenLines).toHaveBeenCalledTimes(1);
    cleanup();
    render(<App />);
    expect(screen.queryByRole('region', { name: 'Positionen wählen' })).toBeNull();
  });
});
