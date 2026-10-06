/**
 * LinkedIn and X post through their own APIs (social-api.ts, spec
 * social-api.t27): the receipt is the post's own id, the X refresh token is
 * replaced on every refresh, and a token never reaches a message.
 */
import { describe, expect, it } from 'vitest'
import {
  postByApi,
  scrub,
  seal,
  takeState,
  type Fetch,
  type HeldToken,
  VIA_API,
} from './meta-connect'
import {
  apiAuthorizeUrl,
  finishApiConnect,
  linkedInCommentary,
  littleText,
  pkce,
  postBySocialApi,
  publishLinkedIn,
  publishX,
  refreshXIfDue,
  verifierOk,
  xPlainWeight,
  xPost,
  xTitleRoom,
} from './social-api'

const env = {
  LINKEDIN_CLIENT_ID: 'li-id',
  LINKEDIN_CLIENT_SECRET: 'li-secret',
  X_CLIENT_ID: 'x-id',
  X_CLIENT_SECRET: 'x-secret',
  META_TOKEN_KEY: 'k',
  PUBLIC_URL: 'https://r.example',
}
const post = {
  title: 'Spec first (v2) #t27',
  link: 'https://t27.ai/blog/spec-first',
  summary: 'Why a spec comes before the code.',
  cardUrl: 'https://r.example/api/social/card/spec-first.jpg',
}

type Call = { url: string; init?: Parameters<Fetch>[1] }
function fakeFetch(
  answer: (c: Call) => {
    status?: number
    json?: unknown
    headers?: Record<string, string>
  }
) {
  const calls: Call[] = []
  const f: Fetch = async (url, init) => {
    const c = { url, init }
    calls.push(c)
    const a = answer(c)
    const status = a.status ?? 200
    return {
      ok: status < 400,
      status,
      json: async () => a.json ?? {},
      headers: { get: (n: string) => a.headers?.[n.toLowerCase()] ?? null },
    }
  }
  return { f, calls }
}

/** A pool that remembers the social_tokens rows written to it. */
function memoryPool() {
  const rows = new Map<string, any>()
  const states = new Map<string, any>()
  return {
    rows,
    query: async (sql: string, p: unknown[] = []) => {
      if (/INSERT INTO social_tokens/.test(sql)) {
        rows.set(`${p[0]}/${p[1]}`, {
          network: p[1],
          account_id: p[2],
          token_sealed: p[3],
          expires_at: p[4],
          refreshed_at: new Date(0).toISOString(),
          meta: JSON.parse(String(p[5])),
        })
        return { rows: [] }
      }
      if (/FROM social_tokens/.test(sql))
        return {
          rows: [...rows.entries()]
            .filter(([k]) => k.startsWith(`${p[0]}/`))
            .map(([, v]) => v),
        }
      if (/INSERT INTO social_oauth_states/.test(sql)) {
        states.set(String(p[0]), {
          owner: p[1],
          network: p[2],
          verifier: p[3],
          created_at: new Date().toISOString(),
        })
        return { rows: [] }
      }
      if (/UPDATE social_oauth_states/.test(sql)) {
        const s = states.get(String(p[0]))
        states.delete(String(p[0]))
        return { rows: s ? [s] : [] }
      }
      return { rows: [] }
    },
  }
}

const held = (over: Partial<HeldToken>): HeldToken => ({
  network: 'x',
  accountId: '42',
  token: 'tok',
  expiresAt: new Date(10_000_000),
  refreshedAt: new Date(0),
  meta: {},
  ...over,
})

