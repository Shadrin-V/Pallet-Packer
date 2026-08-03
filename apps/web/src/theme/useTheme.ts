// Тема = фирменная палитра, не светлая/тёмная (ADR 025). Обе палитры светлые; `forest` —
// умолчание и живёт в голом `:root`, поэтому для неё атрибут СНИМАЕТСЯ, а не ставится в
// 'forest': так каскад имеет ровно один источник умолчания.
//
// Состояние — DOM-атрибут `<html data-theme>` + localStorage, оба глобальные и разделяются всеми
// вызовами useTheme() на странице. Раньше это было спрятано за приватным useState на каждый
// монтаж хука: два экземпляра тихо расходились бы (переключение в одном не трогало aria-pressed
// другого — ThemeSwitch.test.tsx «два экземпляра переключателя делят одно состояние», ревью
// task-4/1). useSyncExternalStore честно моделирует именно это — подписку на внешний источник
// истины — без Context-провайдера в корне приложения.
import { useCallback, useSyncExternalStore } from 'react';

export type ThemeName = 'forest' | 'warm';

export const THEME_STORAGE_KEY = 'ladungsplaner.theme';

const isTheme = (v: unknown): v is ThemeName => v === 'forest' || v === 'warm';

/** Тема из хранилища. Любое неизвестное значение и любой отказ хранилища (Safari private mode
 *  бросает на доступе) — `forest`: тема не то, ради чего стоит падать. */
export function readTheme(): ThemeName {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : 'forest';
  } catch {
    return 'forest';
  }
}

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

// НЕ кэшируем снимок в отдельной переменной, которую обновлял бы только applyTheme: такая
// переменная была бы собственной копией состояния store — ровно тот же класс бага, который мы
// чиним (была на каждый экземпляр хука, стала бы на весь модуль). readTheme() читает
// localStorage заново при каждом вызове, но возвращает ПРИМИТИВ: равные строки Object.is-равны,
// так что предупреждение React "The result of getSnapshot should be cached" сюда не относится —
// оно про свежесобранные объекты/массивы с новой ссылкой на каждый вызов. Проверено эмпирически
// (task-4 fix-report): кэш-переменная реально расходилась с реальностью, когда что-то меняло
// localStorage/DOM в обход applyTheme (в тестах — beforeEach; в браузере — теоретически другая
// вкладка).
function getSnapshot(): ThemeName {
  return readTheme();
}

export function applyTheme(name: ThemeName): void {
  const root = document.documentElement;
  if (name === 'forest') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', name);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch {
    // Не смогли запомнить — тема всё равно применена на эту сессию.
  }
  listeners.forEach((fn) => fn());
}

// Синхронизировать DOM с сохранённой темой один раз при загрузке модуля, а не при каждом монтаже
// компонента — так атрибут выставлен ещё до первого рендера любого потребителя.
applyTheme(readTheme());

export function useTheme(): [ThemeName, (next: ThemeName) => void] {
  const theme = useSyncExternalStore(subscribe, getSnapshot);
  const setTheme = useCallback((next: ThemeName) => {
    applyTheme(next);
  }, []);
  return [theme, setTheme];
}
