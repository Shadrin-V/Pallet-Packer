// Коды ошибок ERP (контракт erp-y6tb9 api-vertrag, §5) → ключи локалей. Сервер текстов не отдаёт;
// неизвестный код, строка, Error и служебные коды провайдера (ERR_HTTP, ERR_BAD_RESPONSE,
// ERR_UNSUPPORTED) показываются общим сбоем и страницу не роняют.
import type { TranslationKey } from '@shadrin-v/i18n';

export const ERP_ERROR_CODES = [
  'ERR_NOT_LOGGED_IN',
  'ERR_FORBIDDEN',
  'ERR_TRIP_NOT_FOUND',
  'ERR_LINE_NOT_FOUND',
  'ERR_ITEM_NOT_FOUND',
  'ERR_VALIDATION',
] as const;
export type ErpErrorCode = (typeof ERP_ERROR_CODES)[number];

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const isErpErrorCode = (x: string): x is ErpErrorCode => (ERP_ERROR_CODES as readonly string[]).includes(x);

/** `code` отказа вида `ApiError`; у всего прочего — `undefined`. */
export function errorCodeOf(err: unknown): string | undefined {
  return isRecord(err) && typeof err.code === 'string' ? err.code : undefined;
}

/**
 * Ключ текста для отказа. `ERR_FORBIDDEN` с `details.doctype === 'Purchase Order'` — рейс читать можно,
 * а один из его заказов нельзя (контракт §4 п. 1); без него — нет роли страницы.
 */
export function erpErrorKey(err: unknown): TranslationKey {
  const code = errorCodeOf(err);
  if (code === undefined || !isErpErrorCode(code)) return 'erp.error.generic';
  if (code === 'ERR_FORBIDDEN') {
    const details = (err as { details?: unknown }).details;
    if (isRecord(details) && details.doctype === 'Purchase Order') return 'erp.forbidden.hiddenOrder';
  }
  return code;
}

/** Сессия ERP истекла: страница показывает «сессия истекла» со ссылкой на вход (контракт §5). */
export function isSessionExpired(err: unknown): boolean {
  return errorCodeOf(err) === 'ERR_NOT_LOGGED_IN';
}
