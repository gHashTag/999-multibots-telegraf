/**
 * Hero-validation error messages must use the user's language, not a stub.
 *
 * handleHeroValidationError builds every message as `isRu ? Russian : English`
 * but hardcoded isRu to a constant true (a stub), so an English-language user who
 * failed hero validation in avatarTransformScene got Russian error text. ctx is a
 * parameter, so the language is available.
 *
 * The method calls ctx.reply / a redirect, so this asserts the fix structurally,
 * mutation-checked: the stub is gone and isRu comes from the context.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync('src/services/HeroValidationService.ts', 'utf8')

describe('hero-validation errors respect the user language', () => {
  it('does not hardcode isRu to a constant', () => {
    expect(SRC).not.toContain('const isRu = true')
  })
  it('derives isRu from the context', () => {
    expect(SRC).toMatch(/const isRu = isRussianFromState\(ctx\)/)
    expect(SRC).toMatch(/import \{ isRussianFromState \}/)
  })
})
