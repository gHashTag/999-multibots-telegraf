import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE SECRET HAS TO SURVIVE THE WIRE.
 *
 * The one-time secret that authorises a send arrives as the LAST event on the
 * agent's NDJSON stream, and the bot parses that stream by hand: bytes arrive
 * in chunks, a chunk can end mid-line, and a tail is carried to the next one.
 *
 * If that parser drops the final event -- because it has no trailing newline,
 * or because the split landed inside the JSON -- the card appears with a button
 * that cannot confirm, and the person presses it and is told the draft expired.
 * A confirmation that fails on a timing detail of the transport is exactly the
 * kind of bug that gets diagnosed as "the agent is flaky".
 *
 * Driven through the REAL `спроситьАгента`, with fetch stubbed to a stream we
 * chop up. A copy of the parser in the test would pass while the real one broke
 * -- this repository has already paid for that shape of fake once.
 */

const OWNER = '144022504'

const event = (o: Record<string, unknown>) => JSON.stringify(o)
const TEXT = event({ ['тип']: 'текст', ['текст']: 'Подготовил письмо.' })
const TOOL = event({ ['тип']: 'инструмент', ['имя']: 'tg_send' })
const DRAFT = event({
  ['тип']: 'proposal',
  proposal: {
    id: 'abc123456789',
    action: 'send',
    target: '@ivan',
    what: 'привет',
    secret: 'f'.repeat(32),
  },
})

/** A body that hands the parser exactly the chunks we name. */
function streamOf(chunks: string[]) {
  const enc = new TextEncoder()
  let i = 0
  return {
    getReader: () => ({
      read: async () =>
        i < chunks.length
          ? { done: false, value: enc.encode(chunks[i++]) }
          : { done: true, value: undefined },
    }),
  }
}

function serve(chunks: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, body: streamOf(chunks), status: 200 }))
  )
}

beforeEach(() => {
  vi.resetModules()
  process.env.RENDER_API_KEY = 'test-key'
})
afterEach(() => vi.unstubAllGlobals())

describe('the draft and its secret survive every chunk boundary', () => {
  const cases: Array<[string, string[]]> = [
    ['every line terminated', [`${TEXT}\n${TOOL}\n${DRAFT}\n`]],
    // The realistic one: a server that ends without a trailing newline.
    ['the last line unterminated', [`${TEXT}\n${TOOL}\n${DRAFT}`]],
    [
      'a split inside the proposal JSON',
      [`${TEXT}\n${TOOL}\n${DRAFT.slice(0, 40)}`, DRAFT.slice(40)],
    ],
    ['a split exactly on the newline', [`${TEXT}\n${TOOL}`, `\n${DRAFT}\n`]],
    ['one byte at a time', `${TEXT}\n${TOOL}\n${DRAFT}`.split('')],
  ]

  for (const [name, chunks] of cases) {
    it(`arrives intact: ${name}`, async () => {
      serve(chunks)
      const { спроситьАгента: ask } = await import('@/services/trinityAgent') // cyrillic-ok: pre-existing export name
      const r = await ask(OWNER, 'напиши Ивану')
      expect(r['текст']).toContain('Подготовил письмо') // cyrillic-ok
      expect(r.proposal?.secret, 'секрет потерян при разборе потока').toBe(
        'f'.repeat(32)
      )
      expect(r.proposal?.id).toBe('abc123456789')
    })
  }

  it('an answer with no draft leaves proposal undefined, not a stale one', async () => {
    // A leftover from a previous turn would put somebody else's text under a
    // Send button in this one.
    serve([`${TEXT}\n`])
    const { спроситьАгента: ask } = await import('@/services/trinityAgent') // cyrillic-ok
    const r = await ask(OWNER, 'привет')
    expect(r.proposal).toBeUndefined()
  })

  it('an event without a secret is ignored rather than half-trusted', async () => {
    /*
     * A proposal with no secret cannot be confirmed, so a card built from it
     * would be a button that always fails. Better no card: the person asks
     * again instead of pressing something broken.
     */
    serve([
      `${TEXT}\n` +
        event({
          ['тип']: 'proposal',
          proposal: { id: 'x', action: 'send', target: '@i' },
        }) +
        '\n',
    ])
    const { спроситьАгента: ask } = await import('@/services/trinityAgent') // cyrillic-ok
    const r = await ask(OWNER, 'напиши')
    expect(r.proposal).toBeUndefined()
  })
})
