// Адрес логотипа (контракт ERP §7): `/assets` на проде кэшируется год как immutable, поэтому оболочка
// ERP кладёт на <html> атрибут `data-logo-v` с версией файла, и страница добавляет её параметром.
// Обычная сборка атрибута не ставит, BASE_URL у неё '/', — адрес прежний: '/logo.svg'.
export function logoUrl(doc: Document = document): string {
  const base = `${import.meta.env.BASE_URL}logo.svg`;
  const v = doc.documentElement.getAttribute('data-logo-v');
  return v === null ? base : `${base}?v=${encodeURIComponent(v)}`;
}
