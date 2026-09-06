import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // ONE CACHE PER TREE, NOT ONE CACHE FOR ALL OF THEM.
  //
  // Vite defaults cacheDir to <root>/node_modules/.vite. In a git worktree
  // node_modules is a SYMLINK to the main checkout, so that path resolves to
  // the main checkout's directory and every worktree writes into the same
  // cache. Measured: 25 worktrees on 25 branches sharing one.
  //
  // That is shared mutable state between branches, which is the wrong default
  // for a repository several agents work in at once. This puts the cache in a
  // real directory inside the tree that owns it, where a branch cannot inherit
  // another branch's optimized dependencies.
  //
  // Not claimed: that this caused any specific failure. What is claimed is that
  // 25 trees sharing one cache is a channel that should not exist, and closing
  // it costs one re-optimisation per tree.
  cacheDir: path.resolve(__dirname, '.vite-cache'),
  test: {
    globals: true,
    // Deterministic test environment (complements vitest.setup.ts, which sets
    // FAL_KEY only).
    //
    // WHY. 46 tests failed for want of secrets rather than because of the
    // code: without MERCHANT_LOGIN the payment wizard aborted with a config
    // error before reaching the logic under test (26 tests), and without
    // FAL_KEY the image generator did the same (20). The run depended on
    // whether the person running it had a working .env — it measured the
    // environment, not the code.
    //
    // The values are deliberately non-working: a test that reaches a real
    // call with them must fail rather than quietly talk to production. A real
    // value from the environment wins, so integration runs still work.
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL ?? 'TEST_URL',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? 'TEST_KEY',
      MERCHANT_LOGIN: process.env.MERCHANT_LOGIN ?? 'test_merchant',
      ROBOKASSA_PASSWORD_1: process.env.ROBOKASSA_PASSWORD_1 ?? 'test_pass_1',
      ROBOKASSA_PASSWORD_2: process.env.ROBOKASSA_PASSWORD_2 ?? 'test_pass_2',
      FAL_KEY: process.env.FAL_KEY ?? 'test_fal_key',
      KIE_AI_API_KEY: process.env.KIE_AI_API_KEY ?? 'test_kie_key',
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY ?? 'test_eleven_key',
    },
    setupFiles: [
      // Фиктивные env для юнит-тестов (FAL_KEY и пр.): сервисы проверяют
      // ключ на входе, до моков — без этого чистые тесты падают (43 шт).
      './vitest.setup.ts',
      ...(process.env.DETECT_NETWORK
        ? ['scripts/detect-network-tests.mjs']
        : []),
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      /**
       * РАБОЧИЕ КОПИИ АГЕНТОВ — НЕ ЧАСТЬ ПРОЕКТА.
       *
       * `.claude/worktrees/<id>` заводит воркфлоу с изоляцией; они должны
       * убираться сами, но убираются не всегда. Двенадцать оставшихся копий
       * весили 5,1 ГБ и ПОПАДАЛИ В ПРОГОН: `bun run verify` шёл больше
       * пятнадцати минут вместо ста секунд (весь набор запускался дважды) и
       * падал с «Cannot find package 'bun:test'» — в копии не тот
       * `node_modules`.
       *
       * Ни одна из тех поломок не относилась к коду: все 12 упавших файлов
       * лежали в `.claude/worktrees/wf_78a9fb44-5be-1`. То есть единственная
       * замена CI показывала красное из-за собственного мусора инструмента —
       * ровно тот случай, когда проверка перестаёт нести сигнал.
       */
      '.claude/worktrees/**',
      // Three more files fail at MODULE LOAD, so not one assertion in them
      // ever runs — the same reason as the list below:
      //   plugin-neurophoto/**/generateImage.test.ts imports 'bun:test';
      //   scripts/tests/user-data-integrity.test.ts imports
      //     '../get-all-users-data', which is not in the repository;
      //   checkSuperheroGenerationUsage.test.ts builds a Supabase client at
      //     import time and dies with "Invalid URL" on the placeholder host.
      'packages/plugin-neurophoto/**/generateImage.test.ts',
      'scripts/tests/user-data-integrity.test.ts',
      'src/__tests__/core/supabase/checkSuperheroGenerationUsage.test.ts',
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
      // The player has its OWN runner (apps/vibee-editor/player) with a jsdom
      // environment and its own dependencies. After the exclusion above was
      // narrowed, its unit tests joined the root run, whose environment is
      // node, and 34 of them failed on "localStorage is not defined". The
      // render-server tests the narrowing was for stay included. The player
      // tests are not lost: `bun run test:player` runs them (105 tests,
      // jsdom) as its own CI step.
      'apps/vibee-editor/player/**',
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
