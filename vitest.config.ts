import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build'],
    testTimeout: 30000,
    hookTimeout: 30000,
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
