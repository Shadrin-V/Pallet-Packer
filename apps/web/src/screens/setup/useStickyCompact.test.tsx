import { StrictMode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, act, screen } from '@testing-library/react';
import { useStickyCompact } from './useStickyCompact';

type Cb = (entries: { isIntersecting: boolean }[]) => void;
let cb: Cb | null = null;

/** Живые наблюдатели: отключённый больше не зовёт колбэк — как настоящий IntersectionObserver.
 *  Без этого тест не увидел бы, что наблюдателя потеряли (тест про StrictMode ниже). */
const live = new Set<FakeObserver>();

class FakeObserver {
  readonly c: Cb;
  constructor(c: Cb) { this.c = c; cb = c; }
  observe() { live.add(this); }
  disconnect() { live.delete(this); }
}

/** Сообщить только тем наблюдателям, которых никто не отключил. */
function fire(isIntersecting: boolean) {
  for (const o of [...live]) o.c([{ isIntersecting }]);
}

afterEach(() => { cb = null; live.clear(); });

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

  // Найдено в настоящем Chrome (Задача 6): в dev-сборке под StrictMode шапка не ужималась НИКОГДА.
  // React при повторном монтировании сначала навешивает ref заново (наблюдатель №2), и только потом
  // выполняет cleanup эффекта — который отключал этого свежего наблюдателя. Тесты выше зовут ref
  // руками и такого порядка не воспроизводят, поэтому здесь ref навешивает сам React.
  it('переживает повторное подключение ref (StrictMode) — наблюдатель остаётся живым', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    function Probe() {
      const [compact, ref] = useStickyCompact();
      return (
        <div>
          <div ref={ref} />
          <span data-testid="compact">{String(compact)}</span>
        </div>
      );
    }
    render(<StrictMode><Probe /></StrictMode>);
    act(() => fire(false));
    expect(screen.getByTestId('compact').textContent).toBe('true');
  });

  it('размонтирование отключает наблюдателя — утечки нет', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    function Probe() {
      const [, ref] = useStickyCompact();
      return <div ref={ref} />;
    }
    const { unmount } = render(<Probe />);
    expect(live.size).toBe(1);
    unmount();
    expect(live.size).toBe(0);
  });
});
