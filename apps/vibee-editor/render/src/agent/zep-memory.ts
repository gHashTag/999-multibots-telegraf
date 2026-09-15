import { createHmac } from 'node:crypto'
import type { StoredMessage } from './chat-memory'

/**
 * ZEP, WHEN IT IS THERE.
 *
 * Zep Cloud keeps a graph per user: messages go in, facts and entities come
 * out as a "context block" a model can read in one breath. This adapter
 * mirrors the correspondence memory into it -- one Zep user per Telegram
 * person, one thread per (owner, person) dialog -- and reads the block back
 * for the brief.
 *
 * It is a mirror, not a dependency. Postgres (chat-memory.ts) is written
 * first and answers alone when ZEP_API_KEY is absent or Zep is down; every
 * call here returns false/null instead of throwing, and logs once. The REST
 * surface is Zep Cloud v2 (Authorization: Api-Key); ZEP_API_URL points it at
 * a self-hosted deployment that speaks the same API.
 */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const TIMEOUT_MS = 8000
/** Zep accepts a bounded batch per call; larger dialogs go in slices. */
export const ZEP_BATCH = 30

export function zepConfigured(): boolean {
  return Boolean(
    (process.env.ZEP_API_KEY || '').trim() ||
      (process.env.ZEP_AUTH_SECRET || '').trim()
  )
}

/**
 * TWO DIALECTS, ONE MEMORY.
 *
 * Zep Cloud speaks /api/v2 (users, threads, a context block) behind an
 * Api-Key. The self-hosted community server -- the one deployed as `zep` +
 * `zep-nlp` + `pgvector` on this Railway project, 2026-09-08 -- speaks
 * /api/v1 (users, sessions, memory with a summary and facts) behind a JWT
 * that its ZEP_AUTH_SECRET signs. The dialect follows the address unless
 * ZEP_FLAVOR says otherwise; the secret never leaves this process, and the
 * token is minted here rather than pasted anywhere.
 */
export type ZepFlavor = 'cloud' | 'ce'
export function zepFlavor(): ZepFlavor {
  const f = (process.env.ZEP_FLAVOR || '').toLowerCase()
  if (f === 'cloud' || f === 'ce') return f
  return /getzep\.com/i.test(base()) ? 'cloud' : 'ce'
}

const b64url = (s: string) => Buffer.from(s).toString('base64url')
// owner-scope: per process: the token is minted for the service secret
let mintedFor: { secret: string; token: string } | null = null
/** HS256, no expiry: the community server checks the signature, nothing more. */
export function mintZepToken(secret: string, now = Date.now()): string {
  if (mintedFor && mintedFor.secret === secret) return mintedFor.token
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(
    JSON.stringify({ iss: 'vibee-render', iat: Math.floor(now / 1000) })
  )
  const sig = createHmac('sha256', secret)
    .update(`${head}.${body}`)
    .digest('base64url')
  const token = `${head}.${body}.${sig}`
  mintedFor = { secret, token }
  return token
}

function authHeader(): string {
  const key = (process.env.ZEP_API_KEY || '').trim()
  if (zepFlavor() === 'cloud') return `Api-Key ${key}`
  // A ready JWT is used as it is; otherwise one is signed with the secret.
  if (key && key.split('.').length === 3) return `Bearer ${key}`
  const secret = (process.env.ZEP_AUTH_SECRET || '').trim()
  return `Bearer ${secret ? mintZepToken(secret) : key}`
}

function base(): string {
  return (process.env.ZEP_API_URL || 'https://api.getzep.com').replace(
    /\/+$/,
    ''
  )
}

export const zepUserId = (lead: string) => `tg-${lead}`
export const zepThreadId = (owner: string, lead: string) =>
  `tg-${owner}-${lead}`

/** 409, or a 400 that says so: the thing exists. Any other 400 is a mistake of ours. */
function alreadyThere(r: { status: number; body: any }): boolean {
  if (r.status === 409) return true
  const text =
    typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? '')
  return r.status === 400 && /exist/i.test(text)
}

// owner-scope: per process: log de-duplication, no facts about anybody
const warnedPaths = new Set<string>()

async function call(
  path: string,
  init: { method: string; body?: unknown },
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<{ ok: boolean; status: number; body: any }> {
  if (!zepConfigured()) return { ok: false, status: 0, body: null }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(`${base()}${path}`, {
      method: init.method,
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ac.signal,
    })
    const text = await res.text().catch(() => '')
    let body: any = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    if (!res.ok && res.status !== 409) {
      // Once per path per process: a wrong key or URL must show up in the
      // log, not as a silent zero in the report.
      const key = `${init.method} ${path.split('?')[0].replace(/\/tg-[^/]+/g, '/tg-*')}`
      if (!warnedPaths.has(key)) {
        warnedPaths.add(key)
        console.warn(`[zep] ${key} -> ${res.status}: ${text.slice(0, 160)}`)
      }
    }
    return { ok: res.ok, status: res.status, body }
  } catch (e) {
    console.warn('[zep] request failed:', path, String(e).slice(0, 120))
    return { ok: false, status: 0, body: null }
  } finally {
    clearTimeout(timer)
  }
}

