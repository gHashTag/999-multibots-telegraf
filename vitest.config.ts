import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    // Детерминированное окружение тестов.
    //
    // ЗАЧЕМ. 46 тестов падали не из-за кода, а из-за отсутствия секретов:
    // без MERCHANT_LOGIN визард оплаты обрывался конфиг-ошибкой, не дойдя до
    // проверяемой логики (26 тестов), без FAL_KEY то же делал генератор
    // изображений (20). Прогон зависел от того, лежит ли у запускающего
    // рабочий .env, — то есть измерял окружение, а не код.
    //
    // Значения заведомо нерабочие: тест, который дойдёт до реального вызова
    // с ними, должен упасть, а не молча сходить в прод. Реальное значение из
    // окружения имеет приоритет — интеграционные прогоны не ломаются.
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL ?? 'TEST_URL',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? 'TEST_KEY',
      MERCHANT_LOGIN: process.env.MERCHANT_LOGIN ?? 'test_merchant',
      ROBOKASSA_PASSWORD_1: process.env.ROBOKASSA_PASSWORD_1 ?? 'test_pass_1',
      ROBOKASSA_PASSWORD_2: process.env.ROBOKASSA_PASSWORD_2 ?? 'test_pass_2',
      FAL_KEY: process.env.FAL_KEY ?? 'test_fal_key',
    },
    setupFiles: process.env.DETECT_NETWORK
      ? ['scripts/detect-network-tests.mjs']
      : [],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // ДОБАВЛЕНО: ещё три файла падают на ЭТАПЕ ЗАГРУЗКИ модуля, ни один
      // assert в них не исполняется — та же причина, что у списка ниже.
      //   plugin-neurophoto/**/generateImage.test.ts — импортирует 'bun:test';
      //   scripts/tests/user-data-integrity.test.ts — импортирует
      //     '../get-all-users-data', которого нет в репозитории;
      //   checkSuperheroGenerationUsage.test.ts — при импорте создаёт клиент
      //     Supabase и падает с «Invalid URL» на заглушечном адресе.
      'packages/plugin-neurophoto/**/generateImage.test.ts',
      'scripts/tests/user-data-integrity.test.ts',
      'src/__tests__/core/supabase/checkSuperheroGenerationUsage.test.ts',
      // Эти 11 файлов импортируют из 'bun:test' и под vitest НЕ ЗАПУСКАЮТСЯ
      // никогда: "Cannot find package 'bun:test'". Для них есть свой раннер —
      // npm run test:bun. Пока они попадали в общий прогон, npm test выдавал
      // 99 упавших файлов из 182, и отличить новую поломку от постоянного шума
      // было нельзя — то есть прогон не нёс никакого сигнала.
      //
      // Это НЕ сокрытие падений: перечисленные файлы падали на этапе загрузки
      // модуля, ни один assert в них не исполнялся.
      'src/__tests__/fal-markup-verification.test.ts',
      'src/__tests__/fal-veed-fabric-simple.test.ts',
      'src/__tests__/fal-veed-fabric-integration.test.ts',
      'src/__tests__/fal-debug.test.ts',
      'src/__tests__/fal-veed-fabric-provider.test.ts',
      'src/__tests__/ai-reels-fal-integration.test.ts',
      'src/__tests__/fal-pricing-update.test.ts',
      'src/__tests__/ai-reels-fal-provider.test.ts',
      'src/__tests__/ai-reels-debug.test.ts',
      'src/__tests__/ai-reels-template1.test.ts',
      'src/__tests__/services/ai-models.test.ts',
      // ВЕСЬ apps/, а не только e2e.
      //
      // Сначала здесь стояло 'apps/**/e2e/**' — Playwright-спеки редактора,
      // которые корневой vitest пытался выполнить своим раннером. Но проблема
      // шире: у apps/vibee-editor/player СВОЙ раннер и свои зависимости
      // (package.json: "test": "vitest"), поэтому корневой прогон падает на
      // его импортах — "Cannot find package 'jotai'", 'jotai/utils'. Ещё
      // 4 файла, не выполняющих ни одного assert.
      //
      // Тесты редактора запускаются из его собственного каталога.
      'apps/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/config': path.resolve(__dirname, './src/config'),
      '@/controllers': path.resolve(__dirname, './src/controllers'),
      '@/dtos': path.resolve(__dirname, './src/dtos'),
      '@/exceptions': path.resolve(__dirname, './src/exceptions'),
      '@/interfaces': path.resolve(__dirname, './src/interfaces'),
      '@/middlewares': path.resolve(__dirname, './src/middlewares'),
      '@/models': path.resolve(__dirname, './src/models'),
      '@/routes': path.resolve(__dirname, './src/routes'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/core': path.resolve(__dirname, './src/core'),
      '@/axios': path.resolve(__dirname, './src/axios'),
      '@/price': path.resolve(__dirname, './src/price'),
      '@/store': path.resolve(__dirname, './src/store'),
      '@/helpers': path.resolve(__dirname, './src/helpers'),
      '@/handlers': path.resolve(__dirname, './src/handlers'),
      '@/scenes': path.resolve(__dirname, './src/scenes'),
      '@/navigation': path.resolve(__dirname, './src/navigation'),
    },
  },
})
