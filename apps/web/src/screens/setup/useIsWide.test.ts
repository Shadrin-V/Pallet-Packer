import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsWide } from './useIsWide';

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches, media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
  return listeners;
}
afterEach(() => vi.unstubAllGlobals());

describe('useIsWide', () => {
  it('is true above the two-column threshold', () => {
    stubMatchMedia(true);
    expect(renderHook(() => useIsWide()).result.current).toBe(true);
  });
  it('is false below it', () => {
    stubMatchMedia(false);
    expect(renderHook(() => useIsWide()).result.current).toBe(false);
  });
  it('drops its listener on unmount', () => {
    const listeners = stubMatchMedia(true);
    renderHook(() => useIsWide()).unmount();
    expect(listeners.size).toBe(0);
  });
});
