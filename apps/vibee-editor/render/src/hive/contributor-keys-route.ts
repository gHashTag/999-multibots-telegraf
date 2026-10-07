import type { IncomingMessage } from 'node:http'
import { authenticate, verifiedTelegramId } from '../../auth'
import * as SPEC from '../spec/hive-contributor-keys.gen'

type Json = Record<string, unknown>
type Reply = { status: number; body: Json }
type Auth = { via: string; allowed: boolean; telegramId: string | null }
export interface ContributorKeyDeps {
  identity?: (req: IncomingMessage) => Auth
  readBody?: (req: IncomingMessage) => Promise<string>
  fetchImpl?: typeof fetch
  baseUrl?: string
  proxyToken?: string
}

export function contributorRequestIdentity(req: IncomingMessage): Auth {
  const auth = authenticate(req)
  return {
    via: auth.via,
    allowed: auth.allowed && !auth.wouldReject,
    telegramId:
      auth.via === 'session'
        ? auth.telegramId || null
        : auth.via === 'telegram'
          ? verifiedTelegramId(req)
          : null,
  }
}

/** Only a verified person can manage credentials; delegated tokens cannot. */
export function isContributorIdentity(
  via: string,
  allowed: boolean,
  telegramId: string | null
): string | null {
  if (!allowed || (via !== 'session' && via !== 'telegram')) return null
  if (
    !telegramId ||
    telegramId.length > SPEC.MAX_SUBJECT_DIGITS ||
    !/^[1-9][0-9]*$/.test(telegramId) ||
    /[^0-9]/.test(telegramId)
  )
    return null
  return `telegram:${telegramId}`
}

export function isContributorKeyPath(path: string): boolean {
  return path === '/api/hive/keys' || path.startsWith('/api/hive/keys/')
}

/** Build the upstream path from a closed grammar, never from an arbitrary URL. */
export function contributorKeyPath(path: string): string | null {
  if (path === '/api/hive/keys') return '/queen/contributor-keys'
  if (path === '/api/hive/keys/model') return '/queen/contributor-keys/model'
  const catalog = /^\/api\/hive\/keys\/models\/(nvidia|zai)$/.exec(path)
  if (catalog && catalog[0] === path)
    return `/queen/contributor-keys/models/${catalog[1]}`
  const match =
    /^\/api\/hive\/keys\/(-?(?:0|[1-9][0-9]*))\/(probe|enable|disable)$/.exec(
      path
    )
  if (
    !match ||
    match[0] !== path ||
    !Number.isSafeInteger(Number(match[1])) ||
    match[1] === '-0'
  )
    return null
  return `/queen/contributor-keys/${match[1]}/${match[2]}`
}

function record(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function safeContributionBody(raw: string): Json | null {
  if (Buffer.byteLength(raw) > SPEC.BODY_MAX_BYTES) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !record(value) ||
      Object.keys(value).some(k => !['provider', 'apiKey', 'label'].includes(k))
    )
      return null
    if (value.provider !== 'nvidia' && value.provider !== 'zai') return null
    if (
      typeof value.apiKey !== 'string' ||
      value.apiKey.length === 0 ||
      /[^\x21-\x7e]/.test(value.apiKey) ||
      value.apiKey.length > SPEC.MAX_SECRET_CHARS
    )
      return null
    if (
      value.label !== undefined &&
      (typeof value.label !== 'string' ||
        value.label.length > SPEC.MAX_LABEL_CHARS ||
        /[\r\n\x00]/.test(value.label))
    )
      return null
    return {
      provider: value.provider,
      apiKey: value.apiKey,
      ...(value.label === undefined
        ? {}
        : { label: (value.label as string).trim() }),
    }
  } catch {
    return null
  }
}

/** Provider catalog ids such as `z-ai/glm-5.3` and `glm-4.5-flash`. */
export function isModelName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= SPEC.MAX_MODEL_CHARS &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
  )
}

/** A model switch names a provider and a model; nothing chooses an owner. */
export function safeModelBody(raw: string): Json | null {
  const bytes = Buffer.byteLength(raw)
  if (bytes > SPEC.BODY_MAX_BYTES) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !record(value) ||
      Object.keys(value).some(
        field => field !== 'provider' && field !== 'model'
      )
    )
      return null
    if (value.provider !== 'nvidia' && value.provider !== 'zai') return null
    if (!isModelName(value.model)) return null
    return { provider: value.provider, model: value.model }
  } catch {
    return null
  }
}

