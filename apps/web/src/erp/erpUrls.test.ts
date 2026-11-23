import { describe, it, expect } from 'vitest';
import { deskUrl, loginUrl } from './erpUrls';
import { sessionExpiredSignal, sessionSignal } from './sessionSignal';

describe('адреса ERP (контракт §7)', () => {
  it('ссылки строятся от origin ERP', () => {
    expect(deskUrl('https://erp.holz-schaefer.de')).toBe('https://erp.holz-schaefer.de/app');
    expect(loginUrl('https://erp.holz-schaefer.de', '/ladungsplaner?x=1'))
      .toBe('https://erp.holz-schaefer.de/login?redirect-to=%2Fladungsplaner%3Fx%3D1');
  });

  it('обратный адрес начинается ровно с одного / и остаётся на этом хосте', () => {
    const back = (r: string) => new URL(loginUrl('https://erp.holz-schaefer.de', r)).searchParams.get('redirect-to');
    expect(back('//evil.example/x')).toBe('/evil.example/x');
    expect(back('/\\evil.example/x')).toBe('/evil.example/x');
    expect(back('\\\\evil.example')).toBe('/evil.example');
    expect(back('https://evil.example/')).toBe('/https://evil.example/');
    expect(back('')).toBe('/');
    expect(back('/ladungsplaner?x=1')).toBe('/ladungsplaner?x=1');
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

describe('sessionSignal', () => {
  it('отдельные сигналы не делят подписчиков', () => {
    const a = sessionSignal();
    const b = sessionSignal();
    let calls = 0;
    a.subscribe(() => calls++);
    b.notify();
    expect(calls).toBe(0);
  });
});
