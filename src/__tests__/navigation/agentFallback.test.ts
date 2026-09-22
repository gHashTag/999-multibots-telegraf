import { describe, it, expect } from 'vitest'
import { inspect } from 'node:util'
import {
  fallbackFailedText,
  fallbackMessages,
  fallbackSystemPrompt,
  honestMissLine,
  missOfEmptyAnswer,
  missOfError,
  recentTurns,
  replyInRussian,
  FALLBACK_HISTORY_TURNS,
  FALLBACK_TURN_CHARS,
} from '@/navigation/helpers/agentFallback'
import {
  historyOf,
  markReportedByAgent,
  markTurnHistory,
  markTurnTools,
  reportedByAgent,
} from '@/services/agentTurnSpend'

/**
 * The rules behind the bot chat's answer when the agent misses a turn, one
 * decision at a time. The routing through the real chain is pinned in
 * anEmptyAnswerNeverReachesTheToollessModel.test.ts; these are the edges it
 * would take a dozen bot runs to reach.
 */
const CYRILLIC = new RegExp('[\\u0400-\\u04FF]')

describe('which way the agent missed', () => {
  it('a plain failure is unreachable: the toolless fallback may answer', () => {
    expect(missOfError(new TypeError('fetch failed'))).toEqual({
      kind: 'unreachable',
    })
    expect(missOfError('not even an error')).toEqual({ kind: 'unreachable' })
  })

  it('a failure the render reported is an empty turn, not an outage', () => {
    const e = markReportedByAgent(new Error('<no model provider answered>'))
    expect(reportedByAgent(e)).toBe(true)
    expect(missOfError(e)).toEqual({ kind: 'empty', spent: false })
    // The mark changes nothing a classifier reads.
    expect((e as Error).message).toBe('<no model provider answered>')
  })

  it('a turn that already spent money is never handed to a model over its head', () => {
    const e = markTurnTools(new Error('This operation was aborted'), [
      'my_assets',
      'image_edit',
    ])
    expect(missOfError(e)).toEqual({ kind: 'empty', spent: true })
    // Read-only tools spend nothing.
    const readOnly = markTurnTools(new Error('aborted'), ['my_assets'])
    expect(missOfError(readOnly)).toEqual({ kind: 'unreachable' })
  })

  it('an empty answer is spent only when a paying tool ran', () => {
    expect(missOfEmptyAnswer(['my_assets', 'my_renders'])).toEqual({
      kind: 'empty',
      spent: false,
    })
    expect(missOfEmptyAnswer(['video_generate'])).toEqual({
      kind: 'empty',
      spent: true,
    })
    expect(missOfEmptyAnswer(undefined)).toEqual({
      kind: 'empty',
      spent: false,
    })
  })
})

describe('the reply language follows the person', () => {
  it('a Cyrillic line is answered in Russian whatever the profile says', () => {
    expect(replyInRussian('сделай рилс', false)).toBe(true)
    expect(replyInRussian('сделай рилс', true)).toBe(true)
  })

  it('a bare link is not a language: the profile decides', () => {
    const link = 'https://www.instagram.com/p/abc/'
    expect(replyInRussian(link, true)).toBe(true)
    expect(replyInRussian(link, false)).toBe(false)
  })

  it('a Latin line keeps the language the bot already knows for them', () => {
    expect(replyInRussian('what can you do?', false)).toBe(false)
    expect(replyInRussian('what can you do?', true)).toBe(true)
  })

  it('every line of the path is in that language', () => {
    for (const spent of [false, true]) {
      expect(honestMissLine(true, spent)).toMatch(CYRILLIC)
      expect(honestMissLine(false, spent)).not.toMatch(CYRILLIC)
    }
    for (const why of ['rate limit 429', 'invalid api key', 'boom']) {
      expect(fallbackFailedText(true, why)).toMatch(CYRILLIC)
      expect(fallbackFailedText(false, why)).not.toMatch(CYRILLIC)
    }
  })

  it('the prompt names the reply language first and last', () => {
    const ru = fallbackSystemPrompt(true).split('\n')
    const en = fallbackSystemPrompt(false).split('\n')
    expect(ru[0]).toBe('Язык ответа: русский.')
    expect(ru[ru.length - 1].startsWith('Отвечай только по-русски')).toBe(true)
    expect(en[0]).toBe('Reply language: English.')
    expect(en[en.length - 1]).toMatch(/^Reply only in English/)
    expect(fallbackSystemPrompt(false)).not.toMatch(CYRILLIC)
  })

  it('the apology still tells the causes apart', () => {
    expect(fallbackFailedText(false, 'zai: 429')).toContain('overloaded')
    expect(fallbackFailedText(false, 'OpenAI 401 Unauthorized')).toContain(
      'invalid key'
    )
    expect(fallbackFailedText(false, 'Replicate timeout')).toContain(
      'Something broke'
    )
  })
})

describe('the context the fallback gets', () => {
  it('the history the failed call read travels on the error, and only there', () => {
    const past = [{ role: 'user', content: 'a' }]
    const e = markTurnHistory(new Error('x'), past)
    expect(historyOf(e)).toEqual(past)
    expect(historyOf(new Error('x'))).toEqual([])
    expect(historyOf(undefined)).toEqual([])
  })

  it('an error logged whole does not print the conversation it carries', () => {
    const e = markTurnHistory(new Error('fetch failed'), [
      { role: 'user', content: 'PRIVATE-TRANSCRIPT-LINE' },
    ])
    expect(historyOf(e)).toHaveLength(1)
    expect(inspect(e)).not.toContain('PRIVATE-TRANSCRIPT-LINE')
    expect(JSON.stringify({ error: e })).not.toContain('PRIVATE-TRANSCRIPT')
  })

  it('bounded by count and by length, user and assistant turns only', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `turn ${i}`,
    }))
    const kept = recentTurns([
      { role: 'system', content: 'not for the fallback' },
      { role: 'tool', content: '{"secret":1}' },
      { role: 'user', content: '   ' },
      ...many,
    ])
    expect(kept).toHaveLength(FALLBACK_HISTORY_TURNS)
    expect(kept.map(t => t.content)).toEqual(
      many.slice(-FALLBACK_HISTORY_TURNS).map(t => t.content)
    )
    const long = recentTurns([
      { role: 'user', content: 'x'.repeat(FALLBACK_TURN_CHARS * 3) },
    ])
    expect(long[0].content.length).toBe(FALLBACK_TURN_CHARS + 1)
  })

  it('the messages are: prompt, the last turns, then the question', () => {
    const agentError = markTurnHistory(new Error('fetch failed'), [
      { role: 'user', content: 'make a reel' },
      { role: 'assistant', content: 'Send three photos.' },
    ])
    expect(
      fallbackMessages({ isRu: false, text: 'where is it?', agentError })
    ).toEqual([
      { role: 'system', content: fallbackSystemPrompt(false) },
      { role: 'user', content: 'make a reel' },
      { role: 'assistant', content: 'Send three photos.' },
      { role: 'user', content: 'where is it?' },
    ])
    // Without an error carrying history: the prompt and the question only.
    expect(fallbackMessages({ isRu: true, text: 'q' })).toHaveLength(2)
  })
})
