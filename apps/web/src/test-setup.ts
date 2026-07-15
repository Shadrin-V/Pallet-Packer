import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals, so @testing-library's auto-cleanup afterEach isn't registered.
// Register it here so each test starts with a fresh DOM.
afterEach(() => cleanup());
