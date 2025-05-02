import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true, // Enable Vitest globals like vi, describe, it, etc.
    environment: 'node', // Specify the environment
  },
})