describe('the post itself', () => {
  it('an X post is the title, a blank line and the link, within 280', () => {
    expect(xPost(post)).toBe(`${post.title}\n\n${post.link}`)
    const long = xPost({ ...post, title: 'я'.repeat(400) })
    const head = long.split('\n\n')[0]
    expect(xPlainWeight(head)).toBeLessThanOrEqual(xTitleRoom())
    expect(head.endsWith('…')).toBe(true)
  })

  it('an emoji weighs two on X, so the cut makes room for it', () => {
    expect(xPlainWeight('🙂a')).toBe(3)
    const head = xPost({ ...post, title: '🙂'.repeat(200) }).split('\n\n')[0]
    expect(xPlainWeight(head)).toBeLessThanOrEqual(xTitleRoom())
  })

  it("LinkedIn's markup characters are escaped, or they eat the post", () => {
    expect(littleText('a (b) #c @d')).toBe('a \\(b\\) \\#c \\@d')
    expect(linkedInCommentary(post)).toContain('\\(v2\\) \\#t27')
  })

  it('CJK weighs two on X and Cyrillic one, as twitter-text counts them', () => {
    expect(xPlainWeight('Пример')).toBe(6)
    expect(xPlainWeight('中文')).toBe(4)
    const head = xPost({ ...post, title: '字'.repeat(200) }).split('\n\n')[0]
    expect(xPlainWeight(head)).toBeLessThanOrEqual(xTitleRoom())
  })

  it('LinkedIn is cut after escaping, and never inside an escape', () => {
    const text = linkedInCommentary({ ...post, title: '#'.repeat(4000) })
    expect([...text].length).toBeLessThanOrEqual(3000)
    const head = text.slice(0, -1)
    expect(head).toMatch(/^(\\#)+$/)
  })
})

describe('connecting', () => {
  it('nobody is sent to a network while there is no key to seal its token', async () => {
    const { startApiConnect } = await import('./social-api')
    const { startConnect, seal } = await import('./meta-connect')
    const bare = { ...env, META_TOKEN_KEY: undefined }
    const q = memoryPool()
    for (const out of [
      await startApiConnect(q as never, '7', 'x', bare),
      await startConnect(q as never, '7', 'threads', {
        ...bare,
        THREADS_APP_ID: 't',
        THREADS_APP_SECRET: 's',
      }),
    ])
      expect(out).toMatchObject({
        ok: false,
        error: expect.stringMatching(/META_TOKEN_KEY/),
      })
    expect(() => seal('t', { X_CLIENT_SECRET: 'x-secret' })).toThrow()
  })

  it('X asks with a PKCE challenge, LinkedIn with its member scope', () => {
    const p = pkce()
    expect(verifierOk(p.verifier.length)).toBe(true)
    const x = new URL(apiAuthorizeUrl('x', 'x-id', 's', p.challenge, env))
    expect(x.searchParams.get('code_challenge_method')).toBe('S256')
    expect(x.searchParams.get('scope')).toContain('offline.access')
    expect(x.searchParams.get('redirect_uri')).toBe(
      'https://r.example/api/social/meta/callback'
    )
    const li = new URL(apiAuthorizeUrl('linkedin', 'li-id', 's', null, env))
    expect(li.searchParams.get('scope')).toContain('w_member_social')
    expect(li.searchParams.has('code_challenge')).toBe(false)
  })

  it('the X verifier travels in the state row and back, once', async () => {
    const q = memoryPool()
    const { mintState } = await import('./meta-connect')
    const nonce = await mintState(q as never, '7', 'x', 'v'.repeat(64))
    const st = await takeState(q as never, nonce, Date.now())
    expect(st).toMatchObject({
      owner: '7',
      network: 'x',
      verifier: 'v'.repeat(64),
    })
    expect(await takeState(q as never, nonce, Date.now())).toBeNull()
  })

  it('X is connected with the verifier and keeps its refresh token sealed', async () => {
    // Long distinctive plaintexts: a two-letter token such as "R1" turns up
    // by chance inside random sealed base64 and made this test flaky (#3707).
    const ACCESS_PLAIN = 'ACCESS-TOKEN-PLAINTEXT-a1b2c3'
    const REFRESH_PLAIN = 'REFRESH-TOKEN-PLAINTEXT-r1s2t3'
    const q = memoryPool()
    const { f, calls } = fakeFetch(c =>
      c.url.endsWith('/oauth2/token')
        ? {
            json: {
              access_token: ACCESS_PLAIN,
              refresh_token: REFRESH_PLAIN,
              expires_in: 7200,
            },
          }
        : { json: { data: { id: '42', username: 'username' } } }
    )
    const who = await finishApiConnect(
      q as never,
      f,
      '7',
      'x',
      'code',
      'v'.repeat(64),
      0,
      env
    )
    expect(who).toBe('X @username')
    const form = calls[0].init?.body as URLSearchParams
    expect(form.get('code_verifier')).toBe('v'.repeat(64))
    expect(calls[0].init?.headers?.Authorization).toMatch(/^Basic /)
    const row = q.rows.get('7/x')
    expect(JSON.stringify(row)).not.toContain(REFRESH_PLAIN)
    expect(JSON.stringify(row)).not.toContain(ACCESS_PLAIN)
    // Encoded is not sealed: a seal that only base64-encodes passes the two
    // checks above and the round trip below together (#3712).
    for (const plain of [ACCESS_PLAIN, REFRESH_PLAIN])
      for (const enc of ['base64', 'base64url'] as const)
        expect(JSON.stringify(row)).not.toContain(
          Buffer.from(plain).toString(enc).replace(/=+$/, '')
        )
    // Sealed, not dropped: the stored value opens back to the token.
    const { unseal } = await import('./meta-connect')
    expect(unseal(String(row.meta.refresh_sealed), env)).toBe(REFRESH_PLAIN)
    // ...and only under its own key.
    expect(() =>
      unseal(String(row.meta.refresh_sealed), {
        ...env,
        META_TOKEN_KEY: 'another-key',
      })
    ).toThrow()
  })

  it('an X connect without its verifier is refused', async () => {
    const { f } = fakeFetch(() => ({}))
    await expect(
      finishApiConnect(memoryPool() as never, f, '7', 'x', 'c', null, 0, env)
    ).rejects.toThrow(/verifier/)
  })
})

describe('the X refresh', () => {
  it('is left alone while more than five minutes remain', async () => {
    const { f, calls } = fakeFetch(() => ({}))
    const t = held({ expiresAt: new Date(301_000) })
    expect(await refreshXIfDue(memoryPool() as never, f, '7', t, 0, env)).toBe(
      t
    )
    expect(calls).toHaveLength(0)
  })

  it('keeps the NEW refresh token: the old one is spent', async () => {
    const q = memoryPool()
    const { f, calls } = fakeFetch(() => ({
      json: { access_token: 'A2', refresh_token: 'R2', expires_in: 7200 },
    }))
    const t = held({
      expiresAt: new Date(299_000),
      meta: { username: 'username', refresh_sealed: seal('R1', env) },
    })
    const next = await refreshXIfDue(q as never, f, '7', t, 0, env)
    expect((calls[0].init?.body as URLSearchParams).get('refresh_token')).toBe(
      'R1'
    )
    expect(next.token).toBe('A2')
    const { unseal } = await import('./meta-connect')
    expect(unseal(String(next.meta.refresh_sealed), env)).toBe('R2')
    expect(unseal(q.rows.get('7/x').meta.refresh_sealed, env)).toBe('R2')
  })
})

describe('publishing', () => {
  const d = (f: Fetch) => ({ fetch: f, sleep: async () => undefined, env })

  it("LinkedIn's receipt is the post id from its header", async () => {
    const { f, calls } = fakeFetch(() => ({
      status: 201,
      headers: { 'x-restli-id': 'urn:li:share:9' },
    }))
    const url = await publishLinkedIn(
      held({ network: 'linkedin', accountId: 'abc' }),
      post,
      d(f)
    )
    expect(url).toBe('https://www.linkedin.com/feed/update/urn:li:share:9/')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.author).toBe('urn:li:person:abc')
    expect(body.content.article.source).toBe(post.link)
    expect(calls[0].init?.headers?.['LinkedIn-Version']).toMatch(/^\d{6}$/)
    expect(calls[0].url).toBe('https://api.linkedin.com/rest/posts')
    expect(calls[0].init?.headers?.['X-Restli-Protocol-Version']).toBe('2.0.0')
  })

  it('a LinkedIn 201 without an id is not a post', async () => {
    const { f } = fakeFetch(() => ({ status: 201 }))
    await expect(
      publishLinkedIn(held({ network: 'linkedin' }), post, d(f))
    ).rejects.toThrow(/no id/)
  })

  it("X's receipt is the post's own address", async () => {
    const { f, calls } = fakeFetch(() => ({
      status: 201,
      json: { data: { id: '77' } },
    }))
    expect(
      await publishX(held({ meta: { username: 'username' } }), post, d(f))
    ).toBe('https://x.com/username/status/77')
    expect(calls[0].url).toBe('https://api.x.com/2/tweets')
    expect(calls[0].init?.method).toBe('POST')
  })
})

describe('the desk', () => {
  it('posts LinkedIn and X with the receipt blog-share reads', async () => {
    const q = memoryPool()
    const { writeToken } = await import('./meta-connect')
    await writeToken(
      q as never,
      '7',
      {
        network: 'linkedin',
        accountId: 'abc',
        token: 'L',
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        meta: {},
      },
      env
    )
    await writeToken(
      q as never,
      '7',
      {
        network: 'x',
        accountId: '42',
        token: 'X',
        expiresAt: new Date(Date.now() + 3_600_000),
        meta: { username: 'username', refresh_sealed: seal('R', env) },
      },
      env
    )
    const { f } = fakeFetch(c =>
      c.url.includes('linkedin')
        ? { status: 201, headers: { 'x-restli-id': 'urn:li:share:1' } }
        : { status: 201, json: { data: { id: '5' } } }
    )
    const out = await postBySocialApi(q as never, '7', post, {
      fetch: f,
      sleep: async () => undefined,
      env,
    })
    expect(out.LinkedIn).toBe(
      `${VIA_API} · https://www.linkedin.com/feed/update/urn:li:share:1/`
    )
    expect(out.X).toBe(`${VIA_API} · https://x.com/username/status/5`)
  })

  it("Meta's poster leaves LinkedIn and X rows alone", async () => {
    const q = memoryPool()
    const { writeToken } = await import('./meta-connect')
    await writeToken(
      q as never,
      '7',
      {
        network: 'linkedin',
        accountId: 'abc',
        token: 'L',
        expiresAt: null,
        meta: {},
      },
      env
    )
    const { f, calls } = fakeFetch(() => ({}))
    const out = await postByApi(q as never, '7', post, {
      fetch: f,
      sleep: async () => undefined,
      env,
    })
    expect(out).toEqual({})
    expect(calls).toHaveLength(0)
  })

  it('`only` posts to the named networks and leaves the rest untouched', async () => {
    const q = memoryPool()
    const { writeToken } = await import('./meta-connect')
    for (const network of ['linkedin', 'x'] as const) {
      await writeToken(
        q as never,
        '7',
        {
          network,
          accountId: '42',
          token: 'T',
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
          meta: { username: 'username' },
        },
        env
      )
    }
    const { f, calls } = fakeFetch(() => ({
      status: 201,
      json: { data: { id: '5' } },
    }))
    const out = await postBySocialApi(q as never, '7', post, {
      fetch: f,
      sleep: async () => undefined,
      env,
      only: ['x'],
    })
    expect(Object.keys(out)).toEqual(['X'])
    expect(calls.every(c => !c.url.includes('linkedin'))).toBe(true)
  })

  it('an expired LinkedIn token says reconnect and posts nothing', async () => {
    const q = memoryPool()
    const { writeToken } = await import('./meta-connect')
    await writeToken(
      q as never,
      '7',
      {
        network: 'linkedin',
        accountId: 'abc',
        token: 'L',
        expiresAt: new Date(Date.now() - 1000),
        meta: {},
      },
      env
    )
    const { f, calls } = fakeFetch(() => ({}))
    const out = await postBySocialApi(q as never, '7', post, {
      fetch: f,
      sleep: async () => undefined,
      env,
    })
    expect(out.LinkedIn).toMatch(/заново/) // cyrillic-ok: the owner's words
    expect(calls).toHaveLength(0)
  })

  it('a token never reaches an error message', () => {
    const tok = 'AQV' + 'x'.repeat(60)
    expect(scrub(`401 Bearer ${tok}`)).not.toContain(tok)
    expect(scrub(`refresh_token=abc123&x=1`)).not.toContain('abc123')
    expect(scrub(`failed: ${tok}`)).not.toContain(tok)
  })
})
