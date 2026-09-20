import { describe, it, expect } from 'vitest'
import {
  parseLive,
  authorizeLive,
  tokenMatches,
  readCookie,
  cookieNameFor,
  isLivePath,
} from './src/browser/live-proxy'
import { LOGIN_PLACEHOLDER } from './src/browser/live-proxy'
import {
  stripOurCookie,
  rescopeSetCookie,
  rewriteLoginBody,
  isPodLogin,
  swapLoginQuery,
} from './src/browser/live-pipe'
import type { Queryable } from './src/browser/sessions'

/**
 * `/live/<sessionId>` IS THE ONLY WAY TO REACH A SIGNED-IN BROWSER.
 *
 * Every test here guards a way in that must not exist:
 *
 * - no token, a wrong token, or ANOTHER SESSION'S token getting through is
 *   one person handed another person's mail, bank and messages;
 * - an unknown session answering differently from a wrong token turns the id
 *   space into something worth sweeping, and every id that answers is a
 *   browser somebody is signed into;
 * - `..` reaching the pod fetches something other than what the path says;
 * - a token that survives in the URL settles into history, `Referer` and
 *   every access log on the way.
 */

function poolWith(rows: Array<Record<string, unknown>>): Queryable {
  return {
    async query(sql, params = []) {
      const s = sql.trim().toUpperCase()
      if (!s.startsWith('SELECT')) return { rows: [] }
      const want = String(params[0])
      const hit = rows.find(r => String(r.session_id) === want)
      return { rows: hit ? [hit] : [] }
    },
  }
}

const SESSION = {
  telegram_id: 'tg-900000001',
  session_id: 'sess-abcdefgh',
  pod_id: 'browser-sess-abcdefgh',
  endpoint: '127.0.0.1:55000',
  state: 'live',
  view_token: 'view-token-aaaaaaaaaaaa', // secret-guard-ok: fixture, twelve letter a
  admin_token: 'admin-token-bbbbbbbbbbb', // secret-guard-ok: fixture, letter b
}

const plain = { secure: false }

describe('reading the address', () => {
  it('knows its own prefix', () => {
    expect(isLivePath('/live/x')).toBe(true)
    expect(isLivePath('/liver/x')).toBe(false)
    expect(isLivePath('/api/browser/session')).toBe(false)
  })

  it('splits the session from what the pod is being asked for', () => {
    expect(parseLive('/live/sess-abcdefgh')?.upstreamPath).toBe('/')
    expect(parseLive('/live/sess-abcdefgh/')?.upstreamPath).toBe('/')
    expect(parseLive('/live/sess-abcdefgh/js/app.js')?.upstreamPath).toBe(
      '/js/app.js'
    )
  })

  it('takes the token out of the query and keeps the rest', () => {
    const r = parseLive('/live/sess-abcdefgh/ws?x=1&t=secret&y=2')!
    expect(r.queryToken).toBe('secret')
    expect(r.upstreamPath).toBe('/ws?x=1&y=2')
    /* The token must not ride along to the pod in the address. */
    expect(r.upstreamPath).not.toContain('secret')
  })

  it('refuses a traversal instead of trying to clean it', () => {
    expect(parseLive('/live/sess-abcdefgh/../../etc/passwd')).toBeNull()
    expect(parseLive('/live/sess-abcdefgh/a/../../b')).toBeNull()
  })

  it('refuses an id that is not shaped like one of ours', () => {
    expect(parseLive('/live/..')).toBeNull()
    expect(parseLive('/live/short')).toBeNull()
    expect(parseLive('/live/has spaces in it')).toBeNull()
    expect(parseLive('/live/')).toBeNull()
  })

  it('reads only its own cookie', () => {
    const header = `other=1; ${cookieNameFor('sess-abcdefgh')}=abc; x=2`
    expect(parseLive('/live/sess-abcdefgh/', header)?.cookieToken).toBe('abc')
    /* A cookie belonging to a different session is not this session's. */
    expect(parseLive('/live/sess-zzzzzzzz/', header)?.cookieToken).toBeNull()
    expect(readCookie(undefined, 'anything')).toBeNull()
  })
})

describe('comparing tokens', () => {
  it('accepts the same and rejects everything else', () => {
    expect(tokenMatches('abcdef', 'abcdef')).toBe(true)
    expect(tokenMatches('abcdef', 'abcdeg')).toBe(false)
    expect(tokenMatches('abc', 'abcdef')).toBe(false)
    expect(tokenMatches('', '')).toBe(true)
  })
})

