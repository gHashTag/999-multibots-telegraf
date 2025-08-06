import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
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
      '@/handlers': path.resolve(__dirname, './src/handlers'),
      '@/helpers': path.resolve(__dirname, './src/helpers'),
      '@/scripts': path.resolve(__dirname, './src/scripts'),
    },
  },
})
