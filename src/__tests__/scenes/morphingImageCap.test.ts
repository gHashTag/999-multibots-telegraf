/**
 * The morphing image collector keeps every uploaded photo as a full Buffer in
 * the per-process volatile map of sessionStore (Buffers are never written to Redis /
 * TTL / eviction), shared by the one process that runs every bot. It caps each
 * image's SIZE (10MB) but used to have no cap on the COUNT — a subscriber could
 * keep sending photos (the step returns to itself and collection is free until
 * the later charge), climbing RSS until the container OOM-kills the whole
 * multi-bot process. This pins a count cap that rejects before the push.
 *
 * Source-level seam test: the collector's push is deep inside a WizardScene step
 * with album handling and a download, so it pins the guard's presence and
 * position at the source, which a refactor could silently drop. Mutation
 * (removing the guard, dropping the return, or moving the cap after the push)
 * fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'scenes',
  'morphingWizard',
  'index.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('morphing image collector caps the number of images (OOM guard)', () => {
  it('defines a positive image-count ceiling', () => {
    const s = code()
    const m = s.match(/const MAX_MORPHING_IMAGES = (\d+)/)
    expect(m, 'no MAX_MORPHING_IMAGES cap').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(1) // morph needs >= 2 images
  })

  it('rejects (returns) once the cap is reached, BEFORE pushing another buffer', () => {
    const s = code()
    const guard = s.search(
      /if \(ctx\.session\.morphingImages\.length >= MAX_MORPHING_IMAGES\)/
    )
    expect(guard, 'no length-cap guard on morphingImages').toBeGreaterThan(-1)

    // The guard must return, and must sit before the push that grows the array.
    const afterGuard = s.slice(guard, guard + 600)
    expect(/\breturn\b/.test(afterGuard), 'the cap guard does not return').toBe(
      true
    )
    const push = s.indexOf('ctx.session.morphingImages.push(')
    expect(push, 'no push found').toBeGreaterThan(-1)
    expect(guard, 'the cap guard runs after the push').toBeLessThan(push)
  })
})
