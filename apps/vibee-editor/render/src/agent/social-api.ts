/**
 * LinkedIn and X as API connectors of the blog desk (spec social-api.t27).
 *
 * The desk shared to LinkedIn and X by filling a share page in the owner's
 * browser and pressing its button. A signed-out browser or a moved button is no
 * post, and the press itself is no receipt. Here the owner connects each
 * network once (OAuth) and an approved article goes through the network's own
 * API, which answers with the post's id.
 *
 * Everything that is not network-specific -- the token table, the sealing, the
 * single-use state, the receipt prefix -- is meta-connect.ts's, not a copy.
 */
import { createHash, randomBytes } from 'node:crypto'
import {
  appOf,
  canSeal,
  daysLeftOf,
  NO_SEAL_KEY,
  mintState,
  readTokens,
  redirectUri,
  scrub,
  VIA_API,
  writeToken,
  type Fetch,
  type HeldToken,
  type Network,
  type Post,
  type PublishDeps,
  seal,
  unseal,
} from './meta-connect'
import {
  LI_TEXT_MAX,
  LI_WARN_DAYS_LEFT,
  PKCE_MAX,
  PKCE_MIN,
  X_LINK_GAP,
  X_REFRESH_BEFORE_S,
  X_TEXT_MAX,
  X_URL_WEIGHT,
} from '../spec/social-api.gen'

type Env = Record<string, string | undefined>
type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}
export type ApiNetwork = 'linkedin' | 'x'

/* ---------------------------------------------------------------------------
 * The spec's rules, mirrored. Pure.
 * ------------------------------------------------------------------------- */

export function xWeight(plain: number, links: number): number {
  return plain + links * X_URL_WEIGHT
}
export function xFits(plain: number, links: number): boolean {
  return xWeight(plain, links) <= X_TEXT_MAX
}
export function xTitleRoom(): number {
  return X_TEXT_MAX - X_URL_WEIGHT - X_LINK_GAP
}
export function xRefreshDue(secondsLeft: number): boolean {
  return secondsLeft < X_REFRESH_BEFORE_S
}
export function liUsable(daysLeft: number): boolean {
  return daysLeft > 0
}
export function liReconnectSoon(daysLeft: number): boolean {
  return daysLeft > 0 && daysLeft <= LI_WARN_DAYS_LEFT
}
export function verifierOk(len: number): boolean {
  return len >= PKCE_MIN && len <= PKCE_MAX
}

/* ---------------------------------------------------------------------------
 * Text of a post.
 * ------------------------------------------------------------------------- */

/**
 * X's weight of one character (twitter-text v3): 1 for U+0000-U+10FF (Latin,
 * Cyrillic, Greek, Arabic, Hebrew...) and a few punctuation runs, 2 for the
 * rest -- CJK, Hangul, emoji. Counting CJK as 1 let a Chinese title through
 * at twice X's limit, and X refused the post.
 */
export function xCharWeight(cp: number): number {
  const light =
    cp <= 0x10ff ||
    (cp >= 0x2000 && cp <= 0x200d) ||
    (cp >= 0x2010 && cp <= 0x201f) ||
    (cp >= 0x2032 && cp <= 0x2037)
  return light ? 1 : 2
}

/** U+2026 is outside the light runs: the ellipsis itself weighs 2 on X. */
const ELLIPSIS_WEIGHT = xCharWeight(0x2026)

export function xPlainWeight(text: string): number {
  let n = 0
  for (const ch of text) n += xCharWeight(ch.codePointAt(0)!)
  return n
}

/** Title, a blank line, the link -- the title cut to X's room. Pure. */
export function xPost(p: Post): string {
  const room = xTitleRoom()
  let head = p.title.trim()
  if (xPlainWeight(head) > room) {
    const out: string[] = []
    let n = 0
    for (const ch of head) {
      const w = xCharWeight(ch.codePointAt(0)!)
      if (n + w > room - ELLIPSIS_WEIGHT) break
      out.push(ch)
      n += w
    }
    head = out.join('') + '…'
  }
  return `${head}\n\n${p.link}`
}

/**
 * LinkedIn's commentary is "little text": these characters are markup there,
 * and an unescaped one silently eats the rest of the post.
 */
