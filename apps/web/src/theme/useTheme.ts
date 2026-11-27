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

// Литерал повторён в apps/web/index.html — инлайновый bootstrap-скрипт в <head> читает тот же
// ключ синхронно, до первой отрисовки, чтобы у warm-пользователя не мелькал зелёный --paper
// forest на первом кадре (initTheme() из main.tsx выполняется только после разбора этого
// модуля — финальное ревью, находка 6). Меняешь ключ здесь — поменяй и там.
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

// Снимок берём из DOM-атрибута, а не из localStorage (ревью, finding 3): applyTheme пишет ДВА
// глобала — атрибут (безусловно, кинуть не может) и localStorage (в try/catch — Safari private
// mode бросает на записи). Если чтение снимка идёт из хранилища, отказ setItem рассинхронизирует
// то, что видит каскад (атрибут уже применён), с тем, что объявляет aria-pressed (снимок всё ещё
// 'forest') — скринридер сказал бы обратное тому, что нарисовано. DOM — то, что реально слушает
// CSS-каскад, кинуть не может и не стоит отдельного обращения к хранилищу на каждый рендер;
// localStorage остаётся слоем персистентности (переживает перезагрузку), DOM — слоем состояния
// (то, что видит React прямо сейчас). НЕ кэшируем снимок в отдельной переменной, которую обновлял
// бы только applyTheme: такая переменная была бы собственной копией состояния store — тот же
// класс бага, который мы чиним, просто с уровня компонента переехавший на уровень модуля (было
// поймано эмпирически на прошлом круге ревью, когда снимок читался из localStorage тем же
// способом). Читаем атрибут заново при каждом вызове, но возвращаем ПРИМИТИВ: равные строки
// Object.is-равны, так что предупреждение React "The result of getSnapshot should be cached" сюда
// не относится — оно про свежесобранные объекты/массивы с новой ссылкой на каждый вызов.
function getSnapshot(): ThemeName {
  const attr = document.documentElement.getAttribute('data-theme');
  return isTheme(attr) ? attr : 'forest';
}

/** Палитра хоста (сборка внутри ERP): не выбор пользователя, а данность оболочки. */
export type HostPalette = 'schaefer';

// Палитра хоста запирает тему: пока она стоит, applyTheme ничего не меняет ни в атрибуте, ни в
// хранилище (контракт §7: в сборке для ERP хранилище содержит только ключи пользователя).
let hostPalette: HostPalette | null = null;

/** Ставит палитру хоста на <html> и запирает её от applyTheme. Хранилища не касается. */
export function applyHostPalette(name: HostPalette): void {
  hostPalette = name;
  document.documentElement.setAttribute('data-theme', name);
  listeners.forEach((fn) => fn());
}

function setThemeAttribute(name: ThemeName): void {
  const root = document.documentElement;
  if (name === 'forest') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', name);
}

export function applyTheme(name: ThemeName): void {
  if (hostPalette) return;
  setThemeAttribute(name);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch {
    // Не смогли запомнить — тема всё равно применена на эту сессию (и снимок это отразит,
    // т.к. берётся из атрибута, а не из этой же строки).
  }
  listeners.forEach((fn) => fn());
}

/** Синхронизирует DOM с сохранённой темой. Вызывается ЯВНО из точки входа обычной сборки
 *  (main.tsx) до первого рендера; сборка для ERP его не вызывает и зовёт applyHostPalette. Импорт
 *  модуля сам ничего не читает и не пишет — ни в хранилище, ни в DOM. Только атрибут, без записи. */
export function initTheme(): void {
  setThemeAttribute(readTheme());
}

export function useTheme(): [ThemeName, (next: ThemeName) => void] {
  const theme = useSyncExternalStore(subscribe, getSnapshot);
  const setTheme = useCallback((next: ThemeName) => {
    applyTheme(next);
  }, []);
  return [theme, setTheme];
}
