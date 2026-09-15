import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'stream'

/**
 * THE ROUTE HAS TO ACTUALLY HAND THE AGENT ITS HANGUP.
 *
 * runAgent's own stop guards had five tests and all of them passed with the
 * signal removed from the route's call: the feature could ship disconnected
 * and nothing would go red. This file checks the wiring, not the rule.
 */
let seen: { signal?: AbortSignal } | undefined
/** Set by a case that wants the far end to disappear mid-turn. */
let hangUp: (() => void) | undefined
vi.mock('./src/agent/chat', () => ({
  runAgent: async function* (
    _history: unknown,
    _ctx: unknown,
    opts?: { signal?: AbortSignal }
  ) {
    seen = opts
    yield { тип: 'текст', текст: 'привет' } // cyrillic-ok: event field names
    hangUp?.()
    yield { тип: 'текст', текст: 'и ещё' } // cyrillic-ok: event field names
  },
}))

function request() {
  const s = Readable.from([
    JSON.stringify({ messages: [{ role: 'user', content: 'здравствуй' }] }),
  ]) as unknown as {
    headers: Record<string, string>
    method: string
    url: string
  }
  s.headers = { 'content-type': 'application/json' }
  s.method = 'POST'
  s.url = '/api/agent/chat'
  return s
}

function response() {
  const listeners = new Map<string, Set<() => void>>()
  return {
    writableEnded: false,
    writeHead: () => undefined,
    write: () => true,
    end: () => undefined,
    on(event: string, fn: () => void) {
      const set = listeners.get(event) ?? new Set()
      set.add(fn)
      listeners.set(event, set)
      return this
    },
    off(event: string, fn: () => void) {
      listeners.get(event)?.delete(fn)
      return this
    },
    close() {
      for (const fn of listeners.get('close') ?? []) fn()
    },
  }
}

const pool = { query: async () => ({ rows: [] }) }

beforeEach(() => {
  seen = undefined
  hangUp = undefined
})

describe('the chat route', () => {
  it('gives the agent a signal, and it is live while the turn runs', async () => {
    const { handleAgentChat } = await import('./src/agent/routes')
    const res = response()
    await handleAgentChat(
      request() as never,
      res as never,
      '144022504',
      () => pool
    )
    expect(
      seen?.signal,
      'the agent was given no way to learn about a hangup'
    ).toBeTruthy()
  })

  it('aborts it when the far end closes the connection', async () => {
    const { handleAgentChat } = await import('./src/agent/routes')
    const res = response()
    /*
     * The hangup happens WHILE the agent is running: the route removes its
     * listener once the turn is over, so closing afterwards proves nothing.
     * The mocked agent closes the response from inside its own loop.
     */
    let abortedMidTurn: boolean | undefined
    hangUp = () => {
      res.close()
      abortedMidTurn = seen?.signal?.aborted
    }
    await handleAgentChat(
      request() as never,
      res as never,
      '144022504',
      () => pool
    )
    hangUp = undefined
    expect(abortedMidTurn, 'closing the socket did not stop the turn').toBe(
      true
    )
  })
})
