import { defineConfig, loadEnv } from 'vite'
import { VitePluginNode } from 'vite-plugin-node'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'node:path'
import nodeResolve from '@rollup/plugin-node-resolve'
import checker from 'vite-plugin-checker'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode, isSsrBuild }) => {
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
    plugins: [
      nodePolyfills({
        protocolImports: true,
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
      ...VitePluginNode({
        adapter: 'express',
        appPath: './src/bot.ts',
        exportName: 'viteNodeApp',
        tsCompiler: 'esbuild',
      }),
      checker({
        typescript: {
          tsconfigPath: './tsconfig.json',
        },
        eslint: {
          lintCommand: 'eslint "./src/**/*.ts"',
        },
      }),
    ],

    // Улучшенная конфигурация разрешения модулей
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        telegraf: resolve(__dirname, 'node_modules/telegraf/lib'),
        // Стратегические алиасы для проблемных модулей
        'node-fetch': resolve(
          __dirname,
          'node_modules/node-fetch/lib/index.js'
        ),
        'form-data': resolve(
          __dirname,
          'node_modules/form-data/lib/form_data.js'
        ),
        winston: resolve(__dirname, 'node_modules/winston/lib/winston.js'),
      },
      // Расширенные настройки разрешения для ESM/CommonJS
      conditions: ['node', 'import', 'default'],
      mainFields: ['module', 'jsnext:main', 'jsnext', 'main'],
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    },

    // Оптимизированные настройки для серверной сборки
    build: {
      target: 'node18',
      outDir: 'dist',
      emptyOutDir: true,
      minify: false,
      sourcemap: 'inline',
      lib: {
        entry: resolve(__dirname, 'src/bot.ts'),
        formats: ['es'],
        fileName: 'bot',
      },
      rollupOptions: {
        external: ['fsevents'],
        output: {
          format: 'es',
          esModule: true,
          interop: 'auto',
        },
      },
    },

    // Оптимизация зависимостей
    optimizeDeps: {
      // Предварительный бандлинг проблемных зависимостей
      include: [
        'telegraf',
        'winston',
        'node-fetch',
        'dotenv',
        '@supabase/supabase-js',
        'replicate',
      ],
      exclude: ['fsevents'],
      esbuildOptions: {
        platform: 'node',
        target: 'node18',
        format: 'esm',
        // Улучшенные настройки для работы с CJS/ESM
        define: {
          'process.env.NODE_ENV': JSON.stringify(
            process.env.NODE_ENV || 'development'
          ),
        },
      },
    },

    // Расширенные серверные настройки для разработки
    server: {
      port: 2999,
      hmr: {
        timeout: 1000,
        protocol: 'ws',
        host: 'localhost',
      },
      watch: {
        usePolling: process.platform === 'win32' || process.env.WSL === 'true',
        interval: 300,
      },
      deps: {
        inline: [
          'telegraf',
          'node-fetch',
          'winston',
          'dotenv',
          '@supabase/supabase-js',
          'replicate',
          'openai',
          'adm-zip',
          'form-data',
          'archiver',
        ],
        optimizer: {
          enabled: true,
          force: true,
          web: {
            enabled: false,
          },
          esbuildOptions: {
            platform: 'node',
            format: 'esm',
            target: 'node18',
          },
        },
      },
      host: true,
      strictPort: true,
    },

    // Специфические настройки для работы с Node.js
    ssr: {
      noExternal: [
        'telegraf',
        'node-fetch',
        '@supabase/supabase-js',
        'replicate',
        'winston',
      ],
    },

    // Base directory for resolving modules
    root: './',

    // Определение глобальных переменных, доступных в коде
    define: {
      __APP_ENV__: JSON.stringify(env.APP_ENV || mode),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __IS_DEV__: JSON.stringify(!isProduction),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    // Улучшенный режим совместимости
    appType: 'custom',

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
