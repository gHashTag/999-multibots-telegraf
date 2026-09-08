import { describe, it, expect, vi } from 'vitest'
import { session } from 'telegraf'

/*
 * CAN A VALUE WRITTEN IN UPDATE N BE MISSING IN UPDATE N+1?
 *
 * People report "Image not found. Starting over." from imageToVideoWizard: step 2
 * sets ctx.session.imageUrl, step 3 reads it and finds nothing. Between those two
 * updates the session now round-trips through Redis, which landed the same day.
 *
 * Four explanations were dismissed by reading code (the store round-trips
 * strings; the session key is stable because production polls and Telegraf fills
 * botInfo before the first update; Redis logged no failure; no Buffer reaches the
 * persisted half). Reading is not running, so this drives the REAL Telegraf
 * middleware over the REAL store and asks the question in the shape the wizard
 * asks it.
 *
 * The middleware is the part that decides: it keeps a refcounted in-process cache
 * (telegraf PR #1713), so concurrent updates share ONE session object no matter
 * what the store does, and the store is only consulted when that count is zero.
 * That is a claim about someone else's code, and it is worth exactly as much as a
 * run of it.
 */
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { createRedisSessionStore } from '@/core/session/sessionStore'

function fakeKv(opts: { setDelayMs?: number } = {}) {
  const data = new Map<string, string>()
  return {
    data,
    client: {
      async get(key: string) {
        return data.get(key) ?? null
      },
      async set(key: string, value: string) {
        if (opts.setDelayMs)
          await new Promise(r => setTimeout(r, opts.setDelayMs))
        data.set(key, value)
      },
      async del(key: string) {
        data.delete(key)
      },
    },
  }
}

/** One Telegram update through the session middleware, running `body`. */
function update(
  mw: (ctx: never, next: () => Promise<void>) => Promise<void>,
  body: (session: Record<string, unknown>) => void | Promise<void>
) {
  const ctx = {
    update: { update_id: Math.floor(1), message: {} },
    from: { id: 7 },
    chat: { id: 7 },
    botInfo: { id: 4242 },
  } as unknown as never
  return mw(ctx, async () => {
    await body((ctx as unknown as { session: Record<string, unknown> }).session)
  })
}

const middleware = (store: unknown) =>
  session({
    store: store as never,
    getSessionKey: (ctx: never) => {
      const c = ctx as unknown as {
        from?: { id: number }
        chat?: { id: number }
      }
      return c.from && c.chat ? `4242:${c.from.id}:${c.chat.id}` : undefined
    },
    defaultSession: () => ({}) as never,
  }) as unknown as (ctx: never, next: () => Promise<void>) => Promise<void>

describe('can a write be lost between two updates', () => {
  it('the ordinary case: step 2 writes, step 3 reads it back', async () => {
    const kv = fakeKv()
    const mw = middleware(createRedisSessionStore(kv.client as never))
    await update(mw, s => {
      s.selectedVideoModel = 'kling'
      s.imageUrl = 'https://t.me/file/x.jpg'
    })
    let seen: unknown
    await update(mw, s => {
      seen = s.imageUrl
    })
    expect(seen).toBe('https://t.me/file/x.jpg')
  })

  it('overlapping updates share one session, so neither erases the other', async () => {
    // The interleaving people actually produce: they tap again while the photo
    // is still being fetched. If each update loaded its own copy, the second to
    // finish would write back a session without the first one's field.
    const kv = fakeKv({ setDelayMs: 20 })
    const mw = middleware(createRedisSessionStore(kv.client as never))
    const slow = update(mw, async s => {
      await new Promise(r => setTimeout(r, 30))
      s.imageUrl = 'from the slow one'
    })
    const fast = update(mw, s => {
      s.prompt = 'from the fast one'
    })
    await Promise.all([fast, slow])

    let after: Record<string, unknown> = {}
    await update(mw, s => {
      after = { ...s }
    })
    expect(after.imageUrl, 'the slow update was erased').toBe(
      'from the slow one'
    )
    expect(after.prompt, 'the fast update was erased').toBe('from the fast one')
  })

  it('a write that lands while Redis is refusing is still readable afterwards', async () => {
    // The store falls back to memory per key. A later get must prefer that
    // fallback over the stale snapshot Redis still holds, or the wizard reads a
    // session from before the photo.
    const kv = fakeKv()
    let failing = false
    const flaky = {
      get: async (k: string) => {
        if (failing) throw new Error('ECONNREFUSED')
        return kv.client.get(k)
      },
      set: async (k: string, v: string) => {
        if (failing) throw new Error('ECONNREFUSED')
        return kv.client.set(k, v)
      },
      del: async (k: string) => kv.client.del(k),
    }
    const mw = middleware(createRedisSessionStore(flaky as never))
    await update(mw, s => {
      s.selectedVideoModel = 'kling'
    })
    failing = true
    await update(mw, s => {
      s.imageUrl = 'written during the outage'
    })
    failing = false
    let seen: unknown
    await update(mw, s => {
      seen = s.imageUrl
    })
    expect(seen).toBe('written during the outage')
  })

  it('the guard: a session that never wrote reads back empty, so the test can fail', async () => {
    // Without this, all three above would pass on a store that returns whatever
    // it was handed.
    const kv = fakeKv()
    const mw = middleware(createRedisSessionStore(kv.client as never))
    let seen: unknown = 'not read'
    await update(mw, s => {
      seen = s.imageUrl
    })
    expect(seen).toBeUndefined()
  })
})
