const { defineConfig } = require('vitest/config')
const { resolve } = require('path')

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
    },
    
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        'telegraf/typings/scenes/context': resolve(__dirname, 'node_modules/telegraf/lib/scenes/context'),
      },
    },
  },
}) 