import { describe, it, expect } from 'vitest';
import { DIMENSION_SOURCES } from './dto';

describe('contracts DTOs', () => {
  it('enumerates dimension provenance sources', () => {
    expect(DIMENSION_SOURCES).toEqual(['erpnext-field', 'parsed-name', 'manual', 'unknown']);
  });
});
