import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.{ts,tsx}',
      'tests/**/*.test.ts',
      // Тесты локальных eslint-правил лежат рядом с правилами (LKWkalk-y5j).
      'tools/eslint/**/*.test.js',
    ],
    environmentMatchGlobs: [['apps/web/**', 'jsdom']],
    setupFiles: ['apps/web/src/test-setup.ts'],
    // 20 с вместо умолчания в 5 (LKWkalk-3c5, LKWkalk-bmi). Компонентные тесты `apps/web` печатают
    // посимвольно настоящим `userEvent` и ждут debounce на настоящих таймерах — один тест законно
    // занимает секунды, а когда 63 файла идут разом, пять секунд не выдерживал никто конкретный:
    // таймаут выпадал каждый прогон в другом файле (SetupScreen, App, LadeplanScreen, WarehouseFloor),
    // и каждый упавший был зелёным в одиночном прогоне.
    // Хуже самого таймаута его последствия: упавший по таймауту тест оставляет живое React-дерево,
    // чьё асинхронное продолжение пишет в localStorage ПОСЛЕ того, как `afterEach` его почистил, —
    // и следующий тест видит восстановленный план вместо пустого экрана. Одно ложное падение рождало
    // горсть таких же. Мерж в main = выкладка на прод (ADR 023), гейт обязан говорить о коде.
    testTimeout: 20000,
  },
});
