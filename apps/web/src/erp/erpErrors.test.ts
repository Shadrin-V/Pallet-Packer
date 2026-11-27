import { describe, expect, it } from 'vitest';
import { t } from '@shadrin-v/i18n';
import { ERP_ERROR_CODES, erpErrorKey, errorCodeOf, isSessionChanged, isSessionExpired } from './erpErrors';

describe('erpErrors', () => {
  it('неизвестный код, строка и Error → общий текст; известный код → он же', () => {
    expect(erpErrorKey({ code: 'ERR_SOMETHING_NEW' })).toBe('erp.error.generic');
    expect(erpErrorKey('boom')).toBe('erp.error.generic');
    expect(erpErrorKey(new Error('x'))).toBe('erp.error.generic');
    expect(erpErrorKey({ code: 'ERR_TRIP_NOT_FOUND' })).toBe('ERR_TRIP_NOT_FOUND');
    expect(isSessionExpired({ code: 'ERR_NOT_LOGGED_IN' })).toBe(true);
  });

  it('ERR_FORBIDDEN: без doctype — нет доступа к планировщику; с Purchase Order — скрытый заказ в рейсе', () => {
    expect(erpErrorKey({ code: 'ERR_FORBIDDEN' })).toBe('ERR_FORBIDDEN');
    expect(erpErrorKey({ code: 'ERR_FORBIDDEN', details: { doctype: 'Purchase Order' } })).toBe('erp.forbidden.hiddenOrder');
    expect(erpErrorKey({ code: 'ERR_FORBIDDEN', details: { doctype: 'LKW-Disposition' } })).toBe('ERR_FORBIDDEN');
  });

  it('каждый код ERP переводится сам в себя; служебные коды провайдера — общий текст', () => {
    for (const code of ERP_ERROR_CODES) {
      if (code !== 'ERR_FORBIDDEN') expect(erpErrorKey({ code, details: { doctype: 'Purchase Order' } })).toBe(code);
      expect(erpErrorKey({ code })).toBe(code);
    }
    for (const code of ['ERR_HTTP', 'ERR_BAD_RESPONSE', 'ERR_UNSUPPORTED']) {
      expect(erpErrorKey({ code })).toBe('erp.error.generic');
    }
  });

  it('errorCodeOf и isSessionExpired не падают на чём угодно', () => {
    for (const x of [undefined, null, 0, 'ERR_NOT_LOGGED_IN', [], { code: 5 }, new Error('ERR_NOT_LOGGED_IN')]) {
      expect(errorCodeOf(x)).toBeUndefined();
      expect(isSessionExpired(x)).toBe(false);
      expect(erpErrorKey(x)).toBe('erp.error.generic');
    }
    expect(errorCodeOf({ code: 'ERR_HTTP', details: { status: 502 } })).toBe('ERR_HTTP');
    expect(isSessionExpired({ code: 'ERR_FORBIDDEN' })).toBe(false);
  });

  // Контракт §4 п. 1 и §5: «нет» и «нельзя читать» неразличимы — подпись не утверждает, что рейса
  // или строки не существует, и не называет документов.
  it('тексты рейса и строки не утверждают «не существует»', () => {
    for (const key of ['ERR_TRIP_NOT_FOUND', 'ERR_LINE_NOT_FOUND'] as const) {
      expect(t(key, 'de')).not.toMatch(/gibt es nicht|existiert nicht/i);
      expect(t(key, 'ru')).not.toMatch(/не существует/i);
    }
    expect(t('ERR_TRIP_NOT_FOUND', 'de')).toContain('keine Berechtigung');
    expect(t('ERR_LINE_NOT_FOUND', 'de')).toContain('nicht sichtbar');
    expect(t('ERR_TRIP_NOT_FOUND', 'ru')).toContain('нет прав');
  });

  it('смена сессии (код программы, контракт §1): свой текст и свой признак', () => {
    expect(erpErrorKey({ code: 'ERR_SESSION_CHANGED' })).toBe('ERR_SESSION_CHANGED');
    expect(isSessionChanged({ code: 'ERR_SESSION_CHANGED' })).toBe(true);
    expect(isSessionChanged({ code: 'ERR_NOT_LOGGED_IN' })).toBe(false);
    expect(isSessionChanged('ERR_SESSION_CHANGED')).toBe(false);
    expect(isSessionExpired({ code: 'ERR_SESSION_CHANGED' })).toBe(false);
    expect(t('ERR_SESSION_CHANGED', 'de')).toContain('anderer Benutzer');
    expect(t('ERR_SESSION_CHANGED', 'ru')).toContain('другой пользователь');
  });
});
