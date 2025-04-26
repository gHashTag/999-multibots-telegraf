import { defineConfig } from 'vite'
import { resolve } from 'path'
import checker from 'vite-plugin-checker'
import tsconfigPaths from 'vite-tsconfig-paths'
import dts from 'vite-plugin-dts'
import { visualizer } from 'rollup-plugin-visualizer'
import compression from 'vite-plugin-compression'
import banner from 'vite-plugin-banner'
import inspect from 'vite-plugin-inspect'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { VitePluginNode } from 'vite-plugin-node'

// Доступ к package.json
import { readFileSync } from 'fs'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Определение баннера для выходных файлов
const bannerContent = `/**
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * (c) ${new Date().getFullYear()}
 * ${pkg.license ? `Released under the ${pkg.license} License.` : ''}
 */`

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
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
  ]

  return {
    root: process.cwd(),
    plugins: [
      nodePolyfills({
        protocolImports: true,
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        // Только стандартные модули
        include: ['buffer', 'process', 'util'],
      }),
      ...VitePluginNode({
        adapter: 'express',
        appPath: './src/bot.ts',
        exportName: 'viteNodeApp',
        tsCompiler: 'esbuild',
      }),
      checker({
        typescript: true,
      }),
      tsconfigPaths(),
      dts({
        outDir: 'dist/types',
        exclude: [
          '**/__tests__/**',
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/__mocks__/**',
        ],
      }),
      compression(),
      banner(bannerContent),
      inspect(),
      visualizer({
        open: false,
        gzipSize: true,
        brotliSize: true,
        filename: 'dist/stats.html',
      }),
    ],

    // Улучшенная конфигурация разрешения модулей
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        telegraf: resolve(__dirname, 'node_modules/telegraf/lib'),
        'node-fetch': resolve(
          __dirname,
          'node_modules/node-fetch/lib/index.js'
        ),
        'form-data': resolve(
          __dirname,
          'node_modules/form-data/lib/form_data.js'
        ),
        winston: resolve(__dirname, 'node_modules/winston/lib/winston.js'),
        // Заглушка для fs/promises
        'fs/promises': resolve(
          __dirname,
          'node_modules/node-stdlib-browser/mock/empty.js'
        ),
      },
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
        external: ['fsevents', ...nodeBuiltins, 'fs/promises'],
        output: {
          format: 'es',
          esModule: true,
          interop: 'auto',
        },
      },
    },

    // Оптимизация зависимостей
    optimizeDeps: {
      include: [
        'telegraf',
        'winston',
        'node-fetch',
        'dotenv',
        '@supabase/supabase-js',
        'replicate',
      ],
      exclude: ['fsevents', ...nodeBuiltins, 'fs/promises'],
      esbuildOptions: {
        platform: 'node',
        target: 'node18',
        format: 'esm',
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
      external: [...nodeBuiltins, 'fs/promises'],
    },

    define: {
      __APP_ENV__: JSON.stringify(process.env.APP_ENV || mode),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __IS_DEV__: JSON.stringify(mode !== 'production'),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    appType: 'custom',

    // Конфигурация тестирования (интегрированная из vitest.config.ts)
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
