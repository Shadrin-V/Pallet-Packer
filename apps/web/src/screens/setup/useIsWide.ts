// Порог двух колонок (спека §7): xl = 1280 px. Выше — панель колонкой, ниже — drawer.
import { useEffect, useState } from 'react';

const QUERY = '(min-width: 1280px)';

export function useIsWide(): boolean {
  const [wide, setWide] = useState(() => globalThis.matchMedia?.(QUERY).matches ?? true);
  useEffect(() => {
    const mq = globalThis.matchMedia?.(QUERY);
    if (!mq) return;
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}
