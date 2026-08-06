// Разбор адреса для deep-link импорта заказа (LKWkalk-s17). Отдельно от SetupScreen и без обращения
// к глобалям: принимает строки, возвращает строки — единственная часть механизма, проверяемая без
// рендера, и самая ошибкоопасная (прочие параметры, пустое значение, висячий «?»).

/** Номер заказа из строки запроса. Пустое значение и одни пробелы — не номер, а отсутствие. */
export function orderParam(search: string): string | null {
  const raw = new URLSearchParams(search).get('order');
  const value = raw?.trim() ?? '';
  return value === '' ? null : value;
}

/**
 * Тот же адрес без `?order=`, прочие параметры и якорь на месте. Возвращается относительная форма
 * (путь + запрос + якорь): `history.replaceState` её понимает, а origin менять мы не вправе.
 */
export function urlWithoutOrderParam(href: string): string {
  const u = new URL(href);
  u.searchParams.delete('order');
  return `${u.pathname}${u.search}${u.hash}`;
}
