import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
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