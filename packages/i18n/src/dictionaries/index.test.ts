import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from '../index';
import { TRANSLATION_KEYS } from '../keys';
import { DICTIONARIES } from './index';

describe('DICTIONARIES completeness (ADR 006)', () => {
  it('has an entry for every supported locale', () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it('de dictionary defines exactly the canonical keys, no more or fewer', () => {
    expect(Object.keys(DICTIONARIES.de).sort()).toEqual([...TRANSLATION_KEYS].sort());
  });

  it('ru dictionary defines exactly the canonical keys, no more or fewer', () => {
    expect(Object.keys(DICTIONARIES.ru).sort()).toEqual([...TRANSLATION_KEYS].sort());
  });

  it('every key has non-empty text in de and ru', () => {
    for (const key of TRANSLATION_KEYS) {
      expect(DICTIONARIES.de[key].trim().length).toBeGreaterThan(0);
      expect(DICTIONARIES.ru[key].trim().length).toBeGreaterThan(0);
    }
  });

  it('translates every engine validation error code into both locales (acceptance criterion)', () => {
    const errorCodes = TRANSLATION_KEYS.filter((key) => key.startsWith('ERR_'));
    expect(errorCodes).toEqual([
      'ERR_INVALID_DIMENSION',
      'ERR_CARGO_EXCEEDS_VEHICLE',
      'ERR_INVALID_QUANTITY',
      'ERR_INVALID_NESTING',
      'ERR_INVALID_ROTATION',
      'ERR_EMPTY_LOAD',
      'ERR_UNKNOWN_VEHICLE',
      // manual layout edits (contract 0.12.0, ADR 019) — the UI must be able to say why an edit
      // was refused, so these need a translation just as much as the validation codes
      'ERR_EDIT_NO_STACK',
      'ERR_EDIT_OVERLAP',
      'ERR_EDIT_OUT_OF_BOUNDS',
      'ERR_EDIT_FORK_ACCESS',
      'ERR_EDIT_ROTATION',
      'ERR_EDIT_NOTHING_TO_PLACE',
    ]);
    for (const code of errorCodes) {
      expect(DICTIONARIES.de[code]).toBeTruthy();
      expect(DICTIONARIES.ru[code]).toBeTruthy();
    }
  });

  it('spot-checks known translations to catch locale mix-ups', () => {
    expect(DICTIONARIES.de['action.calculate']).toBe('Berechnen');
    expect(DICTIONARIES.ru['action.calculate']).toBe('Рассчитать');
    expect(DICTIONARIES.de['unit.mm']).toBe('mm');
    expect(DICTIONARIES.ru['unit.mm']).toBe('мм');
    expect(DICTIONARIES.de.ERR_EMPTY_LOAD).toBe('Die Ladeliste ist leer.');
    expect(DICTIONARIES.ru.ERR_EMPTY_LOAD).toBe('Список груза пуст.');
  });
});
