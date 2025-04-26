import { defineConfig, loadEnv } from 'vite'
import { VitePluginNode } from 'vite-plugin-node'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'node:path'
import nodeResolve from '@rollup/plugin-node-resolve'
import checker from 'vite-plugin-checker'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Загружаем переменные окружения в зависимости от режима
  const env = loadEnv(mode, process.cwd(), '')
  const isProduction = mode === 'production'

  console.log(`🌍 [Vite] Запуск в режиме: ${mode}`)
  console.log(`🔧 [Vite] Команда: ${command}`)

  // Стандартные Node.js модули, которые должны быть исключены из бандла
  const nodeBuiltins = [
    'fs',
    'path',
    'os',
    'crypto',
    'stream',
    'http',
    'https',
    'url',
    'util',
    'zlib',
    'querystring',
    'net',
    'tls',
    'dns',
    'events',
    'buffer',
    'assert',
    'child_process',
    'worker_threads',
    'cluster',
    'module',
    'process',
    'readline',
    'string_decoder',
    'timers',
    'tty',
    'perf_hooks',
    'fs/promises',
  ]

  return {
    // Base directory for resolving modules
    root: './',

    // Resolve aliases
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // Используем node: префикс для встроенных модулей Node.js
        'node:fs': 'fs',
        fs: 'node:fs',
        'fs/promises': 'node:fs/promises',
        path: 'node:path',
        os: 'node:os',
        crypto: 'node:crypto',
        buffer: 'node:buffer',
        stream: 'node:stream',
      },
      // Предпочитаем ESM
      mainFields: ['module', 'jsnext:main', 'jsnext', 'main'],
      // Улучшенное разрешение расширений
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    },

    // Optimizations
    optimizeDeps: {
      // Exclude problematic dependencies
      exclude: [
        '@total-typescript/ts-reset',
        '@telegraf/types',
        'fsevents',
        ...nodeBuiltins,
      ],
      // Принудительное pre-bundling для улучшения производительности
      force: true,
      // Используем ESBuild для оптимизации зависимостей
      esbuildOptions: {
        // Поддержка Node.js глобальных переменных и модулей
        platform: 'node',
        // Целевая версия Node.js
        target: 'node18',
        // Поддержка формата ESM
        format: 'esm',
        // Работаем с ESM
        mainFields: ['module', 'main'],
        // Обрабатываем как ESM модули
        loader: {
          '.js': 'jsx',
          '.ts': 'tsx',
          '.mjs': 'js',
        },
      },
    },

    // Определение глобальных переменных, доступных в коде
    define: {
      __APP_ENV__: JSON.stringify(env.APP_ENV || mode),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __IS_DEV__: JSON.stringify(!isProduction),
      // Исправление предупреждений CJS/ESM
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    // Configure development server
    server: {
      port: 3000,
      hmr: {
        // Более агрессивное обновление модулей для Node.js
        timeout: 1000,
      },
      watch: {
        // Отслеживаем изменения с более коротким интервалом
        usePolling: process.platform === 'win32' || process.env.WSL === 'true',
        interval: 300,
      },
    },

    build: {
      // Output directory for production build
      outDir: 'dist',

      // Target Node.js environment (соответствует версии Node на сервере)
      target: 'node18',

      // Don't minify for better debugging in production
      minify: isProduction ? 'esbuild' : false,

      // Clean output directory before build
      emptyOutDir: true,

      // Включаем сорсмапы
      sourcemap: true,

      // Use ESM by default with CJS fallback
      rollupOptions: {
        output: {
          format: 'esm',
          // Добавляем CJS экспорт для совместимости
          exports: 'named',
          generatedCode: {
            constBindings: true,
          },
        },
        external: [
          // Внешние зависимости и Node.js модули
          ...nodeBuiltins,
          'telegraf',
          'mongoose',
          '@supabase/supabase-js',
          'node-fetch',
          'archiver',
        ],
        plugins: [
          // Улучшенное разрешение Node.js модулей
          nodeResolve({
            preferBuiltins: true,
            browser: false,
            modulesOnly: false,
          }),
        ],
      },
    },

    // Улучшенный режим совместимости
    appType: 'custom',

    plugins: [
      // Node.js polyfills for built-in modules
      nodePolyfills({
        // Whether to polyfill specific modules
        include: [
          'path',
          'fs',
          'events',
          'crypto',
          'buffer',
          'util',
          'stream',
          'http',
          'url',
        ],

        // Use global variables like process, Buffer, etc.
        globals: {
          process: true,
          Buffer: true,
          global: true,
        },
        // Улучшенные опции совместимости
        overrides: {
          fs: 'node:fs',
          path: 'node:path',
          os: 'node:os',
        },
      }),

      // TypeScript checker
      checker({
        typescript: true,
        eslint: {
          lintCommand: 'eslint "./src/**/*.ts"',
        },
      }),

      // Node.js app support
      ...VitePluginNode({
        // Используем express адаптер
        adapter: 'express',

        // Application entry point
        appPath: './src/bot.ts',

        // Имя экспорта из файла приложения
        exportName: 'startBot',

        // Запускать приложение при старте Vite
        initAppOnBoot: false,

        // Компилятор TypeScript
        tsCompiler: 'esbuild',

        // Опции swc для обработки специфичных для Node.js возможностей TypeScript
        swcOptions: {
          jsc: {
            target: 'es2022',
            parser: {
              syntax: 'typescript',
              decorators: true,
            },
            transform: {
              legacyDecorator: true,
              decoratorMetadata: true,
            },
          },
        },
      }),
    ],

    // Test configuration (integrated from vitest.config.ts)
    test: {
      globals: true,
      environment: 'node',
      setupFiles: ['src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/**/*.ts'],
        exclude: [
          'src/**/*.test.ts',
          '__tests__/**/*.test.ts',
          'src/mocks/**/*.ts',
          'src/test/**/*.ts',
          'node_modules/**',
          'dist/**',
        ],
      },
      reporters: ['default', 'html'],
      outputFile: {
        html: './html/index.html',
      },
    },
  }
})
