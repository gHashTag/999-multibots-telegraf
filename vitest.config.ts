import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths' // For resolving tsconfig paths
import path from 'path' // Import path module for resolving

export default defineConfig({
  plugins: [
    tsconfigPaths({
      root: '.', // Explicitly set the root directory
      projects: ['./tsconfig.json'], // Explicitly point to the tsconfig file
    }),
  ],
  // Add explicit alias resolution for Vitest at the top level
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true, // Enable Jest-like globals (describe, it, expect)
    environment: 'node', // Set the test environment to Node.js
    coverage: {
      provider: 'v8', // Specify the coverage provider
      reporter: ['text', 'json', 'html'], // Coverage report formats
      reportsDirectory: './coverage', // Directory for coverage reports
      include: ['src/**/*.ts'], // Files to include in coverage
      exclude: [
        'src/interfaces/**/*.ts',
        'src/types/**/*.ts',
        'src/bot.ts', // Exclude main bot entry point
        'src/registerCommands.ts', // Exclude command registration
        'src/webhookServer.ts',
        'src/api-server', // Exclude the separate API server
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
      ], // Files/dirs to exclude
    },
  },
})
