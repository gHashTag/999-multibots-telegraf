import { defineConfig } from 'vitest/config'

/**
 * A run of ONE leaking test under the render's network guard, made by
 * no-test-reaches-the-network.test.ts in a child process: the run must fail.
 * Its file is not a *.test.ts, so the render suite never collects it.
 */
export default defineConfig({
  test: {
    include: ['leaks.fixture.ts'],
    setupFiles: ['../no-network.ts'],
  },
})
