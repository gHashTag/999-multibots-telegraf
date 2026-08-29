/**
 * neuroPhotoWizardV2 must not crash when the session has no trained model.
 *
 * V1 (neuroPhotoWizard) guards `ctx.session.userModel` before using it; the V2
 * rewrite dropped that and dereferenced `ctx.session.userModel.trigger_word`
 * straight away, so a user who reaches the prompt step without a model in
 * session crashed the step (the #1027 stale/missing-session class).
 *
 * The step reaches Supabase and the model service, so this asserts the guard
 * structurally, mutation-checked: the `if (!ctx.session.userModel ...)` check
 * must come BEFORE the `trigger_word` dereference.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

describe('neuroPhotoWizardV2 guards a missing userModel', () => {
  const src = fs.readFileSync('src/scenes/neuroPhotoWizardV2/index.ts', 'utf8')

  it('checks userModel before dereferencing trigger_word', () => {
    const guardIdx = src.search(/if \(!ctx\.session\.userModel \|\|/)
    const derefIdx = src.indexOf('ctx.session.userModel.trigger_word as string')
    expect(guardIdx, 'no userModel guard').toBeGreaterThan(-1)
    expect(derefIdx, 'trigger_word deref not found').toBeGreaterThan(-1)
    expect(guardIdx, 'guard must come before the deref').toBeLessThan(derefIdx)
  })
})
