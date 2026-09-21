/**
 * A REEL WITH NO FOOTAGE USED TO BE ACCEPTED, THEN DIE IN SILENCE.
 *
 * Measured in production 2026-09-21 while walking every tool the DM surface
 * offers. Asked for a reel from a still picture; `reel_render` came back with
 *
 *   {"готово": false,
 *    "renderId": "aee823b0-8780-4dec-8ba5-941be5a2645c",
 *    "причина": "рендер упал: No `src` was passed to <OffthreadVideo>."}
 *
 * Three things had to be true at once for that to happen:
 *
 *   1. NoirReel plays `lipSyncVideo` full-frame -- it IS the reel -- and its
 *      defaultProps in Root.tsx carry `lipSyncVideo: ''`. So a request that
 *      omits the track renders the empty string.
 *   2. `NoirReelSchema` said `z.string()`, and `''` is a string.
 *   3. Nobody ran the schema. The registry of checked compositions had exactly
 *      one row (SplitTalkingHead), and the check that reads it sat inline in
 *      POST /render -- while the agent goes through POST /render/template,
 *      which checked nothing beyond "compositionId is non-empty".
 *
 * So the request was accepted with a 202 and a renderId, the person in the DM
 * waited, and the answer arrived minutes later as a failure. Pinned here: the
 * empty track is refused, the refusal names the field, and BOTH doors apply
 * the one checker.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NoirReelSchema } from './src/compositions/NoirReel'
import {
  CHECKED_COMPOSITIONS,
  templateSchemaProblem,
} from './src/template-check'

const REAL = 'https://example.com/lipsync.mp4'

describe('NoirReel without a lipsync track', () => {
  it('is refused when the track is missing', () => {
    expect(NoirReelSchema.safeParse({}).success).toBe(false)
  })

  it('is refused when the track is the empty string', () => {
    // The exact value Root.tsx hands over when the caller says nothing.
    expect(NoirReelSchema.safeParse({ lipSyncVideo: '' }).success).toBe(false)
  })

  it('is accepted with a real track and nothing else', () => {
    // Everything else on this schema has a default -- so the empty track was
    // the single reason the reel could not be built, and the single thing the
    // caller was never told.
    expect(NoirReelSchema.safeParse({ lipSyncVideo: REAL }).success).toBe(true)
  })

  it('refuses a cutaway with no source as well', () => {
    // Same <OffthreadVideo>, same crash: one sourceless cutaway takes the
    // whole render down, not just its own seconds.
    const r = NoirReelSchema.safeParse({
      lipSyncVideo: REAL,
      cutaways: [{ src: '', startFrame: 0, durationFrames: 30 }],
    })
    expect(r.success).toBe(false)
  })
})

describe('the checker both render routes use', () => {
  it('knows NoirReel at all', () => {
    // The row that was missing. Its absence is the whole defect above.
    expect(Object.keys(CHECKED_COMPOSITIONS)).toContain('NoirReel')
    expect(Object.keys(CHECKED_COMPOSITIONS)).toContain('SplitTalkingHead')
  })

  it('names the FIELD in the reason, not just "wrong shape"', () => {
    const why = templateSchemaProblem('NoirReel', { lipSyncVideo: '' })
    expect(why).toBeTruthy()
    // Without the field name the agent guesses -- and a guess costs another
    // render.
    expect(why).toContain('lipSyncVideo')
  })

  it('says nothing about a request that is fine', () => {
    expect(templateSchemaProblem('NoirReel', { lipSyncVideo: REAL })).toBeNull()
  })

  it('lets an unchecked composition through instead of guessing', () => {
    // A composition with no schema must not be refused by the absence of one.
    expect(templateSchemaProblem('LeelaPlanReel', {})).toBeNull()
  })
})

describe('both doors into a render', () => {
  const SERVER = fs.readFileSync(
    path.join(__dirname, 'render-server.ts'),
    'utf8'
  )

  it('apply the same checker', () => {
    // Two call sites, one rule. The second one is the point of this change:
    // POST /render/template is what `reel_render` posts to.
    const calls = SERVER.split('templateSchemaProblem(').length - 1
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  it('refuse the template request BEFORE handing out a renderId', () => {
    // A renderId already given is a promise, and reel_render then holds the
    // turn for up to six minutes waiting on work that cannot succeed.
    const check = SERVER.indexOf('const problem = templateSchemaProblem(')
    const accepted = SERVER.indexOf('Render started. Use SSE endpoint')
    expect(check).toBeGreaterThan(-1)
    expect(accepted).toBeGreaterThan(-1)
    expect(check).toBeLessThan(accepted)
  })
})