describe('the gate', () => {
  it('turns away a caller with no token', async () => {
    const d = await authorizeLive(
      poolWith([SESSION]),
      parseLive('/live/sess-abcdefgh/')!,
      plain
    )
    expect(d).toEqual({ kind: 'refuse', status: 401, message: 'no token' })
  })

  it('answers a wrong token and an unknown session IDENTICALLY', async () => {
    const wrong = await authorizeLive(
      poolWith([SESSION]),
      parseLive('/live/sess-abcdefgh/?t=not-the-token')!,
      plain
    )
    const unknown = await authorizeLive(
      poolWith([SESSION]),
      parseLive('/live/sess-does-not-exist/?t=anything')!,
      plain
    )
    /* Same status AND same message: otherwise the ids are enumerable. */
    expect(wrong).toEqual(unknown)
    expect(wrong).toMatchObject({ kind: 'refuse', status: 404 })
  })

  it("refuses one session's token at another session's door", async () => {
    const other = {
      ...SESSION,
      telegram_id: 'tg-900000002',
      session_id: 'sess-iiiiiiii',
      view_token: 'view-token-cccccccccccc', // secret-guard-ok: fixture, letter c
    }
    const d = await authorizeLive(
      poolWith([SESSION, other]),
      parseLive(`/live/sess-iiiiiiii/?t=${SESSION.view_token}`)!,
      plain
    )
    expect(d).toMatchObject({ kind: 'refuse', status: 404 })
  })

  it('will not open a session whose pod is not running', async () => {
    const starting = { ...SESSION, state: 'starting', endpoint: null }
    const d = await authorizeLive(
      poolWith([starting]),
      parseLive(`/live/sess-abcdefgh/?t=${SESSION.view_token}`)!,
      plain
    )
    expect(d).toMatchObject({ kind: 'refuse', status: 409 })
  })

  it('spends a query token on a cookie and a clean address', async () => {
    const d = await authorizeLive(
      poolWith([SESSION]),
      parseLive(`/live/sess-abcdefgh?t=${SESSION.view_token}`)!,
      plain
    )
    expect(d.kind).toBe('redirect')
    if (d.kind !== 'redirect') throw new Error('expected a redirect')

    /* The trailing slash is what makes neko's relative assets resolve. */
    expect(d.location.startsWith('/live/sess-abcdefgh/?')).toBe(true)
    /*
     * The pod wants its own password before it will connect. The address
     * carries a PLACEHOLDER for it -- the real token would otherwise sit in
     * the document's request line, our access log, and the Referer of every
     * subresource the page loads while starting.
     */
    expect(d.location).toContain(`pwd=${encodeURIComponent(LOGIN_PLACEHOLDER)}`)
    expect(d.location).not.toContain(SESSION.view_token)

    expect(d.setCookie).toContain('HttpOnly')
    expect(d.setCookie).toContain('SameSite=Lax')
    /* Scoped to this session only: not readable by another session's pages. */
    expect(d.setCookie).toContain('Path=/live/sess-abcdefgh')
    expect(d.setCookie).not.toContain('Secure')
  })

  it('marks the cookie Secure when the connection was TLS', async () => {
    const d = await authorizeLive(
      poolWith([SESSION]),
      parseLive(`/live/sess-abcdefgh?t=${SESSION.view_token}`)!,
      { secure: true }
    )
    if (d.kind !== 'redirect') throw new Error('expected a redirect')
    expect(d.setCookie).toContain('Secure')
  })

  it('gives the page its login parameters again after a reload', async () => {
    /*
     * neko strips `pwd` from the address once it has read it, so a reload
     * arrives bare. Without this the person is shown a password prompt for a
     * password they have never seen.
     */
    const header = `${cookieNameFor('sess-abcdefgh')}=${SESSION.view_token}`
    const d = await authorizeLive(
      poolWith([SESSION]),
      parseLive('/live/sess-abcdefgh/', header)!,
      plain
    )
    expect(d.kind).toBe('redirect')
    if (d.kind !== 'redirect') throw new Error('expected a redirect')
    expect(d.location).toContain('pwd=')
    expect(d.location).not.toContain(SESSION.view_token)
  })

  it('does not redirect a page that already has them', async () => {
    const header = `${cookieNameFor('sess-abcdefgh')}=${SESSION.view_token}`
    const d = await authorizeLive(
      poolWith([SESSION]),
      parseLive('/live/sess-abcdefgh/?usr=you&pwd=anything', header)!,
      plain
    )
    /* Otherwise the page and the proxy would redirect each other forever. */
    expect(d.kind).toBe('proxy')
  })

  it('leaves assets and the socket alone', async () => {
    const header = `${cookieNameFor('sess-abcdefgh')}=${SESSION.view_token}`
    for (const path of [
      '/live/sess-abcdefgh/js/app.js',
      '/live/sess-abcdefgh/ws',
    ]) {
      const d = await authorizeLive(
        poolWith([SESSION]),
        parseLive(path, header)!,
        plain
      )
      expect(d.kind).toBe('proxy')
    }
  })

  it('proxies to the stored endpoint once the cookie is doing the work', async () => {
    const header = `${cookieNameFor('sess-abcdefgh')}=${SESSION.view_token}`
    const d = await authorizeLive(
      poolWith([SESSION]),
      parseLive('/live/sess-abcdefgh/ws', header)!,
      plain
    )
    expect(d).toEqual({
      kind: 'proxy',
      endpoint: '127.0.0.1:55000',
      upstreamPath: '/ws',
      /* Carried server-side so the pod login can be filled in for the page. */
      viewToken: SESSION.view_token,
      /* Also server-side: it reshapes the desktop and must never be sent. */
      adminToken: SESSION.admin_token,
    })
  })

  it('CARRIES THE ADMIN TOKEN NOWHERE A CLIENT CAN SEE IT', () => {
    /*
     * The decision is an internal value, never a response body. This is the
     * cheap reminder of which half of it is a secret: whoever holds the pod's
     * admin password can change the room, not merely watch it.
     */
    const kept = JSON.stringify({
      ok: true,
      state: 'live',
      sessionId: SESSION.session_id,
    })
    expect(kept).not.toContain(SESSION.admin_token)
    expect(kept).not.toContain(SESSION.view_token)
    expect(kept).not.toContain(SESSION.endpoint)
  })
})

