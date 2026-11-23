import { describe, it, expect } from 'vitest';
import { deskUrl, loginUrl } from './erpUrls';
import { sessionExpiredSignal } from './sessionSignal';

describe('адреса ERP (контракт §7)', () => {
  it('ссылки строятся от origin ERP', () => {
    expect(deskUrl('https://erp.holz-schaefer.de')).toBe('https://erp.holz-schaefer.de/app');
    expect(loginUrl('https://erp.holz-schaefer.de', '/ladungsplaner?x=1'))
      .toBe('https://erp.holz-schaefer.de/login?redirect-to=%2Fladungsplaner%3Fx%3D1');
  });
});

describe('sessionExpiredSignal', () => {
  it('notify зовёт подписчиков; отписка снимает подписку', () => {
    const signal = sessionExpiredSignal();
    let calls = 0;
    const off = signal.subscribe(() => calls++);
    signal.notify();
    off();
    signal.notify();
    expect(calls).toBe(1);
  });
});
