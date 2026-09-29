import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.tamagui` is codegen the bundler emits (esbuild prelude, vendored
  // helpers that carry their own eslint-disable comments). It is not the
  // person's code and is reborn on every dependency bump -- the tamagui
  // 1.142.0 bump made its directives severity-2 errors ("rule not found",
  // the config registers rules for ts/tsx only) and broke the lint ratchet
  // for everybody pushing off main. Lint sources, not their output.
  globalIgnores(['dist', '.tamagui']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