/** A person in Zep. "Already exists" is success. */
export async function zepEnsureUser(
  lead: string,
  name?: string | null,
  fetchImpl?: FetchLike
): Promise<boolean> {
  if (!zepConfigured()) return false
  const r = await call(
    zepFlavor() === 'cloud' ? '/api/v2/users' : '/api/v1/user',
    {
      method: 'POST',
      body: {
        user_id: zepUserId(lead),
        first_name: name || undefined,
        metadata: { telegram_id: lead, source: 'telegram-dm' },
      },
    },
    fetchImpl
  )
  return r.ok || alreadyThere(r)
}

/** The dialog in Zep. "Already exists" is success. */
export async function zepEnsureThread(
  owner: string,
  lead: string,
  fetchImpl?: FetchLike
): Promise<boolean> {
  if (!zepConfigured()) return false
  const r =
    zepFlavor() === 'cloud'
      ? await call(
          '/api/v2/threads',
          {
            method: 'POST',
            body: {
              thread_id: zepThreadId(owner, lead),
              user_id: zepUserId(lead),
            },
          },
          fetchImpl
        )
      : await call(
          '/api/v1/sessions',
          {
            method: 'POST',
            body: {
              session_id: zepThreadId(owner, lead),
              user_id: zepUserId(lead),
              metadata: { owner, lead, source: 'telegram-dm' },
            },
          },
          fetchImpl
        )
  return r.ok || alreadyThere(r)
}

/**
 * Messages into the thread, oldest first, in slices. The owner's words are
 * the assistant's side of the thread (that is whose voice the seller writes
 * in); the person's words are the user's. Returns how many were sent.
 */
export async function zepAddMessages(
  owner: string,
  lead: string,
  msgs: StoredMessage[],
  fetchImpl?: FetchLike
): Promise<number> {
  if (!zepConfigured() || !msgs.length) return 0
  const ordered = [...msgs].sort((a, b) => a.at.getTime() - b.at.getTime())
  let sent = 0
  for (let i = 0; i < ordered.length; i += ZEP_BATCH) {
    const slice = ordered.slice(i, i + ZEP_BATCH)
    const tid = encodeURIComponent(zepThreadId(owner, lead))
    const cloud = zepFlavor() === 'cloud'
    const r = await call(
      cloud
        ? `/api/v2/threads/${tid}/messages`
        : `/api/v1/sessions/${tid}/memory`,
      {
        method: 'POST',
        body: {
          messages: slice.map(m =>
            cloud
              ? {
                  role: m.out ? 'assistant' : 'user',
                  name: m.out ? 'owner' : 'person',
                  content: m.text,
                  created_at: m.at.toISOString(),
                }
              : {
                  // The community server: `role` is a display name, the
                  // side of the conversation is `role_type`.
                  role: m.out ? 'owner' : 'person',
                  role_type: m.out ? 'assistant' : 'user',
                  content: m.text,
                  created_at: m.at.toISOString(),
                }
          ),
        },
      },
      fetchImpl
    )
    if (!r.ok) break
    sent += slice.length
  }
  return sent
}

/** The context block: facts and entities Zep derived from the dialog. */
export async function zepContext(
  owner: string,
  lead: string,
  fetchImpl?: FetchLike
): Promise<string | null> {
  if (!zepConfigured()) return null
  const tid = encodeURIComponent(zepThreadId(owner, lead))
  if (zepFlavor() === 'cloud') {
    const r = await call(
      `/api/v2/threads/${tid}/context?mode=basic`,
      { method: 'GET' },
      fetchImpl
    )
    const ctx = r.ok ? r.body?.context : null
    return typeof ctx === 'string' && ctx.trim() ? ctx.slice(0, 4000) : null
  }
  // The community server keeps a rolling summary and extracted facts on the
  // session; the block is composed here in the shape the model reads.
  const r = await call(
    `/api/v1/sessions/${tid}/memory?lastn=1`,
    { method: 'GET' },
    fetchImpl
  )
  if (!r.ok || !r.body || typeof r.body !== 'object') return null
  const facts: string[] = Array.isArray(r.body.facts)
    ? r.body.facts.filter((f: unknown) => typeof f === 'string' && f.trim())
    : []
  const summary =
    typeof r.body.summary?.content === 'string'
      ? r.body.summary.content.trim()
      : ''
  const parts: string[] = []
  if (facts.length) parts.push('FACTS:\n' + facts.map(f => `- ${f}`).join('\n'))
  if (summary) parts.push('SUMMARY:\n' + summary)
  return parts.length ? parts.join('\n\n').slice(0, 4000) : null
}

/** Business facts (a purchase, an invoice, a touch) into the person's graph. */
export async function zepGraphAdd(
  lead: string,
  data: Record<string, unknown>,
  fetchImpl?: FetchLike
): Promise<boolean> {
  if (!zepConfigured()) return false
  // The community server has no graph endpoint; the fact lives in Postgres.
  if (zepFlavor() !== 'cloud') return false
  const r = await call(
    '/api/v2/graph',
    {
      method: 'POST',
      body: {
        user_id: zepUserId(lead),
        type: 'json',
        data: JSON.stringify(data),
      },
    },
    fetchImpl
  )
  return r.ok
}
