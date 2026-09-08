import { session, type Context, type MiddlewareFn } from 'telegraf'
import { createClient, type RedisClientType } from 'redis'
import { logger } from '@/utils/logger'

/**
 * Telegraf sessions in Redis, so a redeploy no longer wipes every wizard.
 *
 * WHY. Sessions were `bot.use(session())` -- Telegraf's in-memory default. On
 * 2026-09-08 the bot was redeployed 15 times in 3 hours (every merge to main
 * restarts it); each restart threw away every user's scene state mid-dialogue,
 * and the owner saw "the bot does not work". The Railway project already runs a
 * Redis service; this store uses it.
 *
 * WHAT IS NOT PERSISTED. `images` holds Buffers -- up to 10 training photos of
 * up to 10 MB each per user (trainFluxModelWizard). Writing that to Redis on
 * every update would cost tens of megabytes per keystroke and would not
 * survive JSON anyway (a Buffer round-trips as {type:'Buffer',data:[...]}).
 * Those fields stay in a per-process map exactly as before: a restart still
 * loses the photos, but the wizard position and everything else survive.
 *
 * KEYS. Eleven bots share one Redis. In a private chat chat.id == from.id, so
 * Telegraf's default key `${from}:${chat}` would make two bots share one
 * user's session. The key is therefore prefixed with the bot id.
 *
 * FAILURE. If Redis is unreachable the store logs and falls back to memory for
 * the affected keys -- degraded to today's behaviour, never a dead bot. With no
 * REDIS_URL at all (dev, tests) it is the plain memory session, said out loud.
 */

/** Session fields that hold Buffers and must never be written to Redis. */
export const VOLATILE_FIELDS: ReadonlySet<string> = new Set([
  'images',
  // morphingImages: Buffers too (morphingWizard, aiPhotoshopScene), and its
  // .url carries the bot token -- neither may ever reach Redis.
  'morphingImages',
])

/**
 * A MUTUAL-EXCLUSION FLAG MUST NOT OUTLIVE THE PROCESS THAT HOLDS IT.
 *
 * 27 scenes guard a paid generation with `ctx.session.<x>InProgress`. All 27
 * release it -- 21 in a `finally`, 6 in `.leave()` -- so within a living
 * process the flag is sound.
 *
 * Nothing releases it when the process DIES, and that is the whole difference
 * this store made. The sequence needs no exotic timing:
 *
 *   1. a generation starts, the flag goes true;
 *   2. the person taps again -- normal, nothing has happened on screen yet --
 *      and the guard's own early `return` still TOUCHED the session, so the
 *      middleware writes it, flag and all, to Redis;
 *   3. a redeploy kills the generating handler; its `finally` never runs.
 *
 * The flag is now true in Redis with nobody left to clear it, and the TTL is
 * refreshed by every later write, so it does not expire for an active user.
 * The person is locked out of that scene permanently. Before this store, the
 * same restart cleared the session and the next tap simply worked -- and the
 * bot was redeployed fifteen times in three hours the day the store landed.
 *
 * So these flags stay per-process, exactly as they were. What #2230 came for --
 * the wizard's POSITION and the consume-once marks -- still goes to Redis; only
 * the lock does not. That is what every distributed lock does differently from
 * a plain flag: it carries an expiry, because the holder can vanish.
 *
 * WHAT THIS DOES NOT FIX, said plainly: a restart during a dispatched
 * generation now lets the person start (and pay for) another one. That was the
 * behaviour before this store existed; a stuck flag does not prevent the second
 * charge either, it only replaces it with silence.
 */
const LOCK_FIELD = /InProgress$/

/** Fields that must never be written to Redis: Buffers, and process-held locks. */
export function isVolatileField(key: string): boolean {
  return VOLATILE_FIELDS.has(key) || LOCK_FIELD.test(key)
}
export const KEY_PREFIX = 'tg:session:'
export const TTL_SECONDS = 7 * 24 * 3600

type SessionShape = Record<string, unknown>

/** The subset of a redis client this store needs (so tests can inject a fake). */
export interface KvClient {
  get(key: string): Promise<unknown>
  set(
    key: string,
    value: string,
    options?: { expiration?: { type: 'EX'; value: number } }
  ): Promise<unknown>
  del(key: string): Promise<unknown>
}

export interface AsyncStore<S> {
  get(name: string): Promise<S | undefined>
  set(name: string, value: S): Promise<void>
  delete(name: string): Promise<void>
}

/**
 * Bot-scoped session key. Mirrors Telegraf's default (`${from}:${chat}`,
 * undefined when either is missing) with the bot id in front.
 */
export function sessionKeyFor(
  ctx: Context,
  botId?: number
): string | undefined {
  const from = ctx.from?.id
  const chat = ctx.chat?.id
  if (from === undefined || chat === undefined) return undefined
  const bot = botId ?? ctx.botInfo?.id ?? 'bot'
  return `${bot}:${from}:${chat}`
}

/** Split a session into the JSON-safe part and the Buffer-bearing part. */
export function splitVolatile(value: SessionShape): {
  persisted: SessionShape
  volatile: SessionShape
} {
  const persisted: SessionShape = {}
  const volatile: SessionShape = {}
  for (const [k, v] of Object.entries(value)) {
    if (isVolatileField(k)) volatile[k] = v
    else persisted[k] = v
  }
  return { persisted, volatile }
}

