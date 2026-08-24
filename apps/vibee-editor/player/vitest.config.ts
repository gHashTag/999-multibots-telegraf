import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    /**
     * Playwright-спеки живут в e2e/ и запускаются СВОИМ раннером
     * (`npm run test:e2e`). Vitest подхватывал их вместе со своими и падал
     * десять раз подряд с «Playwright Test did not expect test.describe() to
     * be called here» — то есть половина красных файлов в прогоне не имела
     * отношения к коду.
     *
     * Граница проведена по каталогу с собственным раннером, а не по маске
     * имён: имена меняются, а «у этого каталога свой запуск» — свойство
     * устойчивое.
     */
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'e2e/**',
      '**/*.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/*.test.{ts,tsx}',
      ],
    },
  },
  resolve: {
    /**
     * `preserveSymlinks` — та же болезнь, что чинит `symlinks: false` в
     * бандлере рендера: пакет `@vibee/atoms` приходит симлинком на
     * ../packages, и без флага резолвер идёт по РЕАЛЬНОМУ пути, ища jotai
     * оттуда — то есть поднимаясь до корня репозитория, где его нет.
     * С флагом резолв идёт от симлинка и находит jotai рядом, в
     * node_modules плеера.
     */
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
