import { describe, it, expect } from 'vitest'
import {
  shouldAdoptHistory,
  adoptHistory,
  turnsFromResponse,
} from '@/lib/agentHistory'
import type { Message } from '@/atoms/agentChat'

/**
 * KEEPING THE MINI APP'S HISTORY FRESH.
 *
 * The page fetched once on mount, so a turn written in the bot while the tab
 * stayed open never appeared here and never reached the model -- the next
 * request carries this page's transcript. The fix runs on every return to the
 * tab, which makes the guards below load-bearing: something that runs often
 * must be certain about when NOT to act.
 */

const msg = (role: 'user' | 'assistant', text: string, id = 'x'): Message => ({
  id,
  role,
  text,
})

describe('when the fetched history is adopted', () => {
  it('adopted when the server has turns the page does not', () => {
    expect(
      shouldAdoptHistory({
        server: [{ role: 'user', content: 'from the bot' }],
        local: [msg('assistant', 'welcome')],
        busy: false,
      })
    ).toBe(true)
  })

  /*
   * THE ONE THAT PROTECTS A REPLY IN FLIGHT. While an answer streams, the store
   * holds a half-written assistant message that `sendToAgent` patches by id.
   * Replacing the list mid-stream drops the partial answer in front of the
   * person and leaves the stream writing into an id that no longer exists, so
   * the rest of the reply vanishes silently.
   */
  it('never adopted while an answer is streaming', () => {
    expect(
      shouldAdoptHistory({
        server: [{ role: 'user', content: 'anything' }],
        local: [msg('assistant', 'half written a')],
        busy: true,
      })
    ).toBe(false)
  })

  /*
   * Only a validated response reaches adoption; empty means cleared elsewhere.
   */
  it('adopted when the server confirms an empty conversation', () => {
    expect(
      shouldAdoptHistory({
        server: [],
        local: [msg('user', 'do not lose me')],
        busy: false,
      })
    ).toBe(true)
  })

  /*
   * This runs on every tab focus. Rebuilding an identical list would remount
   * every bubble -- visible flicker and a lost scroll position for nothing.
   */
  it('not adopted when it matches what is already shown', () => {
    const server = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]
    expect(
      shouldAdoptHistory({
        server,
        local: adoptHistory(server),
        busy: false,
      })
    ).toBe(false)
  })

  it('adopted when the server has one more turn than the page', () => {
    const shown = adoptHistory([{ role: 'user', content: 'hello' }])
    expect(
      shouldAdoptHistory({
        server: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'answered in the bot' },
        ],
        local: shown,
        busy: false,
      })
    ).toBe(true)
  })

  it('adopted when a turn at the same position differs', () => {
    expect(
      shouldAdoptHistory({
        server: [{ role: 'user', content: 'edited elsewhere' }],
        local: [msg('user', 'the old text')],
        busy: false,
      })
    ).toBe(true)
  })
})

describe('turning the transcript into what the page renders', () => {
  it('roles map to the two the page knows', () => {
    const out = adoptHistory([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'tool', content: 'c' },
    ])
    expect(out.map(m => m.role)).toEqual(['user', 'assistant', 'assistant'])
    expect(out.map(m => m.text)).toEqual(['a', 'b', 'c'])
  })

  it('ids are stable for the same transcript', () => {
    const server = [{ role: 'user', content: 'a' }]
    expect(adoptHistory(server).map(m => m.id)).toEqual(
      adoptHistory(server).map(m => m.id)
    )
  })
})

describe('reading the response body', () => {
  /*
   * Unknown responses must not become an authoritative empty conversation.
   */
  it('anything that is not a messages array yields nothing', () => {
    expect(turnsFromResponse(null)).toBeNull()
    expect(turnsFromResponse({})).toBeNull()
    expect(turnsFromResponse({ messages: 'oops' })).toBeNull()
    expect(turnsFromResponse('<html>proxy error</html>')).toBeNull()
  })

  it('malformed entries invalidate the response rather than deleting valid local turns', () => {
    expect(
      turnsFromResponse({
        ok: true,
        messages: [
          { role: 'user', content: 'kept' },
          { role: 'user' },
          null,
          { role: 'assistant', content: 'also kept' },
        ],
      })
    ).toBeNull()
  })

  it('a missing role invalidates the response rather than inventing a speaker', () => {
    expect(
      turnsFromResponse({ ok: true, messages: [{ content: 'x' }] })
    ).toBeNull()
  })
})

describe('what a mutation run found the first version had missed', () => {
  /*
   * A shorter server transcript can result from a deletion on another device.
   */
  it('a shorter server transcript replaces the outdated page', () => {
    expect(
      shouldAdoptHistory({
        server: [{ role: 'user', content: 'hello' }],
        local: [msg('user', 'hello', 'a'), msg('assistant', 'an answer', 'b')],
        busy: false,
      })
    ).toBe(true)
  })

  /*
   * Same text, different speaker, is a different conversation. Comparing only
   * the text would call these identical and skip a refresh that matters.
   */
  it('the same text under a different role counts as different', () => {
    expect(
      shouldAdoptHistory({
        server: [{ role: 'assistant', content: 'hello' }],
        local: [msg('user', 'hello')],
        busy: false,
      })
    ).toBe(true)
  })
})

/**
 * A reset elsewhere can be followed by a shorter, entirely new conversation.
 */
describe('a shorter AND divergent server transcript', () => {
  it('is adopted after a reset and new message from another device', () => {
    expect(
      shouldAdoptHistory({
        server: [{ role: 'user', content: 'a different first turn' }],
        local: [msg('user', 'hello', 'a'), msg('assistant', 'an answer', 'b')],
        busy: false,
      })
    ).toBe(true)
  })
})
