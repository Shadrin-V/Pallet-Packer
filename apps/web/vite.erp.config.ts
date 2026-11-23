// Сборка программы для встраивания в ERP (контракт erp-y6tb9 §7, бид lp-erp-build): без index.html —
// оболочку отдаёт ERP; здесь только ES-модуль и стили с ПОСТОЯННЫМИ именами (версию в адрес ставит
// ERP), логотип из `public/` и паспорт `HERKUNFT.json`. Проверка — `npm run verify:erp`.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ERP_BASE, herkunftPlugin } from './build/erpArtifact';

export default defineConfig({
  plugins: [react(), herkunftPlugin()],
  base: ERP_BASE,
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
