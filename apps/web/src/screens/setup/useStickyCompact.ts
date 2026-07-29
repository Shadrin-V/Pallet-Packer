// «Шапка ужалась» (LKWkalk-5nb, спека §6). Наблюдаем не за скроллом, а за МАЯЧКОМ над шапкой:
// обработчик скролла на каждый кадр — это работа в главном потоке ради одного булева, а
// IntersectionObserver отвечает ровно на нужный вопрос («видно ли ещё то, что было над шапкой»).
// Без IntersectionObserver (старый браузер, jsdom без стаба) шапка просто остаётся полной.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useStickyCompact(): [boolean, (el: HTMLElement | null) => void] {
  const [compact, setCompact] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) setCompact(!e.isIntersecting);
    });
    io.observe(el);
    observer.current = io;
  }, []);
  return [compact, ref];
}
