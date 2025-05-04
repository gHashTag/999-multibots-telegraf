import { defineConfig } from 'vitest/config'
import path from 'path'
// import * as viteTsconfigPathsModule from 'vite-tsconfig-paths' // Removed

// const viteTsconfigPaths = viteTsconfigPathsModule.default || viteTsconfigPathsModule; // Removed

export default defineConfig({
  // plugins: [viteTsconfigPaths()], // Removed plugin
  test: {
    globals: true, // Enable global APIs like vi, describe, it
    environment: 'node', // Or 'jsdom' if testing browser-like env
    // Add setup files if needed (similar to jest.setup.js)
    setupFiles: ['src/__tests__/setup.ts'], // Load .env.test variables
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
      exclude: [
        'src/interfaces/**',
        'src/types/**',
        'src/config/**',
        'src/__tests__/**',
        'src/**/*.d.ts',
        'src/bot.ts', // Usually excluded as it's the entry point
        'src/server.ts', // If you have a separate server entry point
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // vite-tsconfig-paths should handle other paths from tsconfig.json
    },
  },
})
