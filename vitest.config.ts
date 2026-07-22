import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    environmentMatchGlobs: [['apps/web/**', 'jsdom']],
    setupFiles: ['apps/web/src/test-setup.ts'],
  },
});
