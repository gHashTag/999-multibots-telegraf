/**
 * handleVideoReady (handleTextToVideoDirect.ts) charges MONEY_OUTCOME after
 * delivering the generated video, but discarded the updateUserBalance result.
 * updateUserBalance returns false (never throws) on a schema/insert failure or
 * a ghost-payer with no users row, so on a charge failure the user got the
 * video for free, silently. The video is already delivered, so there is no
 * refund to make — the fix checks the result and logs the unbilled delivery
 * instead of discarding it.
 *
 * Source-level seam test. Mutation — discarding the charge result again — fails
 * it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'handlers',
  'handleTextToVideoDirect.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('handleVideoReady checks its charge result (no silent free video)', () => {
  it('assigns the MONEY_OUTCOME charge result and reacts to a failure', () => {
    const s = code()
    const charge = s.match(
      /const charged = await updateUserBalance\([\s\S]{0,200}?MONEY_OUTCOME/
    )
    expect(
      charge,
      'the video charge result is silently discarded'
    ).not.toBeNull()
    const guard = s.search(/if \(!charged\)/)
    expect(guard, 'a failed video charge is not handled').toBeGreaterThan(-1)
  })
})
