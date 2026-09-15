import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  PRESET_CAPS,
  PRESET_VALUES,
  BATCH_PRESETS,
} from '@/services/crmSweepScope'

/**
 * THE NUMBER ON THE BUTTON AND THE NUMBER THE QUEUE TAKES ARE ONE NUMBER.
 *
 * The overview button reads "🔥 Горячие (10 из 47)", and that 10 comes from
 * the RENDER: segmentCaps() travels in the summary payload. The press then
 * builds a queue whose length comes from the BOT: PRESET_CAPS in
 * crmSweepScope.ts. Two tables, in two services, with nothing between them.
 *
 * Today they agree. If they drift, the owner is promised ten people and gets
 * five -- or presses once and is handed twenty cards. Same shape as a message
 * naming a command nobody registered, and as a deadline the code no longer
 * uses: a promise whose truth lives somewhere else.
 *
 * Read from the render's source rather than imported: the bot does not bundle
 * the render, and this is the same way the money guards read render-server.ts.
 */
describe('the cap on the button is the cap the queue takes', () => {
  const renderSrc = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      'apps',
      'vibee-editor',
      'render',
      'src',
      'agent',
      'crm-segments.ts'
    ),
    'utf8'
  )

  /** SEGMENT_CAPS_DEFAULT as the render declares it. */
  const renderCaps = (): Record<string, number> => {
    const block = /SEGMENT_CAPS_DEFAULT[^=]*=\s*\{([^}]*)\}/.exec(renderSrc)
    expect(
      block,
      'SEGMENT_CAPS_DEFAULT is not where this test expects it'
    ).toBeTruthy()
    const out: Record<string, number> = {}
    for (const m of block![1].matchAll(/([a-z]+)\s*:\s*(\d+)/g)) {
      out[m[1]] = Number(m[2])
    }
    return out
  }

  it('reads both tables at all (a broken reader fails, not passes)', () => {
    const caps = renderCaps()
    expect(Object.keys(caps).length).toBeGreaterThan(5)
    expect(Object.keys(PRESET_CAPS).length).toBeGreaterThan(5)
  })

  it('every preset the queue can take has the render cap', () => {
    const caps = renderCaps()
    const disagree = PRESET_VALUES.filter(p => caps[p] !== PRESET_CAPS[p]).map(
      p => `${p}: button ${caps[p]} vs queue ${PRESET_CAPS[p]}`
    )
    expect(
      disagree,
      'the button promises one number of people and the queue takes another'
    ).toEqual([])
  })

  it('the segments the bot does NOT queue are the two it refuses on purpose', () => {
    /*
     * Both exclusions are the render's own words, not my reading of them.
     * crm-segments.ts lists the precedence and says of these two:
     *
     *   objection  "an objection this week, not hot -- hand only"
     *   warm       "quiet two to eight weeks ... -- warming", and
     *              BATCH_PRESETS here calls it batch-only, never a queue
     *
     * Pinned so a segment added on the render side cannot quietly arrive
     * with a cap the bot never honours -- and so that dropping one of these
     * two into the queue becomes a decision somebody makes on purpose.
     */
    const caps = renderCaps()
    const missing = Object.keys(caps).filter(
      k => k !== 'day' && !(PRESET_VALUES as readonly string[]).includes(k)
    )
    expect(missing.sort()).toEqual(['objection', ...BATCH_PRESETS].sort())
  })
})
