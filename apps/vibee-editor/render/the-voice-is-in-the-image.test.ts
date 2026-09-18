/**
 * THE OWNER'S VOICE WAS ABSENT FROM PRODUCTION FOR AS LONG AS ANYONE HAD LOOKED.
 *
 * SOUL.md sets the tone of every agent answer and every published post -- "one
 * file sets the voice everywhere" is the whole design. It lived at the
 * repository root, which is ABOVE this service's Docker build context
 * (`apps/vibee-editor`), and Docker cannot COPY above its own context root. So
 * the image never contained it, `soul()` found nothing, and /health reported
 * `ownerVoiceLoaded: false` -- accurately, and for so long that the prompt was
 * taught to stop pointing at a section that was not there.
 *
 * The file now lives in `render/`, which `COPY render/ ./` already carries into
 * the image. This test is the thing that was missing: nothing checked that the
 * voice could reach production, so nothing noticed when it could not.
 *
 * It asserts about LOCATION, not about content, because location is exactly
 * what broke -- and it is a property of the repository, so a text check is the
 * honest tool for it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RENDER = __dirname
const CONTEXT = path.dirname(RENDER) // apps/vibee-editor -- the build context

describe('the voice can reach production', () => {
  it('SOUL.md lives inside the render folder', () => {
    expect(
      fs.existsSync(path.join(RENDER, 'SOUL.md')),
      'SOUL.md is not in apps/vibee-editor/render -- the image will not have it'
    ).toBe(true)
  })

  /*
   * A second copy is worse than a missing one: two files claiming to be the
   * voice drift, and nobody can say which one production answered with.
   */
  it('is the only one, so there is nothing to drift against', () => {
    const repoRoot = path.resolve(CONTEXT, '..', '..')
    expect(fs.existsSync(path.join(repoRoot, 'SOUL.md'))).toBe(false)
    expect(fs.existsSync(path.join(CONTEXT, 'SOUL.md'))).toBe(false)
  })

  /*
   * The build context is the reason this broke. A file one level up looks
   * perfectly reachable in an editor and is invisible to the build.
   */
  it('sits under the build context, which is what Docker can see', () => {
    const soul = path.join(RENDER, 'SOUL.md')
    expect(soul.startsWith(CONTEXT + path.sep)).toBe(true)
  })

  it('is carried by a COPY that is actually in the Dockerfile', () => {
    const dockerfile = fs.readFileSync(path.join(RENDER, 'Dockerfile'), 'utf8')
    // `COPY render/ ./` brings the whole folder, SOUL.md with it.
    expect(dockerfile).toMatch(/^COPY render\/ \.\/$/m)
  })

  it('is not empty, because an empty file loads as no voice at all', () => {
    const text = fs.readFileSync(path.join(RENDER, 'SOUL.md'), 'utf8').trim()
    expect(text.length).toBeGreaterThan(200)
  })
})
