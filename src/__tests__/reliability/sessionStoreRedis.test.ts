/**
 * Behavioral ratchet for the Redis session store (no real Redis: a fake KvClient).
 *
 * Pins the four properties that make the store safe to ship:
 *  (1) a wizard session round-trips through JSON intact;
 *  (2) Buffer-bearing `images` are NEVER written to the client, yet come back
 *      from the per-process side map on the next read (as before, per process);
 *  (3) keys are bot-scoped -- two bots never share one user's private chat;
 *  (4) a failing Redis degrades to memory for the affected keys, never throws.
 * Plus: every bot installs sessionMiddleware(), and no bare session() remains.
 */
import { describe, it, expect, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  createRedisSessionStore,
  sessionKeyFor,
  splitVolatile,
  KEY_PREFIX,
  TTL_SECONDS,
  VOLATILE_FIELDS,
  isVolatileField,
  type KvClient,
} from '@/core/session/sessionStore'

function fakeClient(opts: { failing?: boolean } = {}) {
  const data = new Map<string, string>()
  const setCalls: Array<{
    key: string
    value: string
    options?: { expiration?: { type: 'EX'; value: number } }
  }> = []
  const client: KvClient = {
    async get(key) {
      if (opts.failing) throw new Error('ECONNREFUSED')
      return data.get(key) ?? null
    },
    async set(key, value, options) {
      if (opts.failing) throw new Error('ECONNREFUSED')
      data.set(key, value)
      setCalls.push({ key, value, options })
    },
    async del(key) {
      if (opts.failing) throw new Error('ECONNREFUSED')
      data.delete(key)
    },
  }
  return { client, data, setCalls }
}

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

