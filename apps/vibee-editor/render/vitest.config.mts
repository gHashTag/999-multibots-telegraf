import { defineConfig } from 'vitest/config'

/**
 * Test runner for the render service.
 *
 * WHY THIS FILE EXISTS. The package's `test` script pointed at the repository
 * root config, and that config cannot be loaded at all right now: vite bundles
 * it as CJS and the resulting `require('vitest/config')` reaches an ESM-only
 * vite, so every run dies with ERR_REQUIRE_ESM before collecting a single
 * file. Reproduced in the main checkout, not only in a worktree — so the
 * security tests of this service (auth, session, pairing, projects) could not
 * be run by the documented command by anyone.
 *
 * WHY `.mts` RATHER THAN `.ts`. The extension is the fix: it makes vite load
 * the config as a real ES module instead of bundling it to CJS, which is the
 * exact step that was failing. Renaming the ROOT config would have fixed more,
 * and is deliberately not done here — it changes how every other package's
 * tests are collected, and that belongs in its own change with its own
 * before/after run, not smuggled in beside a feature.
 *
 * Precedent, not a new convention: `apps/vibee-editor/player` already carries
 * its own config for the same reason — a package with its own dependencies
 * runs its own tests.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    // e2e specs here belong to Playwright and fail on load under vitest.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.spec.ts', 'e2e/**'],
  },
})
