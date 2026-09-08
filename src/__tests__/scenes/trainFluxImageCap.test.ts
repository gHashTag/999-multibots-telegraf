/**
 * trainFluxModelWizard collects training photos as full Buffers in
 * ctx.session.images — the same per-process volatile map of sessionStore (Buffers never reach Redis; bot.ts calls
 * session() with no store / TTL / eviction) shared by the one process that runs
 * every bot. It caps each image's SIZE (10MB) and the /done step enforces a
 * MINIMUM of 10 images, but the photo handler had NO maximum on the COUNT — a
 * user could keep sending photos past 10, each a fresh Buffer, climbing RSS
 * until the container OOM-kills the whole multi-bot process. Same class as
 * morphingWizard (#1145) and aiPhotoshopScene (#1147). This pins a count cap
 * that rejects before the push.
 *
 * Source-level seam test: the push is deep inside a WizardScene step with a
 * download; it pins the guard's presence and position at the source. Mutation
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
  'trainFluxModelWizard',
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

describe('training image collector caps the number of images (OOM guard)', () => {
  it('defines a positive image-count ceiling above the 10-image minimum', () => {
    const s = code()
    const m = s.match(/const MAX_TRAINING_IMAGES = (\d+)/)
    expect(m, 'no MAX_TRAINING_IMAGES cap').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(10) // /done needs >= 10
  })

  it('rejects (returns) once the cap is reached, BEFORE pushing another buffer', () => {
    const s = code()
    const guard = s.search(
      /if \(ctx\.session\.images\.length >= MAX_TRAINING_IMAGES\)/
    )
    expect(guard, 'no length-cap guard on session.images').toBeGreaterThan(-1)

    // The guard must return, and must sit before the push that grows the array.
    const afterGuard = s.slice(guard, guard + 600)
    expect(/\breturn\b/.test(afterGuard), 'the cap guard does not return').toBe(
      true
    )
    const push = s.indexOf('ctx.session.images.push(')
    expect(push, 'no push found').toBeGreaterThan(-1)
    expect(guard, 'the cap guard runs after the push').toBeLessThan(push)
  })
})