export function createRedisSessionStore<S extends SessionShape>(
  client: KvClient,
  opts: { ttlSeconds?: number; prefix?: string } = {}
): AsyncStore<S> {
  const ttl = opts.ttlSeconds ?? TTL_SECONDS
  const prefix = opts.prefix ?? KEY_PREFIX
  // Buffers live here, per process, keyed like the persisted part.
  const volatileByKey = new Map<string, SessionShape>()
  // Where a key goes while Redis is failing, so the bot keeps working.
  const memoryFallback = new Map<string, SessionShape>()
  let lastErrorLogAt = 0
  const logRedisError = (op: string, e: unknown) => {
    const now = Date.now()
    if (now - lastErrorLogAt > 60_000) {
      lastErrorLogAt = now
      logger.error(
        `[session] redis ${op} failed -- using memory for affected keys`,
        {
          error: e instanceof Error ? e.message : String(e),
        }
      )
    }
  }
  const merge = (
    key: string,
    persisted: SessionShape | undefined
  ): S | undefined => {
    const vol = volatileByKey.get(key)
    if (persisted === undefined) return vol ? ({ ...vol } as S) : undefined
    return (vol ? { ...persisted, ...vol } : persisted) as S
  }
  return {
    async get(key) {
      // A key written while Redis was down lives in memoryFallback and is newer
      // than whatever Redis still holds; serve it, and the next set() writes it
      // through and clears the fallback.
      const fb = memoryFallback.get(key)
      if (fb !== undefined) return merge(key, fb)
      let persisted: SessionShape | undefined
      try {
        const raw = await client.get(prefix + key)
        // node-redis types GET as BlobStringReply | NullReply; only a string is a session
        persisted =
          typeof raw === 'string'
            ? (JSON.parse(raw) as SessionShape)
            : undefined
      } catch (e) {
        logRedisError('get', e)
        persisted = memoryFallback.get(key)
      }
      return merge(key, persisted)
    },
    async set(key, value) {
      const { persisted, volatile } = splitVolatile(value)
      if (Object.keys(volatile).length) volatileByKey.set(key, volatile)
      else volatileByKey.delete(key)
      const payload = JSON.stringify(persisted)
      try {
        await client.set(prefix + key, payload, {
          expiration: { type: 'EX', value: ttl },
        })
        memoryFallback.delete(key)
      } catch (e) {
        logRedisError('set', e)
        memoryFallback.set(key, persisted)
      }
    },
    async delete(key) {
      volatileByKey.delete(key)
      memoryFallback.delete(key)
      try {
        await client.del(prefix + key)
      } catch (e) {
        logRedisError('del', e)
      }
    },
  }
}

let sharedClient: RedisClientType | undefined

/** One connection per process, shared by every bot. */
function getRedisClient(url: string): RedisClientType {
  if (sharedClient) return sharedClient
  let client: RedisClientType
  try {
    client = createClient({
      url,
      // Without this, node-redis QUEUES commands while disconnected and the
      // store's get/set wait forever -- with handlerTimeout: Infinity that is a
      // hung update, a dead bot. Rejecting immediately is what lets the catch
      // below fall back to memory.
      disableOfflineQueue: true,
      // A READY but stalled Redis would still hang a command; bound every command
      // so the same catch -> memory fallback path applies to stalls.
      commandOptions: { timeout: 3_000 },
      socket: {
        reconnectStrategy: retries => Math.min(1000 * 2 ** retries, 30_000),
      },
    }) as RedisClientType
  } catch {
    // createClient parses the URL synchronously; the raw value carries the
    // password, so it must not travel inside the error.
    throw new Error('[session] REDIS_URL is not a valid redis:// URL')
  }
  let lastClientErrorAt = 0
  client.on('error', e => {
    // one line per minute, not one per reconnect attempt (every <=30s in an outage)
    const now = Date.now()
    if (now - lastClientErrorAt < 60_000) return
    lastClientErrorAt = now
    logger.error('[session] redis client error (rate-limited)', {
      error: e instanceof Error ? e.message : String(e),
    })
  })
  const host = (() => {
    try {
      return new URL(url).host
    } catch {
      return '(unparseable url)'
    }
  })()
  client
    .connect()
    .then(() =>
      logger.info('[session] store: redis', { host, ttlSeconds: TTL_SECONDS })
    )
    .catch(e =>
      logger.error(
        '[session] redis connect() rejected (reconnect strategy gave up); memory fallback in effect',
        { host, error: e instanceof Error ? e.message : String(e) }
      )
    )
  sharedClient = client
  return client
}

/**
 * The middleware every bot installs instead of `session()`.
 * With REDIS_URL: Redis-backed, bot-scoped keys. Without: memory, said aloud.
 */
export function sessionMiddleware<C extends Context>(
  opts: { botId?: number } = {}
): MiddlewareFn<C> {
  const url = process.env.REDIS_URL
  const getSessionKey = (ctx: Context) => sessionKeyFor(ctx, opts.botId)
  if (!url) {
    logger.warn(
      '[session] REDIS_URL is not set -- in-memory sessions, lost on every restart'
    )
    return session<SessionShape, Context, 'session'>({
      getSessionKey,
    }) as unknown as MiddlewareFn<C>
  }
  const store = createRedisSessionStore<SessionShape>(getRedisClient(url))
  return session<SessionShape, Context, 'session'>({
    store,
    getSessionKey,
  }) as unknown as MiddlewareFn<C>
}
