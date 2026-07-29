import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStickyCompact } from './useStickyCompact';

type Cb = (entries: { isIntersecting: boolean }[]) => void;
let cb: Cb | null = null;

class FakeObserver {
  constructor(c: Cb) { cb = c; }
  observe() {}
  disconnect() {}
}

afterEach(() => { cb = null; });

describe('useStickyCompact', () => {
  it('пока маячок виден — шапка полная', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { result } = renderHook(() => useStickyCompact());
    act(() => result.current[1](document.createElement('div')));
    act(() => cb?.([{ isIntersecting: true }]));
    expect(result.current[0]).toBe(false);
  });

  it('маячок ушёл за верх — шапка ужимается', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { result } = renderHook(() => useStickyCompact());
    act(() => result.current[1](document.createElement('div')));
    act(() => cb?.([{ isIntersecting: false }]));
    expect(result.current[0]).toBe(true);
  });

  it('без IntersectionObserver шапка остаётся полной, а не падает', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useStickyCompact());
    act(() => result.current[1](document.createElement('div')));
    expect(result.current[0]).toBe(false);
  });
});
