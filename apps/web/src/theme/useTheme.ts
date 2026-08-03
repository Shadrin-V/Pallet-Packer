// Тема = фирменная палитра, не светлая/тёмная (ADR 025). Обе палитры светлые; `forest` —
// умолчание и живёт в голом `:root`, поэтому для неё атрибут СНИМАЕТСЯ, а не ставится в
// 'forest': так каскад имеет ровно один источник умолчания.
import { useCallback, useState } from 'react';

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

export function applyTheme(name: ThemeName): void {
  const root = document.documentElement;
  if (name === 'forest') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', name);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch {
    // Не смогли запомнить — тема всё равно применена на эту сессию.
  }
}

export function useTheme(): [ThemeName, (next: ThemeName) => void] {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const t = readTheme();
    applyTheme(t);
    return t;
  });
  const setTheme = useCallback((next: ThemeName) => {
    applyTheme(next);
    setThemeState(next);
  }, []);
  return [theme, setTheme];
}
