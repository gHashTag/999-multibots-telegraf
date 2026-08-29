/**
 * A dropped IDLE connection must not kill the process.
 *
 * pg emits 'error' on the Pool when a connection sitting idle in it dies -- a
 * database restart, a failover, an administrator terminating the backend. With
 * no listener registered, EventEmitter converts that into an uncaughtException,
 * and every try/catch in autopilot-state.ts is beside the point because nothing
 * is awaiting at that moment. Forced against real Postgres on 2026-08-29:
 * pg_terminate_backend on an idle pooled connection killed the script with exit
 * 7, a second AFTER the query it was supposedly protecting had succeeded.
 *
 * That matters here more than in a web server: the autopilot runs as a child of
 * the render server under a respawn supervisor, so an escaped error is a
 * 60-second crash loop, not a visible failure. The module's own contract says it
 * never throws outward.
 *
 * The Pool is constructed INSIDE openDb, so this test replaces the pg module
 * itself and then emits the event a real pool would emit. It is not a shape
 * assertion about the source text: nothing here reads the file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

/** Stands in for pg.Pool: an EventEmitter that records how it was built. */
class FakePool extends EventEmitter {
  static last: FakePool | null = null
  ended = false
  constructor(public options: Record<string, unknown>) {
    super()
    FakePool.last = this
  }
  async query() {
    return { rows: [] }
  }
  async end() {
    this.ended = true
  }
}

vi.mock('pg', () => ({ Pool: FakePool, default: { Pool: FakePool } }))

const SAVED = process.env.DATABASE_URL

beforeEach(() => {
  FakePool.last = null
  process.env.DATABASE_URL = 'postgres://user:pw@127.0.0.1:5432/db'
})
afterEach(() => {
  if (SAVED === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = SAVED
})

describe('the pool survives a connection dying under it', () => {
  it('registers an error listener before handing the pool back', async () => {
    const { openDb } = await import('./src/autopilot-state')
    const opened = await openDb()
    expect(opened, 'openDb returned null with a DSN set').not.toBeNull()
    const pool = FakePool.last
    expect(pool, 'no pool was constructed').not.toBeNull()
    // The decisive assertion: without a listener, Node throws on emit.
    expect(pool!.listenerCount('error')).toBeGreaterThan(0)
    await opened!.close()
  })

  it('emitting the error does NOT throw -- this is what killed the process', async () => {
    const { openDb } = await import('./src/autopilot-state')
    const opened = await openDb()
    const pool = FakePool.last!
    // EventEmitter rethrows an 'error' event that nobody listens for. If the
    // listener were removed, this line is where the process dies.
    expect(() =>
      pool.emit(
        'error',
        new Error('terminating connection due to administrator command')
      )
    ).not.toThrow()
    await opened!.close()
  })

  it('says so in the log rather than swallowing it in silence', async () => {
    // A silent swallow is indistinguishable from a healthy connection, which is
    // how the original state wipe stayed invisible for days.
    const said: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation(m => {
      said.push(String(m))
    })
    try {
      const { openDb } = await import('./src/autopilot-state')
      const opened = await openDb()
      FakePool.last!.emit('error', new Error('boom-from-test'))
      await opened!.close()
    } finally {
      spy.mockRestore()
    }
    expect(said.join('\n')).toContain('boom-from-test')
  })

  it('no DSN means no pool at all, so there is nothing to listen to', async () => {
    delete process.env.DATABASE_URL
    const { openDb } = await import('./src/autopilot-state')
    expect(await openDb()).toBeNull()
    expect(FakePool.last).toBeNull()
  })
})
