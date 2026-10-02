/**
 * THREADS, INSTAGRAM AND A FACEBOOK PAGE THROUGH META'S OWN API.
 *
 * Spec of record: gHashTag/t27 specs/automation/meta-connect.t27, vendored as
 * src/spec/meta-connect.t27; every number below comes from its generated
 * module, and src/spec/meta-connect.test.ts runs each of its tests here.
 *
 * Why: on 2026-10-02 the owner's browser was signed out of all three, so the
 * blog desk skipped them every day. A Graph API publish returns the post's own
 * id -- a receipt the browser could only guess at from a page leaving its form.
 *
 * Two logins, not three. A Facebook Login Page token also publishes to the
 * Instagram professional account linked to that Page, and it never expires.
 * Threads has its own app and its own 60-day token, refreshed on the desk's
 * tick (a date in the table, not a timer: a deploy resets a timer).
 *
 * What never happens here: a token in a reply, a log line or an error (they
 * are sealed with AES-256-GCM at rest and stripped from every message), and a
 * post without the desk's own yes -- this module only answers publishEverywhere,
 * which runs after the owner said "yes".
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto'
import type { Queryable } from '../browser/sessions'
import {
  CARD_H,
  CARD_W,
  IG_CAPTION_MAX,
  POLL_EVERY_MS,
  POLLS,
  REFRESH_DAYS_LEFT,
  REFRESH_MIN_AGE_H,
  STATE_TTL_MS,
  THREADS_LINKS_MAX,
  THREADS_TEXT_MAX,
} from '../spec/meta-connect.gen'

export { CARD_H, CARD_W }

/* ---------------------------------------------------------------------------
 * The spec's rules, one function each (meta-connect.t27).
 * ------------------------------------------------------------------------- */

export type Road = 'api' | 'browser' | 'skip'

export function route(hasToken: boolean, signedIn: boolean): Road {
  if (hasToken) return 'api'
  return signedIn ? 'browser' : 'skip'
}

export function shouldRefresh(daysLeft: number, ageH: number): boolean {
  return (
    daysLeft > 0 && daysLeft <= REFRESH_DAYS_LEFT && ageH >= REFRESH_MIN_AGE_H
  )
}

export function usable(expires: boolean, daysLeft: number): boolean {
  return !expires || daysLeft > 0
}

export function fitsThreads(chars: number, links: number): boolean {
  return chars <= THREADS_TEXT_MAX && links <= THREADS_LINKS_MAX
}

export function ready(status: string): boolean {
  return status === 'FINISHED'
}

export function givenUp(status: string): boolean {
  return status === 'ERROR' || status === 'EXPIRED'
}

export function posted(publishedId: string): boolean {
  return publishedId !== ''
}

export function stateOk(ageMs: number, used: boolean): boolean {
  return !used && ageMs < STATE_TTL_MS
}

export function lastPollMs(): number {
  return (POLLS - 1) * POLL_EVERY_MS
}

/* ---------------------------------------------------------------------------
 * Configuration: which apps, which callback.
 * ------------------------------------------------------------------------- */

/* LinkedIn and X share the table, the sealing and the state (social-api.ts). */
export type Network = 'threads' | 'facebook' | 'linkedin' | 'x'
export const META_NETWORKS: readonly Network[] = ['threads', 'facebook']
type Env = Record<string, string | undefined>

export function graphVersion(env: Env = process.env): string {
  return env.META_GRAPH_VERSION || 'v23.0'
}

export function redirectUri(env: Env = process.env): string {
  const base = (
    env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
  return `${base}/api/social/meta/callback`
}

/** The app of a network, or null when its variables are not set. */
export function appOf(
  network: Network,
  env: Env = process.env
): { id: string; secret: string } | null {
  const names: Record<Network, [string, string]> = {
    threads: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
    facebook: ['META_APP_ID', 'META_APP_SECRET'],
    linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    x: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  }
  const [idName, secretName] = names[network]
  const id = env[idName]
  const secret = env[secretName]
  return id && secret ? { id, secret } : null
}

export const THREADS_SCOPES = 'threads_basic,threads_content_publish'
export const FACEBOOK_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
].join(',')

