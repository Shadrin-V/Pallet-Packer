// Второй проход `build:erp` (ADR 027, поправка 2026-11-25, erp-y6tb9.15, решение A′): фасад ёмкости
// `src/erp/motor.ts` → `dist-erp/lkw_motor.js` для Desk-страницы ERP. Первый проход (`vite.erp.config.ts`,
// страница) уже положил в `dist-erp/` свои файлы; этот проход их не трогает (`emptyOutDir: false`, без
// `public/`) и после записи пишет паспорт `HERKUNFT.json` по всем четырём файлам (`herkunftPlugin`).
//
// `lkw_motor.js` — один самодостаточный ES-модуль с экспортами фасада: один вход, все зависимости (движок,
// пресеты, подписи) вшиты (`external` не задан), без чанков (`inlineDynamicImports`) и внешних `import`.
// Библиотечную форму (экспорты входа) даёт `preserveEntrySignatures: 'strict'`, а не `build.lib`: в
// библиотечном режиме ES Vite 6 принудительно отключает минификацию пробелов, и в бандле остаются
// комментарии исходников (например, слово `localStorage` из `src/data/presets.ts`), на которых сработал
// бы замок `verify:erp`. Здесь минификация полная, комментарии не выходят (`legalComments: 'none'`).
// Как и у страницы, входы сборки — только из коммита: режим всегда production (вторая сборка
// `verify:erp` идёт с `NODE_ENV=development`).
import { defineConfig } from 'vite';
import { ERP_MOTOR_FILE, herkunftPlugin } from './build/erpArtifact';

process.env.NODE_ENV = 'production';

export default defineConfig({
  mode: 'production',
  plugins: [herkunftPlugin()],
  publicDir: false,
  esbuild: { legalComments: 'none' },
  build: {
    outDir: 'dist-erp',
    emptyOutDir: false,
    copyPublicDir: false,
    minify: 'esbuild',
    modulePreload: false,
    rollupOptions: {
      input: 'src/erp/motor.ts',
      preserveEntrySignatures: 'strict',
      output: {
        format: 'es',
        entryFileNames: ERP_MOTOR_FILE,
        inlineDynamicImports: true,
      },
    },
  },
});