export function littleText(s: string): string {
  return s.replace(/[|{}@\[\]()<>#\\*_~]/g, c => `\\${c}`)
}

/**
 * The LinkedIn commentary: title and summary, within its limit. Pure.
 * Escaped first, then cut -- cutting first let every escape add a character
 * past the limit -- and never between a backslash and the character it guards.
 */
export function linkedInCommentary(p: Post): string {
  const body = littleText(`${p.title}\n\n${p.summary}`.trim())
  if ([...body].length <= LI_TEXT_MAX) return body
  const out: string[] = []
  let n = 0
  for (const piece of body.match(/\\.|[\s\S]/gu) ?? []) {
    const w = [...piece].length
    if (n + w > LI_TEXT_MAX - 1) break
    out.push(piece)
    n += w
  }
  return out.join('') + '…'
}

/* ---------------------------------------------------------------------------
 * Connecting.
 * ------------------------------------------------------------------------- */

const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization'
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
const LI_API = 'https://api.linkedin.com'
const X_AUTH = 'https://x.com/i/oauth2/authorize'
const X_API = 'https://api.x.com/2'
export const LINKEDIN_SCOPES = 'openid profile w_member_social'
export const X_SCOPES = 'tweet.read tweet.write users.read offline.access'

/** A PKCE pair (RFC 7636, S256). */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url') // 64 characters
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/** Where the owner is sent to say yes. Pure. */
export function apiAuthorizeUrl(
  network: ApiNetwork,
  clientId: string,
  state: string,
  challenge: string | null,
  env: Env = process.env
): string {
  if (network === 'linkedin')
    return `${LI_AUTH}?${new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri(env),
      state,
      scope: LINKEDIN_SCOPES,
    })}`
  return `${X_AUTH}?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri(env),
    state,
    scope: X_SCOPES,
    code_challenge: challenge || '',
    code_challenge_method: 'S256',
  })}`
}

export async function startApiConnect(
  q: Queryable,
  owner: string,
  network: ApiNetwork,
  env: Env = process.env
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const app = appOf(network, env)
  if (!app)
    return {
      ok: false,
      error:
        network === 'linkedin'
          ? 'не заданы LINKEDIN_CLIENT_ID и LINKEDIN_CLIENT_SECRET' // cyrillic-ok: told to the owner
          : 'не заданы X_CLIENT_ID и X_CLIENT_SECRET', // cyrillic-ok: told to the owner
    }
  if (!canSeal(env)) return { ok: false, error: NO_SEAL_KEY }
  const p = network === 'x' ? pkce() : null
  const nonce = await mintState(q, owner, network, p?.verifier ?? null)
  return {
    ok: true,
    url: apiAuthorizeUrl(network, app.id, nonce, p?.challenge ?? null, env),
  }
}

async function readJson(r: Awaited<ReturnType<Fetch>>): Promise<any> {
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.error) {
    const m =
      j?.error_description ||
      j?.detail ||
      j?.message ||
      (typeof j?.error === 'string' ? j.error : j?.error?.message) ||
      `HTTP ${r.status}`
    throw new Error(scrub(String(m)))
  }
  return j
}

function basic(app: { id: string; secret: string }): string {
  return 'Basic ' + Buffer.from(`${app.id}:${app.secret}`).toString('base64')
}

/** The X token endpoint: a code or a refresh token in, a rotated pair out. */
async function xToken(
  f: Fetch,
  app: { id: string; secret: string },
  params: Record<string, string>
): Promise<any> {
  return readJson(
    await f(`${X_API}/oauth2/token`, {
      method: 'POST',
      body: new URLSearchParams({ client_id: app.id, ...params }),
      headers: {
        Authorization: basic(app),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
  )
}

async function holdX(
  q: Queryable,
  owner: string,
  tok: any,
  accountId: string,
  username: string | null,
  nowMs: number,
  env: Env
): Promise<void> {
  if (!tok.refresh_token) throw new Error('X gave no refresh token')
  await writeToken(
    q,
    owner,
    {
      network: 'x',
      accountId,
      token: String(tok.access_token),
      expiresAt: new Date(nowMs + Number(tok.expires_in || 0) * 1000),
      /* The refresh token is a credential too: sealed, like the access one. */
      meta: { username, refresh_sealed: seal(String(tok.refresh_token), env) },
    },
    env
  )
}

export async function finishApiConnect(
  q: Queryable,
  f: Fetch,
  owner: string,
  network: ApiNetwork,
  code: string,
  verifier: string | null,
  nowMs: number,
  env: Env = process.env
): Promise<string> {
  const app = appOf(network, env)
  if (!app) throw new Error('app is not configured')
  if (network === 'linkedin') {
    const tok = await readJson(
      await f(LI_TOKEN, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri(env),
          client_id: app.id,
          client_secret: app.secret,
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    )
    const me = await readJson(
      await f(`${LI_API}/v2/userinfo`, {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      })
    )
    if (!me.sub) throw new Error('LinkedIn did not say who the member is')
    await writeToken(
      q,
      owner,
      {
        network,
        accountId: String(me.sub),
        token: String(tok.access_token),
        expiresAt: new Date(nowMs + Number(tok.expires_in || 0) * 1000),
        meta: { name: me.name || null },
      },
      env
    )
    return `LinkedIn ${me.name || me.sub}`
  }
  if (!verifier || !verifierOk(verifier.length))
    throw new Error('the connect lost its PKCE verifier')
  const tok = await xToken(f, app, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(env),
    code_verifier: verifier,
  })
  const me = await readJson(
    await f(`${X_API}/users/me`, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })
  )
  const id = String(me?.data?.id || '')
  if (!id) throw new Error('X did not say who the account is')
  const username = me.data.username ? String(me.data.username) : null
  await holdX(q, owner, tok, id, username, nowMs, env)
  return `X @${username || id}`
}

/**
 * An X token in its last minutes is refreshed, and the NEW refresh token is
 * kept: X replaces it on every refresh, so keeping the old one loses the
 * connection at the next refresh.
 */
export async function refreshXIfDue(
  q: Queryable,
  f: Fetch,
  owner: string,
  t: HeldToken,
  nowMs: number,
  env: Env = process.env
): Promise<HeldToken> {
  const left = t.expiresAt ? (t.expiresAt.getTime() - nowMs) / 1000 : 0
  if (!xRefreshDue(left)) return t
  const app = appOf('x', env)
  const sealed = t.meta.refresh_sealed
  if (!app || typeof sealed !== 'string') throw new Error('cannot refresh X')
  const tok = await xToken(f, app, {
    grant_type: 'refresh_token',
    refresh_token: unseal(sealed, env),
  })
  const username = (t.meta.username as string) || null
  await holdX(q, owner, tok, t.accountId, username, nowMs, env)
  return {
    ...t,
    token: String(tok.access_token),
    expiresAt: new Date(nowMs + Number(tok.expires_in || 0) * 1000),
    meta: { username, refresh_sealed: seal(String(tok.refresh_token), env) },
  }
}

/* ---------------------------------------------------------------------------
 * Publishing: each answers with the post's own address, or throws.
 * ------------------------------------------------------------------------- */

/** YYYYMM of the LinkedIn API version; LinkedIn retires a version after a year. */
export function linkedInVersion(
  env: Env = process.env,
  now = new Date()
): string {
  if (env.LINKEDIN_API_VERSION) return env.LINKEDIN_API_VERSION
  /* Last month's: the current one may not be published on the 1st. */
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function publishLinkedIn(
  t: HeldToken,
  p: Post,
  d: PublishDeps
): Promise<string> {
  const env = d.env || process.env
  const r = await d.fetch(`${LI_API}/rest/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${t.token}`,
      'LinkedIn-Version': linkedInVersion(env),
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      author: `urn:li:person:${t.accountId}`,
      commentary: linkedInCommentary(p),
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        article: {
          source: p.link,
          title: p.title.slice(0, 400),
          description: p.summary.slice(0, 4000),
        },
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  })
  if (!r.ok) await readJson(r)
  const urn = r.headers?.get('x-restli-id') || ''
  if (!urn) throw new Error('no id came back')
  return `https://www.linkedin.com/feed/update/${urn}/`
}

export async function publishX(
  t: HeldToken,
  p: Post,
  d: PublishDeps
): Promise<string> {
  const j = await readJson(
    await d.fetch(`${X_API}/tweets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: xPost(p) }),
    })
  )
  const id = String(j?.data?.id || '')
  if (!id) throw new Error('no id came back')
  const who = (t.meta.username as string) || 'i/web'
  return `https://x.com/${who}/status/${id}`
}

/**
 * LinkedIn and X posted through their APIs, for each the owner holds a token
 * of. A network without a token is absent -- the browser gets it, as before.
 * Never throws.
 */
export async function postBySocialApi(
  q: Queryable,
  owner: string,
  p: Post,
  d: PublishDeps & { now?: () => number; only?: readonly Network[] }
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
  const fail = (e: unknown) => `ошибка API: ${scrub(String(e))}` // cyrillic-ok: told to the owner
  for (let t of held) {
    if (d.only && !d.only.includes(t.network)) continue
    if (t.network === 'linkedin') {
      if (!liUsable(daysLeftOf(t, now()))) {
        out.LinkedIn = 'токен истёк — подключите LinkedIn заново' // cyrillic-ok: told to the owner
        continue
      }
      out.LinkedIn = await publishLinkedIn(t, p, d).then(say).catch(fail)
    } else if (t.network === 'x') {
      try {
        t = await refreshXIfDue(q, d.fetch, owner, t, now(), env)
      } catch (e) {
        out.X = fail(e)
        continue
      }
      out.X = await publishX(t, p, d).then(say).catch(fail)
    }
  }
  return out
}