/** Where the owner is sent to say yes to the app. Pure. */
export function authorizeUrl(
  network: Network,
  appId: string,
  state: string,
  env: Env = process.env
): string {
  const q = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri(env),
    response_type: 'code',
    state,
    scope: network === 'threads' ? THREADS_SCOPES : FACEBOOK_SCOPES,
  })
  return network === 'threads'
    ? `https://threads.net/oauth/authorize?${q}`
    : `https://www.facebook.com/${graphVersion(env)}/dialog/oauth?${q}`
}

/* ---------------------------------------------------------------------------
 * Sealing: a token at rest is ciphertext, and a message never carries one.
 * ------------------------------------------------------------------------- */

function keyOf(env: Env): Buffer {
  const raw =
    env.META_TOKEN_KEY ||
    env.META_APP_SECRET ||
    env.THREADS_APP_SECRET ||
    env.LINKEDIN_CLIENT_SECRET ||
    env.X_CLIENT_SECRET ||
    ''
  if (!raw) throw new Error('no key to seal a token with')
  return createHash('sha256').update(`meta-connect:${raw}`).digest()
}

export function seal(token: string, env: Env = process.env): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', keyOf(env), iv)
  const body = Buffer.concat([c.update(token, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map(b => b.toString('base64')).join('.')
}

export function unseal(sealed: string, env: Env = process.env): string {
  const [iv, tag, body] = sealed.split('.').map(s => Buffer.from(s, 'base64'))
  const d = createDecipheriv('aes-256-gcm', keyOf(env), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}

/** Anything that may hold a token, made safe to show or to log. Pure. */
export function scrub(text: string): string {
  return (
    text
      .replace(/access_token=[^&\s"']+/gi, 'access_token=…')
      .replace(/(refresh_token|code_verifier)=[^&\s"']+/gi, '$1=…')
      .replace(/Bearer\s+\S+/gi, 'Bearer …')
      .replace(/\b(EAA|THQ|TH)[A-Za-z0-9_-]{20,}/g, '…')
      /* LinkedIn and X tokens carry no prefix: any long opaque run goes. */
      .replace(/[A-Za-z0-9_\-.~+/=]{48,}/g, '…')
      .slice(0, 300)
  )
}

/* ---------------------------------------------------------------------------
 * The two tables.
 * ------------------------------------------------------------------------- */

let tablesReady = false
export async function ensureSocialTables(q: Queryable): Promise<void> {
  if (tablesReady) return
  await q.query(`CREATE TABLE IF NOT EXISTS social_tokens (
    owner text NOT NULL,
    network text NOT NULL,
    account_id text NOT NULL,
    token_sealed text NOT NULL,
    expires_at timestamptz,
    refreshed_at timestamptz NOT NULL DEFAULT now(),
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (owner, network)
  )`)
  await q.query(`CREATE TABLE IF NOT EXISTS social_oauth_states (
    nonce text PRIMARY KEY,
    owner text NOT NULL,
    network text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    used boolean NOT NULL DEFAULT false
  )`)
  /* The PKCE verifier of an X connect (social-api.t27); null for the others. */
  await q.query(
    `ALTER TABLE social_oauth_states ADD COLUMN IF NOT EXISTS verifier text`
  )
  tablesReady = true
}
export function resetSocialTablesForTests(): void {
  tablesReady = false
}

export interface HeldToken {
  network: Network
  accountId: string
  token: string
  expiresAt: Date | null
  refreshedAt: Date
  meta: Record<string, unknown>
}

export async function readTokens(
  q: Queryable,
  owner: string,
  env: Env = process.env
): Promise<HeldToken[]> {
  await ensureSocialTables(q)
  const { rows } = await q.query(
    `SELECT network, account_id, token_sealed, expires_at, refreshed_at, meta
       FROM social_tokens WHERE owner = $1`,
    [owner]
  )
  const out: HeldToken[] = []
  for (const r of rows) {
    try {
      out.push({
        network: String(r.network) as Network,
        accountId: String(r.account_id),
        token: unseal(String(r.token_sealed), env),
        expiresAt: r.expires_at ? new Date(String(r.expires_at)) : null,
        refreshedAt: new Date(String(r.refreshed_at)),
        meta: (r.meta as Record<string, unknown>) || {},
      })
    } catch {
      /* A row sealed with another key is not a token; it is reconnected. */
    }
  }
  return out
}

export async function writeToken(
  q: Queryable,
  owner: string,
  t: Omit<HeldToken, 'refreshedAt'>,
  env: Env
): Promise<void> {
  await ensureSocialTables(q)
  await q.query(
    `INSERT INTO social_tokens (owner, network, account_id, token_sealed, expires_at, refreshed_at, meta)
     VALUES ($1, $2, $3, $4, $5, now(), $6)
     ON CONFLICT (owner, network) DO UPDATE SET account_id = $3, token_sealed = $4,
       expires_at = $5, refreshed_at = now(), meta = $6`,
    [
      owner,
      t.network,
      t.accountId,
      seal(t.token, env),
      t.expiresAt ? t.expiresAt.toISOString() : null,
      JSON.stringify(t.meta),
    ]
  )
}

const DAY_MS = 86_400_000

/** Whole days a token has left; a Page token has no end. Pure. */
export function daysLeftOf(
  t: { expiresAt: Date | null },
  nowMs: number
): number {
  if (!t.expiresAt) return Infinity
  return Math.max(0, Math.floor((t.expiresAt.getTime() - nowMs) / DAY_MS))
}

/** What may be told about a held token: never the token. Pure. */
export function statusView(
  tokens: HeldToken[],
  nowMs: number
): Array<Record<string, unknown>> {
  return tokens.map(t => {
    const days = daysLeftOf(t, nowMs)
    return {
      network: t.network,
      account: t.meta.username || t.meta.page_name || t.accountId,
      instagram: t.meta.ig_username || null,
      daysLeft: Number.isFinite(days) ? days : null,
      /* An X token lives two hours; a held refresh token keeps it usable. */
      usable:
        !!t.meta.refresh_sealed ||
        usable(t.expiresAt !== null, Number.isFinite(days) ? days : 1),
    }
  })
}

/* ---------------------------------------------------------------------------
 * HTTP with Meta, injected so tests never leave the process.
 * ------------------------------------------------------------------------- */

export type Fetch = (
  url: string,
  init?: {
    method?: string
    body?: URLSearchParams | string
    headers?: Record<string, string>
  }
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<any>
  headers?: { get: (name: string) => string | null }
}>

async function call(
  f: Fetch,
  url: string,
  params: Record<string, string>,
  method: 'GET' | 'POST' = 'GET'
): Promise<any> {
  const body = new URLSearchParams(params)
  const r =
    method === 'GET'
      ? await f(`${url}${url.includes('?') ? '&' : '?'}${body}`)
      : await f(url, { method: 'POST', body })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.error) {
    const m = j?.error?.message || j?.error_message || `HTTP ${r.status}`
    throw new Error(scrub(String(m)))
  }
  return j
}

const THREADS = 'https://graph.threads.net'
const graph = (env: Env) => `https://graph.facebook.com/${graphVersion(env)}`

/* ---------------------------------------------------------------------------
 * Connecting: a single-use state, then the code exchanged for a long token.
 * ------------------------------------------------------------------------- */

export async function startConnect(
  q: Queryable,
  owner: string,
  network: Network,
  env: Env = process.env
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const app = appOf(network, env)
  if (!app)
    return {
      ok: false,
      error:
        network === 'threads'
          ? 'не заданы THREADS_APP_ID и THREADS_APP_SECRET' // cyrillic-ok: told to the owner
          : 'не заданы META_APP_ID и META_APP_SECRET', // cyrillic-ok: told to the owner
    }
  const nonce = await mintState(q, owner, network)
  return { ok: true, url: authorizeUrl(network, app.id, nonce, env) }
}

/** A single-use state for one connect; X also keeps its PKCE verifier here. */
export async function mintState(
  q: Queryable,
  owner: string,
  network: Network,
  verifier: string | null = null
): Promise<string> {
  await ensureSocialTables(q)
  const nonce = randomBytes(24).toString('base64url')
  await q.query(
    `INSERT INTO social_oauth_states (nonce, owner, network, verifier) VALUES ($1, $2, $3, $4)`,
    [nonce, owner, network, verifier]
  )
  return nonce
}

/** Takes the state once: the owner and network it was minted for, or null. */
export async function takeState(
  q: Queryable,
  nonce: string,
  nowMs: number
): Promise<{
  owner: string
  network: Network
  verifier: string | null
} | null> {
  if (!nonce) return null
  await ensureSocialTables(q)
  const { rows } = await q.query(
    `UPDATE social_oauth_states SET used = true
      WHERE nonce = $1 AND used = false
      RETURNING owner, network, created_at, verifier`,
    [nonce]
  )
  const r = rows[0]
  if (!r) return null
  const age = nowMs - new Date(String(r.created_at)).getTime()
  if (!stateOk(age, false)) return null
  return {
    owner: String(r.owner),
    network: String(r.network) as Network,
    verifier: r.verifier ? String(r.verifier) : null,
  }
}

export async function finishConnect(
  q: Queryable,
  f: Fetch,
  owner: string,
  network: Network,
  code: string,
  nowMs: number,
  env: Env = process.env
): Promise<string> {
  const app = appOf(network, env)
  if (!app) throw new Error('app is not configured')
  if (network === 'threads') {
    const short = await call(
      f,
      `${THREADS}/oauth/access_token`,
      {
        client_id: app.id,
        client_secret: app.secret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(env),
        code,
      },
      'POST'
    )
    const long = await call(f, `${THREADS}/access_token`, {
      grant_type: 'th_exchange_token',
      client_secret: app.secret,
      access_token: String(short.access_token),
    })
    const me = await call(f, `${THREADS}/v1.0/me`, {
      fields: 'id,username',
      access_token: String(long.access_token),
    })
    await writeToken(
      q,
      owner,
      {
        network,
        accountId: String(me.id || short.user_id),
        token: String(long.access_token),
        expiresAt: new Date(nowMs + Number(long.expires_in || 0) * 1000),
        meta: { username: me.username || null },
      },
      env
    )
    return `Threads @${me.username || me.id}`
  }
  const short = await call(f, `${graph(env)}/oauth/access_token`, {
    client_id: app.id,
    client_secret: app.secret,
    redirect_uri: redirectUri(env),
    code,
  })
  const long = await call(f, `${graph(env)}/oauth/access_token`, {
    grant_type: 'fb_exchange_token',
    client_id: app.id,
    client_secret: app.secret,
    fb_exchange_token: String(short.access_token),
  })
  const pages = await call(f, `${graph(env)}/me/accounts`, {
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: String(long.access_token),
  })
  const list: any[] = Array.isArray(pages.data) ? pages.data : []
  const page =
    list.find(p => env.META_PAGE_ID && p.id === env.META_PAGE_ID) || list[0]
  if (!page?.access_token) throw new Error('no Facebook Page was granted')
  const ig = page.instagram_business_account
  await writeToken(
    q,
    owner,
    {
      network,
      accountId: String(page.id),
      token: String(page.access_token),
      expiresAt: null,
      meta: {
        page_name: page.name || null,
        ig_id: ig?.id || null,
        ig_username: ig?.username || null,
      },
    },
    env
  )
  return ig?.username
    ? `Facebook «${page.name}» + Instagram @${ig.username}` // cyrillic-ok: told to the owner
    : `Facebook «${page.name}» (Instagram к странице не привязан)` // cyrillic-ok: told to the owner
}

/** Refreshes a Threads token near its end, once Meta allows it. */
export async function refreshIfDue(
  q: Queryable,
  f: Fetch,
  owner: string,
  t: HeldToken,
  nowMs: number,
  env: Env = process.env
): Promise<HeldToken> {
  if (t.network !== 'threads') return t
  const ageH = Math.floor((nowMs - t.refreshedAt.getTime()) / 3_600_000)
  if (!shouldRefresh(daysLeftOf(t, nowMs), ageH)) return t
  const r = await call(f, `${THREADS}/refresh_access_token`, {
    grant_type: 'th_refresh_token',
    access_token: t.token,
  })
  const next = {
    ...t,
    token: String(r.access_token),
    expiresAt: new Date(nowMs + Number(r.expires_in || 0) * 1000),
  }
  await writeToken(q, owner, next, env)
  return { ...next, refreshedAt: new Date(nowMs) }
}

/* ---------------------------------------------------------------------------
 * Publishing: the receipt is the id Meta returns.
 * ------------------------------------------------------------------------- */

export const VIA_API = 'опубликовано через API' // cyrillic-ok: told to the owner; blog-share.ts reads it

export interface Post {
  title: string
  link: string
  summary: string
  /** A public JPEG of CARD_W x CARD_H, for Instagram. */
  cardUrl: string
}

/** The Threads post: title, then the whole link, within the spec's limit. Pure. */
export function threadsPost(p: Post): string {
  const room = THREADS_TEXT_MAX - p.link.length - 2
  const head =
    p.title.length <= room ? p.title : p.title.slice(0, room - 1) + '…'
  return `${head}\n\n${p.link}`
}

/** The Instagram caption: links there are not clickable, so it says where. Pure. */
export function igCaption(p: Post): string {
  const tail = '\n\nСсылка на статью — в профиле. t27.ai' // cyrillic-ok: the caption the reader sees
  const room = IG_CAPTION_MAX - tail.length
  const body = `${p.title}\n\n${p.summary}`.trim()
  return (body.length <= room ? body : body.slice(0, room - 1) + '…') + tail
}

/** Waits for a container until it is finished, failed, or the spec's patience ends. */
async function waitFor(
  read: () => Promise<string>,
  sleep: (ms: number) => Promise<void>
): Promise<void> {
  for (let i = 0; i < POLLS; i++) {
    if (i > 0) await sleep(POLL_EVERY_MS)
    const s = await read()
    if (ready(s)) return
    if (givenUp(s)) throw new Error(`container ${s}`)
  }
  throw new Error('container not finished in time')
}

export interface PublishDeps {
  fetch: Fetch
  sleep: (ms: number) => Promise<void>
  env?: Env
}

export async function publishThreads(
  t: HeldToken,
  p: Post,
  d: PublishDeps
): Promise<string> {
  const text = threadsPost(p)
  if (!fitsThreads(text.length, 1)) throw new Error('post does not fit')
  const base = `${THREADS}/v1.0/${t.accountId}`
  const c = await call(
    d.fetch,
    `${base}/threads`,
    {
      media_type: 'TEXT',
      text,
      link_attachment: p.link,
      access_token: t.token,
    },
    'POST'
  )
  await waitFor(
    async () =>
      String(
        (
          await call(d.fetch, `${THREADS}/v1.0/${c.id}`, {
            fields: 'status',
            access_token: t.token,
          })
        ).status || 'FINISHED'
      ),
    d.sleep
  )
  const done = await call(
    d.fetch,
    `${base}/threads_publish`,
    { creation_id: String(c.id), access_token: t.token },
    'POST'
  )
  return await permalinkOr(
    d.fetch,
    `${THREADS}/v1.0/${done.id}`,
    'permalink',
    t.token,
    String(done.id || '')
  )
}

export async function publishFacebook(
  t: HeldToken,
  p: Post,
  d: PublishDeps
): Promise<string> {
  const g = graph(d.env || process.env)
  const done = await call(
    d.fetch,
    `${g}/${t.accountId}/feed`,
    {
      message: `${p.title}\n\n${p.summary}`.trim(),
      link: p.link,
      access_token: t.token,
    },
    'POST'
  )
  return await permalinkOr(
    d.fetch,
    `${g}/${done.id}`,
    'permalink_url',
    t.token,
    String(done.id || '')
  )
}

export async function publishInstagram(
  t: HeldToken,
  p: Post,
  d: PublishDeps
): Promise<string> {
  const ig = String(t.meta.ig_id || '')
  if (!ig) throw new Error('no Instagram account is linked to the Page')
  const g = graph(d.env || process.env)
  const c = await call(
    d.fetch,
    `${g}/${ig}/media`,
    { image_url: p.cardUrl, caption: igCaption(p), access_token: t.token },
    'POST'
  )
  await waitFor(
    async () =>
      String(
        (
          await call(d.fetch, `${g}/${c.id}`, {
            fields: 'status_code',
            access_token: t.token,
          })
        ).status_code || ''
      ),
    d.sleep
  )
  const done = await call(
    d.fetch,
    `${g}/${ig}/media_publish`,
    { creation_id: String(c.id), access_token: t.token },
    'POST'
  )
  return await permalinkOr(
    d.fetch,
    `${g}/${done.id}`,
    'permalink',
    t.token,
    String(done.id || '')
  )
}

async function permalinkOr(
  f: Fetch,
  url: string,
  field: string,
  token: string,
  id: string
): Promise<string> {
  if (!posted(id)) throw new Error('no id came back')
  try {
    const j = await call(f, url, { fields: field, access_token: token })
    return String(j[field] || id)
  } catch {
    return id
  }
}

/**
 * Every network the owner holds a token of, posted through its API. A network
 * without a token is absent from the answer -- publishEverywhere then gives it
 * to the browser, as before. Never throws.
 */
export async function postByApi(
  q: Queryable,
  owner: string,
  p: Post,
  d: PublishDeps & { now?: () => number }
): Promise<Record<string, string>> {
  const env = d.env || process.env
  const now = d.now || Date.now
  const out: Record<string, string> = {}
  let held: HeldToken[] = []
  try {
    held = await readTokens(q, owner, env)
  } catch {
    return out
  }
  const say = (r: string) => `${VIA_API} · ${r}`
  for (let t of held) {
    /* LinkedIn and X rows live in the same table; social-api.ts posts them. */
    if (!META_NETWORKS.includes(t.network)) continue
    const days = daysLeftOf(t, now())
    const label = t.network === 'threads' ? 'Threads' : 'Facebook'
    if (!usable(t.expiresAt !== null, Number.isFinite(days) ? days : 1)) {
      out[label] = 'токен истёк — подключите заново: tri meta connect' // cyrillic-ok: told to the owner
      continue
    }
    try {
      t = await refreshIfDue(q, d.fetch, owner, t, now(), env)
    } catch {
      /* A failed refresh still leaves a working token for today. */
    }
    if (t.network === 'threads') {
      out.Threads = await publishThreads(t, p, d)
        .then(say)
        .catch(e => `ошибка API: ${scrub(String(e))}`) // cyrillic-ok: told to the owner
      continue
    }
    out.Facebook = await publishFacebook(t, p, d)
      .then(say)
      .catch(e => `ошибка API: ${scrub(String(e))}`) // cyrillic-ok: told to the owner
    if (t.meta.ig_id)
      out.Instagram = await publishInstagram(t, p, d)
        .then(say)
        .catch(e => `ошибка API: ${scrub(String(e))}`) // cyrillic-ok: told to the owner
  }
  return out
}