/** Bounded streaming read; oversized input is drained without keeping the secret. */
export function readContributorBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = []
    let bytes = 0
    const data = (chunk: Buffer | string) => {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += part.length
      if (bytes > SPEC.BODY_MAX_BYTES) {
        parts.length = 0
        req.off('data', data)
        req.off('end', end)
        req.resume()
        reject(new Error('body_too_large'))
      } else parts.push(part)
    }
    const end = () => resolve(Buffer.concat(parts).toString('utf8'))
    req.on('data', data)
    req.once('end', end)
    req.once('error', () => reject(new Error('invalid_body')))
    req.once('aborted', () => reject(new Error('invalid_body')))
  })
}

function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
function contribution(value: unknown): Json | null {
  if (!record(value)) return null
  const fields = ['xp', 'accepted', 'specs', 'finished', 'hours']
  if (!fields.every(k => number(value[k]))) return null
  return Object.fromEntries(fields.map(k => [k, value[k]]))
}

function keyMetadata(value: unknown): Json | null {
  if (!record(value) || !Number.isSafeInteger(value.id)) return null
  if (value.provider !== 'nvidia' && value.provider !== 'zai') return null
  if (
    typeof value.label !== 'string' ||
    value.label.length > SPEC.MAX_LABEL_CHARS ||
    typeof value.model !== 'string'
  )
    return null
  if (
    typeof value.fingerprint !== 'string' ||
    !/^[a-f0-9]{8,64}$/.test(value.fingerprint) ||
    /[^a-f0-9]/.test(value.fingerprint)
  )
    return null
  if (
    typeof value.enabled !== 'boolean' ||
    (value.createdAt !== null && typeof value.createdAt !== 'string')
  )
    return null
  if (
    value.source !== undefined &&
    value.source !== 'managed' &&
    value.source !== 'environment'
  )
    return null
  const probe = value.lastProbe
  if (
    !record(probe) ||
    !['ok', 'invalid', 'rate_limited', 'unavailable', 'not_checked'].includes(
      String(probe.status)
    )
  )
    return null
  if (probe.checkedAt !== null && typeof probe.checkedAt !== 'string')
    return null
  if (probe.latencyMs !== null && !number(probe.latencyMs)) return null
  const work = contribution(value.contribution)
  if (!work) return null
  // Project fields explicitly. An upstream debug field must never leak a key.
  return {
    id: value.id,
    provider: value.provider,
    label: value.label,
    fingerprint: value.fingerprint,
    model: value.model,
    enabled: value.enabled,
    createdAt: value.createdAt,
    ...(value.source === undefined ? {} : { source: value.source }),
    lastProbe: {
      status: probe.status,
      checkedAt: probe.checkedAt,
      latencyMs: probe.latencyMs,
    },
    contribution: work,
  }
}

export function safeContributorResponse(
  value: unknown,
  subject: string
): Json | null {
  if (!record(value)) return null
  if ('key' in value) {
    const key = keyMetadata(value.key)
    return key ? { key } : null
  }
  if (
    !Array.isArray(value.keys) ||
    !Array.isArray(value.providers) ||
    !record(value.attribution) ||
    value.attribution.subject !== subject
  )
    return null
  const keys = value.keys.map(keyMetadata)
  const work = contribution(value.contribution)
  const scoring = value.scoring
  if (
    keys.some(k => !k) ||
    !work ||
    !record(scoring) ||
    !['acceptedXp', 'specXp', 'hourXp'].every(k => number(scoring[k]))
  )
    return null
  const providers: Json[] = []
  for (const p of value.providers) {
    if (
      !record(p) ||
      !['nvidia', 'zai'].includes(String(p.id)) ||
      typeof p.label !== 'string' ||
      typeof p.model !== 'string'
    )
      return null
    if (p.defaultModel !== undefined && typeof p.defaultModel !== 'string')
      return null
    providers.push({
      id: p.id,
      label: p.label,
      model: p.model,
      ...(p.defaultModel === undefined ? {} : { defaultModel: p.defaultModel }),
    })
  }
  const github = value.attribution.github
  if (
    github !== undefined &&
    (typeof github !== 'string' ||
      !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(github) ||
      /[^a-z0-9-]/i.test(github))
  )
    return null
  return {
    keys,
    providers,
    contribution: work,
    attribution: { subject, ...(github === undefined ? {} : { github }) },
    scoring: {
      acceptedXp: scoring.acceptedXp,
      specXp: scoring.specXp,
      hourXp: scoring.hourXp,
    },
  }
}

/** The provider catalog: the owner's current model and well-formed ids only. */
export function safeModelCatalog(value: unknown): Json | null {
  if (
    !record(value) ||
    (value.provider !== 'nvidia' && value.provider !== 'zai') ||
    !isModelName(value.model) ||
    !Array.isArray(value.models) ||
    value.models.length > 1000
  )
    return null
  return {
    provider: value.provider,
    model: value.model,
    models: value.models.filter(isModelName),
  }
}

