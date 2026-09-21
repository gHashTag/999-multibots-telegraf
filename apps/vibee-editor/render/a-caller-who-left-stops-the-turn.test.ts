/**
 * A CLOSED SOCKET REACHES THE TURN.
 *
 * Production, 20.09.2026. The chat route opened a stream, started a turn and
 * then never looked at the socket again. The bot gave up at its 180 s ceiling
 * and asked the same question again; the abandoned turn ran on to completion,
 * charging the client a second time for the same picture and uploading it four
 * minutes after anybody could receive it.
 *
 * The property, tested through the route and not through its source text: the
 * signal `runAgent` is handed is the one the response's `close` fires.
 */
import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'

let seenOpts: Record<string, unknown> | null = null
vi.mock('./src/agent/chat', () => ({
  runAgent: async function* (
    _h: unknown,
    _ctx: unknown,
    opts: Record<string, unknown>
  ) {
    seenOpts = opts
    yield { ['тип']: 'текст', ['текст']: 'ok' } // cyrillic-ok: event envelope
  },
}))

import { handleAgentChat } from './src/agent/routes'

const OWNER = '144022504'
const getPool = async () => ({ query: async () => ({ rows: [] }) })

function req() {
  const s = Readable.from([
    JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  ]) as any
  s.headers = { 'content-type': 'application/json' }
  s.method = 'POST'
  s.url = '/api/agent/chat'
  return s
}

/** A response that remembers its listeners, so the test can hang up. */
function res() {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    writableEnded: false,
    on(name: string, fn: () => void) {
      ;(listeners[name] ||= []).push(fn)
      return this
    },
    hangUp() {
      for (const fn of listeners['close'] || []) fn()
    },
    writeHead() {
      return this
    },
    write() {
      return true
    },
    end() {},
  }
}

describe('the chat route', () => {
  it('hands the turn a signal, and hanging up fires it', async () => {
    const r = res()
    await handleAgentChat(req(), r as any, OWNER, getPool as any)

    const signal = seenOpts?.signal as AbortSignal
    expect(signal, 'runAgent was given no signal').toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)

    r.hangUp()
    expect(signal.aborted).toBe(true)
  })

  it('a response that finished normally is not an abort', async () => {
    const r = res()
    await handleAgentChat(req(), r as any, OWNER, getPool as any)
    const signal = seenOpts?.signal as AbortSignal

    // Node fires `close` on every response, including the ones that ended
    // properly. Treating that as "the caller left" would abort every turn at
    // the moment it succeeded.
    r.writableEnded = true
    r.hangUp()
    expect(signal.aborted).toBe(false)
  })
})