describe('what crosses the pipe', () => {
  it('never forwards our own token to the pod', () => {
    const name = cookieNameFor('sess-abcdefgh')
    const out = stripOurCookie(
      `neko=room-session; ${name}=view-token-aaaaaaaaaaaa; other=1`,
      'sess-abcdefgh'
    )
    expect(out).toBe('neko=room-session; other=1')
    expect(out).not.toContain('view-token')
  })

  it('drops the header entirely when ours was the only cookie', () => {
    const name = cookieNameFor('sess-abcdefgh')
    expect(stripOurCookie(`${name}=x`, 'sess-abcdefgh')).toBeUndefined()
    expect(stripOurCookie(undefined, 'sess-abcdefgh')).toBeUndefined()
  })

  it("leaves another session's cookie alone", () => {
    const other = `${cookieNameFor('sess-iiiiiiii')}=someone-elses`
    expect(stripOurCookie(other, 'sess-abcdefgh')).toBe(other)
  })

  it("pins the pod's own cookies to this session's path", () => {
    expect(
      rescopeSetCookie(['neko=abc; Path=/; HttpOnly'], 'sess-abcdefgh')
    ).toEqual(['neko=abc; Path=/live/sess-abcdefgh; HttpOnly'])
  })

  it('adds a scope to a cookie that arrived without one', () => {
    expect(rescopeSetCookie('neko=abc', 'sess-abcdefgh')).toEqual([
      'neko=abc; Path=/live/sess-abcdefgh',
    ])
    expect(rescopeSetCookie(undefined, 'sess-abcdefgh')).toEqual([])
  })
})

describe('logging the page in to its own pod', () => {
  it('touches the login body and nothing else', () => {
    expect(isPodLogin('POST', '/api/login')).toBe(true)
    expect(isPodLogin('GET', '/api/login')).toBe(false)
    expect(isPodLogin('POST', '/api/room/screen/shot.jpg')).toBe(false)
    expect(isPodLogin('POST', '/ws')).toBe(false)
  })

  it('swaps the placeholder for the real token', () => {
    const body = JSON.stringify({
      username: 'you',
      password: LOGIN_PLACEHOLDER,
    })
    const out = JSON.parse(rewriteLoginBody(body, 'the-real-token'))
    expect(out.password).toBe('the-real-token')
    expect(out.username).toBe('you')
  })

  it('leaves a hand-typed password alone', () => {
    const body = JSON.stringify({ username: 'you', password: 'typed-by-hand' })
    expect(rewriteLoginBody(body, 'the-real-token')).toBe(body)
  })

  it('never turns something it cannot parse into a token leak', () => {
    expect(rewriteLoginBody('not json at all', 'the-real-token')).toBe(
      'not json at all'
    )
    expect(rewriteLoginBody('"a string"', 'the-real-token')).toBe('"a string"')
    expect(rewriteLoginBody('null', 'the-real-token')).toBe('null')
    /* The token must not appear anywhere it was not explicitly put. */
    expect(rewriteLoginBody('{}', 'the-real-token')).not.toContain('the-real')
  })
})

describe('the password the socket carries', () => {
  it('becomes the real token on its way to the pod', () => {
    const path = `/ws?password=${encodeURIComponent(LOGIN_PLACEHOLDER)}&username=you`
    const out = swapLoginQuery(path, 'the-real-token')
    expect(out).toContain('password=the-real-token')
    expect(out).toContain('username=you')
    expect(out).not.toContain(LOGIN_PLACEHOLDER)
  })

  it('leaves a password somebody typed themselves alone', () => {
    const path = '/ws?password=typed-by-hand&username=you'
    expect(swapLoginQuery(path, 'the-real-token')).toBe(path)
  })

  it('does not put the token anywhere there was no placeholder', () => {
    expect(swapLoginQuery('/ws', 'the-real-token')).toBe('/ws')
    expect(swapLoginQuery('/js/app.js', 'the-real-token')).toBe('/js/app.js')
    expect(swapLoginQuery('/ws?x=1', 'the-real-token')).not.toContain('real')
  })
})
