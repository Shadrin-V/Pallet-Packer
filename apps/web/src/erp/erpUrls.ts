// Адреса ERP, которые строит страница (контракт ERP §7): «Zurück zum ERP» → `<origin>/app`;
// вход → `<origin>/login?redirect-to=<путь и строка запроса текущей страницы>`.

export function deskUrl(origin: string): string {
  return new URL('app', `${origin}/`).href;
}

export function loginUrl(origin: string, returnTo: string): string {
  const url = new URL('login', `${origin}/`);
  url.searchParams.set('redirect-to', returnTo);
  return url.href;
}
