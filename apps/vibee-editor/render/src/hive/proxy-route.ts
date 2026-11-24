import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as SPEC from '../spec/hive-proxy.gen'
import * as RULE from '../spec/hive-proxy.logic'
import {
  contributorRequestIdentity,
  isContributorIdentity,
} from './contributor-keys-route'
import { QUEEN_BASE } from './queen-client'

/**
 * POST /api/hive/proxy/v1/messages -- a signed-in person's client (Claude
 * Code, ANTHROPIC_BASE_URL=.../api/hive/proxy) spends the provider keys that
 * person stored in the hive, over the Anthropic Messages protocol.
 *
 * Every rule is in hive-proxy.t27 and runs from its compiled body (RULE);
 * this file is the I/O around them: read the session, ask the Queen for the
 * owner's keys, pick one, hand the Queen the body, stream the answer back.
 * The secret never reaches this process: the Queen opens it for the one call.
 * A provider refusal is never echoed; the client is told by the spec's table.
 */
type Key = { id: number; provider: string; model: string; enabled: boolean }
export interface HiveProxyDeps {
  identity?: (
    req: IncomingMessage
  ) => ReturnType<typeof contributorRequestIdentity>
  fetchImpl?: typeof fetch
  baseUrl?: string
  proxyToken?: string
  flag?: string
  now?: () => number
}

export const isHiveProxyPath = (path: string) => path === SPEC.ROUTE

function fail(
  res: ServerResponse,
  status: number,
  code: string,
  type = RULE.ownType(status),
  extra: Record<string, string> = {}
) {
  if (res.headersSent) return void res.destroy()
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...extra,
  })
  res.end(
    JSON.stringify({
      type: 'error',
      error: { type, code, message: code.replace(/_/g, ' ') },
    })
  )
}

function keysOf(value: unknown): Key[] {
  const list = (value as { keys?: unknown } | null)?.keys
  if (!Array.isArray(list)) return []
  return list.flatMap((k: Partial<Key> | null) =>
    k &&
    Number.isSafeInteger(k.id) &&
    typeof k.provider === 'string' &&
    typeof k.model === 'string' &&
    k.model.length > 0 &&
    typeof k.enabled === 'boolean'
      ? [k as Key]
      : []
  )
}

/** The body, bounded as it arrives; null when it ran past the cap. */
async function readCapped(req: IncomingMessage): Promise<Buffer | null> {
  const parts: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    if (part.length === 0) continue
    bytes += part.length
    if (!RULE.requestFits(bytes)) {
      req.resume()
      return null
    }
    parts.push(part)
  }
  return Buffer.concat(parts)
}

