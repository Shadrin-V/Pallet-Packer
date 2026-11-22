import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { unbindDrafts } from './lib/draftStorage';

// Vitest runs without globals, so @testing-library's auto-cleanup afterEach isn't registered.
// Register it here so each test starts with a fresh DOM. Also clear localStorage so persisted
// setup/locale state does not leak between tests, and drop any user binding of the storage module
// (lib/draftStorage) — the next test starts in the ordinary, unbound mode.
afterEach(() => {
  cleanup();
  unbindDrafts();
  try {
    globalThis.localStorage?.clear();
  } catch {
    /* jsdom without localStorage — ignore */
  }
});