/** Closed model-check outcomes the Queen names; any other body stays unread. */
const MODEL_ERRORS = new Set([
  'model_unavailable',
  'model_without_tools',
  'model_check_failed',
])

export async function handleContributorKeys(
  req: IncomingMessage,
  deps: ContributorKeyDeps
): Promise<Reply> {
  const fail = (status: number, error: string): Reply => ({
    status,
    body: { error },
  })
  const auth = (deps.identity ?? contributorRequestIdentity)(req)
  const subject = isContributorIdentity(auth.via, auth.allowed, auth.telegramId)
  if (!subject) return fail(401, 'authentication_required')
  const path = (req.url || '').split('?')[0]
  const upstreamPath = contributorKeyPath(path)
  if (!upstreamPath) return fail(404, 'not_found')
  const base = path === '/api/hive/keys'
  const choosing = path === '/api/hive/keys/model'
  const catalog = upstreamPath.startsWith('/queen/contributor-keys/models/')
  if (
    catalog
      ? req.method !== 'GET'
      : req.method !== 'POST' && !(base && req.method === 'GET')
  )
    return fail(405, 'method_not_allowed')
  const proxyToken =
    deps.proxyToken ?? process.env.QUEEN_CONTRIBUTOR_PROXY_TOKEN
  const baseUrl =
    deps.baseUrl ??
    process.env.QUEEN_BASE_URL ??
    'https://trios-agent-server-production.up.railway.app'
  if (!proxyToken) return fail(503, 'not_configured')
  let url: URL
  try {
    url = new URL(baseUrl)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return fail(503, 'not_configured')
  } catch {
    return fail(503, 'not_configured')
  }
  let body: string | undefined
  if (req.method === 'POST') {
    if (
      !String(req.headers['content-type'] || '')
        .toLowerCase()
        .startsWith('application/json')
    )
      return fail(415, 'json_required')
    let raw: string
    try {
      raw = await (deps.readBody ?? readContributorBody)(req)
    } catch {
      return fail(400, 'invalid_body')
    }
    if (base) {
      const parsed = safeContributionBody(raw)
      if (!parsed) return fail(400, 'invalid_body')
      body = JSON.stringify(parsed)
    } else if (choosing) {
      const parsed = safeModelBody(raw)
      if (!parsed) return fail(400, 'invalid_body')
      body = JSON.stringify(parsed)
    } else {
      // A mutation of an existing key has no client-selected identity or secret.
      try {
        const parsed: unknown = JSON.parse(raw || '{}')
        if (
          Buffer.byteLength(raw) > SPEC.BODY_MAX_BYTES ||
          !record(parsed) ||
          Object.keys(parsed).length
        )
          return fail(400, 'invalid_body')
      } catch {
        return fail(400, 'invalid_body')
      }
      body = '{}'
    }
  }
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), SPEC.PROXY_TIMEOUT_MS)
  try {
    const response = await (deps.fetchImpl ?? fetch)(
      new URL(upstreamPath, url),
      {
        method: req.method,
        headers: {
          Authorization: `Bearer ${proxyToken}`,
          'X-Queen-Contributor-Id': subject,
          'Content-Type': 'application/json',
        },
        body,
        signal: stop.signal,
        redirect: 'error',
      }
    )
    if (!response.ok) {
      if (choosing && (response.status === 422 || response.status === 504)) {
        // The Queen's own closed code says which check failed; only a known
        // code is passed on, never the body itself.
        const code = await response
          .json()
          .then(value => (record(value) ? value.error : undefined))
          .catch(() => undefined)
        return fail(
          response.status,
          typeof code === 'string' && MODEL_ERRORS.has(code)
            ? code
            : 'model_check_failed'
        )
      }
      // Provider and database error bodies can contain secrets. Do not echo them.
      const errors: Record<number, string> = {
        400: 'invalid_body',
        404: 'not_found',
        409: 'duplicate_key',
        429: 'rate_limited',
        503: 'not_configured',
      }
      const error = errors[response.status]
      return fail(
        error ? response.status : 502,
        error || 'upstream_unavailable'
      )
    }
    const json: unknown = await response.json()
    const safe = catalog
      ? safeModelCatalog(json)
      : safeContributorResponse(json, subject)
    return safe
      ? { status: response.status, body: safe }
      : fail(502, 'invalid_upstream_response')
  } catch {
    return fail(502, 'upstream_unavailable')
  } finally {
    clearTimeout(timer)
  }
}
