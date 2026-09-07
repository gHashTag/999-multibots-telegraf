import { describe, it, expect } from 'vitest'
import { markSurface } from '@/services/trinityAgent'

/**
 * WHERE A TURN CAME FROM, MADE VISIBLE IN THE BOT.
 *
 * The bot has no transcript of its own to annotate: the Telegram chat IS the
 * transcript, and turns typed in the mini app or on the phone never appeared in
 * it at all. The only place the origin can become visible here is the context
 * the model reads.
 *
 * Two ways to get this wrong, and the second is the quiet one:
 *
 *   nothing is marked, and the agent treats a line from another device as its
 *   own conversation;
 *   EVERYTHING is marked, and every turn of every prompt carries a bracket the
 *   model has to read past -- and may start echoing back at the person.
 */

describe('marking where a user turn came from', () => {
  it('another surface is named', () => {
    expect(markSurface('hello', 'user', 'miniapp')).toBe('[из мини-аппа] hello')
    expect(markSurface('hello', 'user', 'ios')).toBe('[с телефона] hello')
    expect(markSurface('hello', 'user', 'agent')).toBe(
      '[по ключу агента] hello'
    )
  })

  it('the bot itself is never marked -- it would be on every single line', () => {
    expect(markSurface('hello', 'user', 'bot')).toBe('hello')
  })

  /*
   * `unknown` is the column default: a turn written before this existed or by a
   * client that did not name itself. Inventing "from somewhere" would put a
   * claim into the model's context that nothing supports.
   */
  it('unknown and missing are left exactly as they are', () => {
    expect(markSurface('hello', 'user', 'unknown')).toBe('hello')
    expect(markSurface('hello', 'user', undefined)).toBe('hello')
    expect(markSurface('hello', 'user', '')).toBe('hello')
  })

  /*
   * An assistant turn is ours wherever it was delivered. Marking it would tell
   * the model that its own past replies came from somewhere else.
   */
  it('an assistant turn is never marked, whatever its surface says', () => {
    expect(markSurface('my answer', 'assistant', 'ios')).toBe('my answer')
    expect(markSurface('my answer', 'assistant', 'miniapp')).toBe('my answer')
  })

  it('the text itself is untouched', () => {
    const text = 'a line with [brackets] and\nnewlines'
    expect(markSurface(text, 'user', 'ios')).toBe('[с телефона] ' + text)
  })
})
