// Единственная дверь программы в хранилище браузера (контракт ERP §7, бид lp-draft-scope).
//
// Обычная сборка хранение не привязывает: ключи — прежние базовые (`ladungsplaner.setup` …), и
// чтение/запись идут ровно тогда и туда же, что и до этого модуля. Сборка для ERP вызывает
// `bindDraftsToUser(user)`: с этого момента ВСЁ хранение программы (черновик, план, настройки вида)
// живёт под `ladungsplaner.u.<encodeURIComponent(user)>.<имя>`, а безымянные и чужие черновики при
// входе удаляются — на общем офисном компьютере один сотрудник не видит черновик другого.
//
// Исключения хранилища (Safari private, квота) read/write/remove НЕ глотают: вызывающие держат свой
// try/catch, как держали до модуля, — так поведение при сбое тоже осталось прежним.
//
// Инвариант: имя ключа (база без `ladungsplaner.`) не содержит точки. encodeURIComponent точку не
// кодирует, поэтому пользователь в ключе отделяется от имени ПОСЛЕДНЕЙ точкой; точка в имени
// сделала бы ключ неразбираемым.

export type StorageBaseKey = `ladungsplaner.${string}`;

/** Безымянные черновики, которые вход пользователя удаляет (настройки вида — не черновик). */
export const DRAFT_BASE_KEYS = [
  'ladungsplaner.setup',
  'ladungsplaner.load',
  'ladungsplaner.orderColors',
  'ladungsplaner.strategy',
  'ladungsplaner.planContext',
] as const;

export const USER_PREFIX = 'ladungsplaner.u.';
const BASE_PREFIX = 'ladungsplaner.';

let user: string | null = null;
let locked = false;

const store = (): Storage | undefined => globalThis.localStorage;

export function storageKey(base: StorageBaseKey): string {
  if (user === null) return base;
  return `${USER_PREFIX}${encodeURIComponent(user)}.${base.slice(BASE_PREFIX.length)}`;
}

export function readStored(base: StorageBaseKey): string | null {
  return store()?.getItem(storageKey(base)) ?? null;
}

export function writeStored(base: StorageBaseKey, value: string): void {
  if (locked) return;
  store()?.setItem(storageKey(base), value);
}

export function removeStored(base: StorageBaseKey): void {
  if (locked) return;
  store()?.removeItem(storageKey(base));
}

/** Закодированный пользователь из ключа под USER_PREFIX; null — ключ не пользовательский. */
function encodedUserOf(key: string): string | null {
  if (!key.startsWith(USER_PREFIX)) return null;
  const rest = key.slice(USER_PREFIX.length);
  const dot = rest.lastIndexOf('.');
  return dot < 0 ? rest : rest.slice(0, dot);
}

export function bindDraftsToUser(nextUser: string): void {
  user = nextUser;
  locked = false;
  try {
    const s = store();
    if (!s) return;
    const own = encodeURIComponent(nextUser);
    const doomed: string[] = [...DRAFT_BASE_KEYS];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key === null) continue;
      const encoded = encodedUserOf(key);
      if (encoded !== null && encoded !== own) doomed.push(key);
    }
    for (const key of doomed) s.removeItem(key);
  } catch {
    /* хранилище недоступно — удалять нечего */
  }
}

export function unbindDrafts(): void {
  user = null;
  locked = false;
}

export function lockDrafts(): void {
  locked = true;
}

export function boundUser(): string | null {
  return user;
}

/** Без привязки любой пользовательский ключ — чужой: обычная сборка под USER_PREFIX не пишет. */
export function isForeignUserKey(key: string | null): boolean {
  if (key === null) return false;
  const encoded = encodedUserOf(key);
  if (encoded === null) return false;
  return user === null || encoded !== encodeURIComponent(user);
}
