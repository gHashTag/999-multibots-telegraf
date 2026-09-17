/**
 * "WHY DOES THE CODE NOT REACH THE USER?"
 *
 * Asked by the owner on 2026-09-17. The journal held 23 sign-ins and NOT ONE
 * `code-issued`, so no code had been minted at all -- and the refusals that
 * would explain why went to a console line nobody reads and to no channel at
 * all.
 *
 * That is the shape this repository keeps finding: the failure that leaves no
 * trace. A person presses "sign in", nothing arrives, and the one place we look
 * first has nothing to say. The success was already journaled; only the refusal
 * was silent, which is exactly backwards -- a success needs no explanation.
 */
import { describe, it, expect } from 'vitest'
import { handleAuthRoute } from './session-routes'
import { routeRequest, routeResponse } from './test-support/route-double'

/** A pool double that records what the journal was asked to write. */
function poolRecording(written: Array<Record<string, unknown>>) {
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (/insert into\s+hive_events/i.test(sql)) {
        written.push({ sql, params })
      }
      return { rows: [] as unknown[] }
    },
  }
}

describe('a refused code request leaves a line', () => {
  it('writes code-refused when the signature is not accepted', async () => {
    const written: Array<Record<string, unknown>> = []
    const res = routeResponse()
    await handleAuthRoute(
      routeRequest('/api/auth/pair/start', {}),
      res as never,
      (() => poolRecording(written)) as never
    )

    expect(res.status, 'a request with no signature must be refused').toBe(401)

    // Give the fire-and-forget write a turn: the route must not wait on the
    // journal, so the line lands after the answer.
    await new Promise(r => setTimeout(r, 0))

    const line = written.find(w =>
      JSON.stringify(w.params ?? []).includes('code-refused')
    )
    expect(line, 'the refusal was not written anywhere').toBeTruthy()
  })

  /*
   * The signature itself must never travel: it is what lets somebody present
   * themselves as that person. The REASON is the whole point -- "empty
   * initData" and "no bot tokens configured" are different repairs.
   */
  it('carries the reason and never the signature', async () => {
    const written: Array<Record<string, unknown>> = []
    const res = routeResponse()
    await handleAuthRoute(
      routeRequest(
        '/api/auth/pair/start',
        {},
        {
          'x-telegram-init-data': 'hash=deadbeef&user=%7B%22id%22%3A1%7D',
        }
      ),
      res as never,
      (() => poolRecording(written)) as never
    )
    await new Promise(r => setTimeout(r, 0))

    const all = JSON.stringify(written)
    expect(all).not.toContain('deadbeef')
    // A string, not a regex: nothing strips a regex literal, so Cyrillic
    // inside one is refused by the gate. The assertion is the same.
    expect(all).toContain('код не выдан')
  })
})