describe('Redis session store', () => {
  it('round-trips a wizard session through JSON, with prefix and TTL', async () => {
    const { client, setCalls } = fakeClient()
    const store = createRedisSessionStore(client)
    const s = {
      __scenes: {
        current: 'neuroPhotoWizard',
        cursor: 2,
        state: { prompt: 'кот' },
      },
      mode: 'neuro_photo',
    }
    await store.set('1:2:2', s)
    expect(setCalls[0].key).toBe(KEY_PREFIX + '1:2:2')
    expect(setCalls[0].options?.expiration).toEqual({
      type: 'EX',
      value: TTL_SECONDS,
    })
    expect(await store.get('1:2:2')).toEqual(s)
    await store.delete('1:2:2')
    expect(await store.get('1:2:2')).toBeUndefined()
  })

  it('never writes Buffer-bearing images to Redis, but returns them from the side map', async () => {
    const { client, setCalls } = fakeClient()
    const store = createRedisSessionStore(client)
    const images = [{ buffer: Buffer.from('jpeg-bytes'), filename: 'a.jpg' }]
    await store.set('1:5:5', { step: 3, images })
    expect(setCalls[0].value).not.toContain('images')
    expect(setCalls[0].value).not.toContain('jpeg-bytes')
    const back = (await store.get('1:5:5')) as {
      step: number
      images: typeof images
    }
    expect(back.step).toBe(3)
    expect(Buffer.isBuffer(back.images[0].buffer)).toBe(true)
    expect(back.images[0].buffer.toString()).toBe('jpeg-bytes')
  })

  it('self-check: splitVolatile separates exactly the volatile fields', () => {
    const { persisted, volatile } = splitVolatile({ a: 1, images: [], b: 'x' })
    expect(Object.keys(persisted).sort()).toEqual(['a', 'b'])
    expect(Object.keys(volatile)).toEqual(['images'])
  })

  it('keys are bot-scoped: two bots do not share one private chat', () => {
    const ctx = (botId?: number) =>
      ({
        from: { id: 42 },
        chat: { id: 42 },
        botInfo: botId ? { id: botId } : undefined,
      }) as never
    expect(sessionKeyFor(ctx(111))).toBe('111:42:42')
    expect(sessionKeyFor(ctx(222))).toBe('222:42:42')
    expect(sessionKeyFor(ctx(), 333)).toBe('333:42:42')
    expect(sessionKeyFor({ from: { id: 1 } } as never)).toBeUndefined()
  })

  it('a failing Redis degrades to memory for the affected keys and never throws', async () => {
    const { client } = fakeClient({ failing: true })
    const store = createRedisSessionStore(client)
    await expect(store.set('1:7:7', { step: 1 })).resolves.toBeUndefined()
    expect(await store.get('1:7:7')).toEqual({ step: 1 })
    await expect(store.delete('1:7:7')).resolves.toBeUndefined()
    expect(await store.get('1:7:7')).toBeUndefined()
  })

  it('every session field whose type carries a Buffer is volatile (never written to Redis)', () => {
    // Parsed with the compiler, so a Buffer nested inside an object type
    // (morphingImages: { buffer: Buffer; ... }[]) is seen, not just BufferType.
    const src = read('src/interfaces/telegram-bot.interface.ts')
    const sf = ts.createSourceFile('i.ts', src, ts.ScriptTarget.Latest, true)
    const bufferFields = new Set<string>()
    const visit = (n: ts.Node): void => {
      if (ts.isInterfaceDeclaration(n) && /Session/.test(n.name.text)) {
        for (const m of n.members) {
          if (
            ts.isPropertySignature(m) &&
            m.type &&
            /\bBuffer\b/.test(m.type.getText(sf)) &&
            ts.isIdentifier(m.name)
          ) {
            bufferFields.add(m.name.text)
          }
        }
      }
      n.forEachChild(visit)
    }
    visit(sf)
    expect(
      bufferFields.size,
      'no Buffer-typed session field found -- scanner stale?'
    ).toBeGreaterThan(0)
    for (const name of bufferFields) {
      expect(
        VOLATILE_FIELDS.has(name),
        `session field "${name}" carries a Buffer but is not volatile -- it would be JSON-written to Redis and come back as a plain object`
      ).toBe(true)
    }
  })

  it('morphingImages (Buffers + a token-bearing url) is never written to Redis', async () => {
    const { client, setCalls } = fakeClient()
    const store = createRedisSessionStore(client)
    const morphingImages = [
      {
        buffer: Buffer.from('png'),
        url: 'https://api.telegram.org/file/botSECRET/x.jpg',
        filename: 'x.jpg',
      },
    ]
    await store.set('1:9:9', { mode: 'morphing', morphingImages })
    expect(setCalls[0].value).not.toContain('morphingImages')
    expect(setCalls[0].value).not.toContain('SECRET')
    const back = (await store.get('1:9:9')) as {
      morphingImages: typeof morphingImages
    }
    expect(Buffer.isBuffer(back.morphingImages[0].buffer)).toBe(true)
  })

  it('after an outage the fallback value wins over the stale Redis snapshot, then writes through', async () => {
    const state = { failing: false }
    const data = new Map<string, string>()
    const client: KvClient = {
      async get(k) {
        if (state.failing) throw new Error('down')
        return data.get(k) ?? null
      },
      async set(k, v) {
        if (state.failing) throw new Error('down')
        data.set(k, v)
      },
      async del(k) {
        if (state.failing) throw new Error('down')
        data.delete(k)
      },
    }
    const store = createRedisSessionStore(client)
    await store.set('1:3:3', { step: 1 }) // in Redis
    state.failing = true
    await store.set('1:3:3', { step: 2 }) // only in memory fallback
    state.failing = false
    expect(await store.get('1:3:3')).toEqual({ step: 2 }) // not the stale Redis {step:1}
    await store.set('1:3:3', { step: 3 }) // writes through, clears fallback
    expect(JSON.parse(data.get(KEY_PREFIX + '1:3:3')!)).toEqual({ step: 3 })
    expect(await store.get('1:3:3')).toEqual({ step: 3 })
  })

  it('the client disables the offline queue so a down Redis rejects instead of hanging', () => {
    expect(read('src/core/session/sessionStore.ts')).toMatch(
      /disableOfflineQueue: true/
    )
  })

  it('every bot installs sessionMiddleware() and no bare session() remains', () => {
    for (const f of ['src/index.ts', 'src/bot.ts']) {
      const src = read(f)
      expect(src, `${f} must install sessionMiddleware()`).toMatch(
        /bot\.use\(sessionMiddleware\(\)\)/
      )
      expect(src, `${f} still has a bare in-memory session()`).not.toMatch(
        /bot\.use\(session\(\)\)/
      )
    }
  })

  it('a mutual-exclusion flag is never written to Redis', async () => {
    // 27 scenes hold a paid generation with <x>InProgress. All 27 release it
    // in a finally or a .leave() -- and none of those run when the process
    // dies. Written to Redis, the flag has nobody left to clear it and the TTL
    // is refreshed by every later write, so the person is locked out of that
    // scene for good.
    const { client, setCalls } = fakeClient()
    const store = createRedisSessionStore(client)
    await store.set('7:7:7', {
      cursor: 2,
      neuroPhotoInProgress: true,
      lastUpscaledUrl: 'https://x/y.png',
    } as never)
    const written = JSON.parse(setCalls[0].value)
    expect(written).not.toHaveProperty('neuroPhotoInProgress')
    // and nothing else was taken away: the position and the consume-once mark
    // are exactly what the move to Redis came for.
    expect(written.cursor).toBe(2)
    expect(written.lastUpscaledUrl).toBe('https://x/y.png')
  })

  it('the flag survives inside one process, and dies with it', async () => {
    const { client } = fakeClient()
    const live = createRedisSessionStore(client)
    await live.set('7:7:7', { cursor: 2, faceSwapInProgress: true } as never)
    // same process: the guard must still see the lock it took
    expect(await live.get('7:7:7')).toMatchObject({ faceSwapInProgress: true })

    // a redeploy: a new store over the same Redis
    const afterRestart = createRedisSessionStore(client)
    const revived = (await afterRestart.get('7:7:7')) as Record<string, unknown>
    expect(revived).not.toHaveProperty('faceSwapInProgress')
    expect(revived.cursor, 'the wizard position must still survive').toBe(2)
  })

  it('self-check: the lock family is recognised and ordinary fields are not', () => {
    expect(isVolatileField('neuroPhotoInProgress')).toBe(true)
    expect(isVolatileField('images')).toBe(true)
    // The consume-once marks are money guards and MUST persist: a restart that
    // forgot them would let a paid result be consumed twice.
    expect(isVolatileField('lastUpscaledUrl')).toBe(false)
    expect(isVolatileField('cursor')).toBe(false)
    expect(isVolatileField('mode')).toBe(false)
  })

  it('mutation: reverting one call site to session() turns the check RED', () => {
    const src = read('src/index.ts')
    const mutated = src.replace(
      'bot.use(sessionMiddleware())',
      'bot.use(session())'
    )
    expect(mutated).not.toEqual(src)
    expect(/bot\.use\(session\(\)\)/.test(mutated)).toBe(true)
  })
})