export function createHiveProxy(deps: HiveProxyDeps = {}) {
  const calls = new Map<string, number[]>()
  const live = new Map<string, number>()
  const turns = new Map<string, number>()
  const retry = { 'Retry-After': String(SPEC.BUSY_RETRY_SECONDS) }

  return async function hiveProxy(req: IncomingMessage, res: ServerResponse) {
    const flag = deps.flag ?? process.env[SPEC.FLAG_ENV] ?? ''
    if (!RULE.flagOn(flag)) return fail(res, 404, SPEC.CODE_OFF)
    if (req.method !== 'POST')
      return fail(res, 405, SPEC.CODE_METHOD, undefined, { Allow: 'POST' })
    const auth = (deps.identity ?? contributorRequestIdentity)(req)
    const subject = isContributorIdentity(
      auth.via,
      auth.allowed,
      auth.telegramId
    )
    const spends = RULE.maySpend(
      auth.via === 'session',
      auth.allowed,
      subject !== null
    )
    if (!subject || !spends) return fail(res, 401, SPEC.CODE_AUTH)
    const token = deps.proxyToken ?? process.env.QUEEN_CONTRIBUTOR_PROXY_TOKEN
    let base: URL
    try {
      base = new URL(deps.baseUrl ?? QUEEN_BASE)
      if (base.protocol !== 'https:' || base.username || base.password)
        throw new Error('base')
    } catch {
      return fail(res, 503, SPEC.CODE_NOT_CONFIGURED)
    }
    if (!token) return fail(res, 503, SPEC.CODE_NOT_CONFIGURED)

    const at = (deps.now ?? Date.now)()
    const recent = (calls.get(subject) ?? []).filter(
      t => at - t < SPEC.RATE_WINDOW_MS
    )
    calls.set(subject, recent)
    if (!RULE.rateAllows(recent.length))
      return fail(res, 429, SPEC.CODE_RATE, undefined, retry)
    recent.push(at)
    if (!RULE.mayStart(live.get(subject) ?? 0))
      return fail(res, 429, SPEC.CODE_BUSY, undefined, retry)
    live.set(subject, (live.get(subject) ?? 0) + 1)

    const stop = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) stop.abort()
    })
    try {
      const ctype = String(req.headers['content-type'] || '').toLowerCase()
      if (!ctype.startsWith('application/json'))
        return fail(res, 415, SPEC.CODE_JSON)
      const declared = Number(req.headers['content-length'] ?? 0)
      if (declared > 0 && !RULE.requestFits(declared)) {
        req.resume()
        return fail(res, 413, SPEC.CODE_TOO_LARGE)
      }
      const raw = await readCapped(req)
      if (!raw) return fail(res, 413, SPEC.CODE_TOO_LARGE)
      let payload: Record<string, unknown>
      try {
        const parsed: unknown = JSON.parse(raw.toString('utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('shape')
        payload = parsed as Record<string, unknown>
      } catch {
        return fail(res, 400, SPEC.CODE_BAD_BODY)
      }

      const ask = deps.fetchImpl ?? fetch
      const asQueen = {
        Authorization: `Bearer ${token}`,
        'X-Queen-Contributor-Id': subject,
      }
      const listed = await ask(new URL(SPEC.QUEEN_KEYS_PATH, base), {
        headers: asQueen,
        redirect: 'error',
        signal: AbortSignal.timeout(SPEC.KEYS_TIMEOUT_MS),
      })
      if (!listed.ok) {
        await listed.body?.cancel().catch(() => {})
        return fail(
          res,
          RULE.queenStatus(listed.status),
          RULE.queenCode(listed.status)
        )
      }
      const keys = keysOf(await listed.json().catch(() => null))
      const usable = keys.filter(k => RULE.keyUsable(k.enabled, k.provider))
      if (usable.length === 0)
        return fail(res, 404, RULE.noKeyCode(keys.some(k => k.enabled)))
      const turn = turns.get(subject) ?? 0
      turns.set(subject, (turn + 1) >>> 0)
      const key = usable[RULE.pickIndex(usable.length, turn)]

      const headers: Record<string, string> = {
        ...asQueen,
        'Content-Type': 'application/json',
      }
      for (const name of ['anthropic-version', 'anthropic-beta']) {
        const sent = req.headers[name]
        if (typeof sent === 'string') headers[name] = sent
      }
      const started = Date.now()
      const answer = await ask(
        new URL(
          `${SPEC.QUEEN_CALL_PREFIX}${key.id}${SPEC.QUEEN_CALL_SUFFIX}`,
          base
        ),
        {
          method: 'POST',
          headers,
          body: Buffer.from(JSON.stringify({ ...payload, model: key.model })),
          redirect: 'error',
          signal: AbortSignal.any([
            stop.signal,
            AbortSignal.timeout(SPEC.STREAM_TIMEOUT_MS),
          ]),
        }
      )
      const marker = answer.headers.get(SPEC.UPSTREAM_HEADER) ?? ''
      const upstream = /^[0-9]{3}$/.test(marker) ? Number(marker) : 0
      console.log(
        `[hive-proxy] key=${key.id} upstream=${upstream || 'none'} ms=${Date.now() - started}`
      )
      if (upstream === 0) {
        await answer.body?.cancel().catch(() => {})
        return fail(
          res,
          RULE.queenStatus(answer.status),
          RULE.queenCode(answer.status)
        )
      }
      if (!answer.ok) {
        await answer.body?.cancel().catch(() => {})
        const wait = answer.headers.get('retry-after') ?? ''
        return fail(
          res,
          RULE.replyStatus(upstream),
          RULE.replyCode(upstream),
          RULE.replyType(upstream),
          RULE.retryAfterOk(wait.length, /^[0-9]+$/.test(wait))
            ? { 'Retry-After': wait }
            : {}
        )
      }
      res.writeHead(RULE.replyStatus(upstream), {
        'Content-Type':
          answer.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      })
      if (!answer.body) return void res.end()
      await pipeline(Readable.fromWeb(answer.body as never), res)
    } catch {
      // Nothing here may carry the secret (this process never holds one) or a
      // provider's words; a stream cut short is cut, a refusal is a code.
      fail(res, 502, SPEC.CODE_QUEEN_DOWN)
    } finally {
      const left = (live.get(subject) ?? 1) - 1
      if (left > 0) live.set(subject, left)
      else live.delete(subject)
    }
  }
}
