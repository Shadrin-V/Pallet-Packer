// Сборка программы для встраивания в ERP (контракт erp-y6tb9 §7, бид lp-erp-build): без index.html —
// оболочку отдаёт ERP; здесь только ES-модуль и стили с ПОСТОЯННЫМИ именами (версию в адрес ставит
// ERP) и логотип из `public/`. Это первый проход `build:erp`; второй (`vite.erp-motor.config.ts`)
// добавляет `lkw_motor.js` и пишет паспорт `HERKUNFT.json` по всем четырём файлам (ADR 027, поправка
// 2026-11-25). Проверка — `npm run verify:erp`.
//
// ERP пересобирает артефакт на своей машине и сравнивает побайтово, поэтому входы сборки берутся только
// из коммита, не из окружения машины (круг ревью 1, находка 1):
// - режим — всегда production: Vite 6 уважает уже выставленный `NODE_ENV`, и при `NODE_ENV=development`
//   вышла бы dev-сборка React с абсолютными путями исходников в `ladungsplaner.js`. Vite читает
//   `NODE_ENV` для `isProduction` и `process.env.NODE_ENV` бандла ПОСЛЕ загрузки этого файла;
// - PostCSS задан здесь же, а не `postcss.config.js` (он остаётся у обычной сборки): браузеры autoprefixer
//   — явный `ERP_BROWSERSLIST` (тогда `.browserslistrc`/`package.json` в родительских каталогах и
//   `BROWSERSLIST*` не читаются), сетка — явно выключена (иначе её включает `AUTOPREFIXER_GRID`).
// Проверка устойчивости — вторая сборка `verify:erp` во «враждебном» окружении (`hostileBuildEnv`).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { ERP_BASE, ERP_BROWSERSLIST } from './build/erpArtifact';

process.env.NODE_ENV = 'production';

export default defineConfig({
  mode: 'production',
  // Паспорт здесь не пишется: его пишет второй проход, когда в каталоге уже все четыре файла.
  plugins: [react()],
  base: ERP_BASE,
  css: {
    postcss: {
      plugins: [tailwindcss({}), autoprefixer({ overrideBrowserslist: [...ERP_BROWSERSLIST], grid: false })],
    },
  },
  build: {
    outDir: 'dist-erp',
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: 'src/main.erp.tsx',
      output: {
        format: 'es',
        entryFileNames: 'ladungsplaner.js',
        assetFileNames: 'ladungsplaner[extname]',
        inlineDynamicImports: true,
      },
    },
  },
});
