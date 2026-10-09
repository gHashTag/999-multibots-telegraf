import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * THE AGENT LANE STREAMS ITS ANSWER (spec bot-agent-stream.t27).
 *
 * The rules and the draft itself are tested in src/spec/bot-agent-stream.test.ts.
 * This pins that the bot's agent lane uses them: a draft per turn, the
 * relay's text and stop wired to it, the draft closed on every way out, a
 * stop answered with what was written, the stop press routed, and the update
 * asked of Telegram.
 */
const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8')
const lane = read('navigation/registerCommands.ts')

describe('the agent lane streams its answer', () => {
  it('starts a draft and hands it the text and the stop', () => {
    const at = lane.indexOf('draft = startAnswerDraft(ctx)')
    expect(at).toBeGreaterThan(-1)
    const callAt = lane.indexOf('спроситьАгента(', at) // cyrillic-ok: pre-existing identifier
    // To the end of the call: `})` alone on its line, not a spread's `{})`.
    const call = lane.slice(at, lane.indexOf('\n          })', callAt))
    expect(call).toContain('onText: soFar => draft?.grow(soFar)')
    expect(call).toContain('signal: draft.signal')
  })

  it('closes the draft with the typing indicator', () => {
    expect(lane).toMatch(/стоп\(\)\s*\n\s*draft\?\.close\(\)/) // cyrillic-ok: pre-existing identifier
  })

  it('answers a stop with what was written, before any fallback', () => {
    const at = lane.indexOf('if (draft?.stopped)')
    expect(at).toBeGreaterThan(-1)
    const fallback = lane.indexOf('miss = missOfError(err)')
    expect(at).toBeLessThan(fallback)
    expect(lane.slice(at, fallback)).toContain('afterStop(partial.length)')
  })

  it('routes the stop press before the handlers', () => {
    expect(lane).toContain('bot.use(draftStopMiddleware)')
    expect(lane.indexOf('bot.use(draftStopMiddleware)')).toBeLessThan(
      lane.indexOf('bot.use(topicThreadMiddleware)')
    )
  })

  it('asks Telegram for the stop update', () => {
    expect(read('index.ts')).toContain("'stopped_message_generation'")
  })
})
