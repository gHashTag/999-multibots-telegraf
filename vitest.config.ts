import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    setupFiles: [
      // Фиктивные env для юнит-тестов (FAL_KEY и пр.): сервисы проверяют
      // ключ на входе, до моков — без этого чистые тесты падают (43 шт).
      './vitest.setup.ts',
      ...(process.env.DETECT_NETWORK ? ['scripts/detect-network-tests.mjs'] : []),
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      /**
       * apps/** исключён ЦЕЛИКОМ, и это прячет тесты рендер-сервера.
       *
       * Исключение появилось из-за Playwright-спек в apps/, которые корневой
       * прогон подхватывал и ронял на загрузке модуля. Средство оказалось
       * шире болезни: вместе со спеками из прогона выпали auth.test.ts,
       * session.test.ts и всё, что появится рядом.
       *
       * Заметно это стало, когда новый тест ветки сессии не нашёл ни одного
       * файла: у пакета нет своего vitest, а корневой его не видит.
       *
       * Сужаем до того, что и мешало: только Playwright-спеки.
       */
      'apps/**/*.spec.ts',
      'apps/**/e2e/**',
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
