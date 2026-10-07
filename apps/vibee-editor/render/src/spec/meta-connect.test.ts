import { describe, expect, it, vi } from 'vitest'
import * as SPEC from './meta-connect.gen'
import {
  daysLeftOf,
  fitsThreads,
  givenUp,
  igCaption,
  IG_NOT_LINKED,
  lastPollMs,
  postByApi,
  posted,
  publishInstagram,
  readTokensRelinked,
  ready,
  relinkInstagram,
  retryAfterRelink,
  route,
  scrub,
  seal,
  shouldRefresh,
  shouldRelink,
  stateOk,
  statusView,
  takeState,
  threadsPost,
  unseal,
  usable,
  type Fetch,
  type HeldToken,
} from '../agent/meta-connect'
import { handleMeta } from '../agent/meta-routes'

/**
 * THE META CONNECTOR IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/meta-connect.t27 is the spec of record; that
 * the vendored copy, its generated module and the host agree is held by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * HOST: the pure rules of src/agent/meta-connect.ts, its publish against a
 * fake Graph API that records every call, and the doors of meta-routes.ts.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/meta-connect
 */

const env = { META_TOKEN_KEY: 'k', META_GRAPH_VERSION: 'v23.0' }
const post = {
  title: 'Title',
  link: 'https://t27.ai/blog/s',
  summary: 'Summary',
  cardUrl: 'https://r/api/social/card/s.jpg',
}

/** A Graph API that answers from a script and writes down each call. */
function fakeGraph(statuses: string[] = ['FINISHED']) {
  const calls: string[] = []
  let polls = 0
  const f: Fetch = async (url, init) => {
    const full = init?.body ? `${url}?${init.body}` : url
    calls.push(`${init?.method || 'GET'} ${full}`)
    const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j })
    if (/fields=status/.test(full)) {
      const s = statuses[Math.min(polls++, statuses.length - 1)]
      return ok({ status: s, status_code: s })
    }
    if (/fields=permalink/.test(full))
      return ok({ permalink: 'https://p/1', permalink_url: 'https://p/1' })
    if (/\/media_publish|\/threads_publish/.test(url)) return ok({ id: 'pub1' })
    return ok({ id: 'c1' })
  }
  return { f, calls }
}

function token(over: Partial<HeldToken> = {}): HeldToken {
  return {
    network: 'facebook',
    accountId: 'page1',
    token: 'EAAsecretsecretsecretsecret', // secret-guard-ok: a fake token shape for the scrub test
    expiresAt: null,
    refreshedAt: new Date(0),
    meta: { ig_id: 'ig1' },
    ...over,
  }
}

/** A pool holding the rows given, sealed with the test key. */
function poolWith(rows: Array<Record<string, unknown>>) {
  const sql: string[] = []
  return {
    sql,
    query: async (q: string) => {
      sql.push(q)
      return { rows: /SELECT network/.test(q) ? rows : [] }
    },
  }
}

const T0 = 1_700_000_000_000

/** A facebook row as Postgres holds it, sealed with the test key. */
function fbRow(
  meta: Record<string, unknown>,
  tok = 'EAAtokentokentokentoken' // secret-guard-ok: a fake token shape
) {
  return {
    network: 'facebook',
    account_id: 'page1',
    token_sealed: seal(tok, env),
    expires_at: null,
    refreshed_at: new Date(0).toISOString(),
    meta,
  }
}

/** A pool that hands out copies of its rows and writes down every UPDATE. */
function relinkPool(rows: Array<Record<string, unknown>>) {
  const sql: string[] = []
  const updates: unknown[][] = []
  return {
    sql,
    updates,
    query: async (q: string, params: unknown[] = []) => {
      sql.push(q)
      if (/UPDATE social_tokens/.test(q)) updates.push(params)
      return {
        rows: /SELECT network/.test(q)
          ? rows.map(r => ({ ...r, meta: { ...(r.meta as object) } }))
          : [],
      }
    },
  }
}

/**
 * A Graph API whose Page answers with the Instagram account given (null: no
 * Instagram; 'error': Graph refuses, echoing the token as Meta's errors can),
 * and whose /media fails for the account ids listed in `refused`.
 */
function relinkGraph(
  ig: { id: string; username: string } | null | 'error',
  refused: string[] = [],
  echo = ''
) {
  const calls: string[] = []
  const f: Fetch = async (url, init) => {
    const full = init?.body ? `${url}?${init.body}` : url
    calls.push(`${init?.method || 'GET'} ${full}`)
    const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j })
    const bad = (m: string) => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: m } }),
    })
    if (/fields=instagram_business_account/.test(full)) {
      if (ig === 'error') return bad(`Invalid OAuth access_token ${echo}`)
      return ok(
        ig ? { id: 'page1', instagram_business_account: ig } : { id: 'page1' }
      )
    }
    const m = /\/([^/]+)\/media$/.exec(url)
    if (m && refused.includes(m[1]))
      return bad(`Unsupported post request on ${m[1]} ${echo}`)
    if (/fields=status/.test(full))
      return ok({ status: 'FINISHED', status_code: 'FINISHED' })
    if (/fields=permalink/.test(full))
      return ok({ permalink: 'https://p/1', permalink_url: 'https://p/1' })
    if (/\/media_publish|\/threads_publish/.test(url)) return ok({ id: 'pub1' })
    return ok({ id: 'c1' })
  }
  return {
    f,
    calls,
    pageReads: () =>
      calls.filter(c => c.includes('instagram_business_account')).length,
  }
}

describe('meta-connect.t27 against the host', () => {
  it('a held token goes by the API, a signed-in browser by the browser, else nothing', async () => {
    expect(route(true, false)).toBe('api')
    expect(route(true, true)).toBe('api')
    expect(route(false, true)).toBe('browser')
    expect(route(false, false)).toBe('skip')
    /* And the host keeps it: no token held, nothing is posted by the API. */
    const { f, calls } = fakeGraph()
    const out = await postByApi(poolWith([]) as never, '1', post, {
      fetch: f,
      sleep: async () => undefined,
      env,
    })
    expect(out).toEqual({})
    expect(calls).toEqual([])
  })

  it('a token is refreshed near its end, once it is a day old', () => {
    expect(shouldRefresh(15, 24)).toBe(true)
    expect(shouldRefresh(1, 1000)).toBe(true)
    expect(shouldRefresh(16, 1000)).toBe(false)
    expect(shouldRefresh(10, 23)).toBe(false)
    expect(shouldRefresh(0, 1000)).toBe(false)
    expect(SPEC.REFRESH_DAYS_LEFT).toBeLessThan(SPEC.LONG_TOKEN_DAYS)
  })

  it('a page token never ends, a long-lived one does', () => {
    expect(usable(false, 0)).toBe(true)
    expect(usable(true, 1)).toBe(true)
    expect(usable(true, 0)).toBe(false)
    expect(SPEC.PAGE_TOKEN_EXPIRES).toBe(false)
    expect(daysLeftOf({ expiresAt: null }, 0)).toBe(Infinity)
    expect(daysLeftOf({ expiresAt: new Date(86_400_000 * 3) }, 0)).toBe(3)
  })

  it('a Threads post fits its characters and its links', () => {
    expect(fitsThreads(500, 5)).toBe(true)
    expect(fitsThreads(501, 1)).toBe(false)
    expect(fitsThreads(10, 6)).toBe(false)
    expect(fitsThreads(0, 0)).toBe(true)
    /* The host's own post is cut to fit and keeps the link whole. */
    const long = threadsPost({ ...post, title: 'x'.repeat(900) })
    expect(long.length).toBeLessThanOrEqual(SPEC.THREADS_TEXT_MAX)
    expect(long.endsWith(post.link)).toBe(true)
    expect(
      igCaption({ ...post, summary: 'y'.repeat(5000) }).length
    ).toBeLessThanOrEqual(SPEC.IG_CAPTION_MAX)
  })

  it('a container is published only when finished, and given up when it failed', async () => {
    expect(ready('FINISHED')).toBe(true)
    expect(ready('IN_PROGRESS')).toBe(false)
    expect(ready('ERROR')).toBe(false)
    expect(givenUp('ERROR')).toBe(true)
    expect(givenUp('EXPIRED')).toBe(true)
    expect(givenUp('IN_PROGRESS')).toBe(false)
    expect(givenUp('FINISHED')).toBe(false)
    const failed = fakeGraph(['IN_PROGRESS', 'ERROR'])
    await expect(
      publishInstagram(token(), post, {
        fetch: failed.f,
        sleep: async () => undefined,
        env,
      })
    ).rejects.toThrow(/ERROR/)
    expect(failed.calls.some(c => c.includes('media_publish'))).toBe(false)
    const fine = fakeGraph(['IN_PROGRESS', 'FINISHED'])
    await publishInstagram(token(), post, {
      fetch: fine.f,
      sleep: async () => undefined,
      env,
    })
    expect(fine.calls.some(c => c.includes('media_publish'))).toBe(true)
  })

  it('a container is waited on about half a minute', async () => {
    expect(SPEC.POLL_EVERY_MS).toBe(3000)
    expect(SPEC.POLLS).toBe(10)
    expect(lastPollMs()).toBe(27000)
    /* The host sleeps exactly that long before it gives up. */
    const slept: number[] = []
    const stuck = fakeGraph(['IN_PROGRESS'])
    await expect(
      publishInstagram(token(), post, {
        fetch: stuck.f,
        sleep: async ms => void slept.push(ms),
        env,
      })
    ).rejects.toThrow(/in time/)
    expect(slept.reduce((a, b) => a + b, 0)).toBe(lastPollMs())
  })

  it('posted means the published id came back', async () => {
    expect(posted('17895695668004550')).toBe(true)
    expect(posted('')).toBe(false)
    const { f } = fakeGraph()
    const out = await postByApi(
      poolWith([
        {
          network: 'facebook',
          account_id: 'page1',
          token_sealed: seal('EAAtokentokentokentoken', env),
          expires_at: null,
          refreshed_at: new Date(0).toISOString(),
          meta: { ig_id: 'ig1' },
        },
      ]) as never,
      '1',
      post,
      { fetch: f, sleep: async () => undefined, env }
    )
    expect(out.Facebook).toMatch(/^опубликовано через API · https:\/\/p\/1$/) // cyrillic-ok: meta-connect.ts VIA_API
    expect(out.Instagram).toMatch(/^опубликовано через API/) // cyrillic-ok: meta-connect.ts VIA_API
  })

  it('an OAuth state is good once and for ten minutes', async () => {
    expect(stateOk(0, false)).toBe(true)
    expect(stateOk(599999, false)).toBe(true)
    expect(stateOk(600000, false)).toBe(false)
    expect(stateOk(0, true)).toBe(false)
    /* The host takes a state with one UPDATE ... WHERE used = false. */
    const at = new Date(1_000_000).toISOString()
    const q = {
      query: async (s: string) => ({
        rows: /UPDATE social_oauth_states/.test(s)
          ? [{ owner: '1', network: 'threads', created_at: at }]
          : [],
      }),
    }
    expect(await takeState(q as never, 'n', 1_000_000 + 599_999)).toEqual({
      owner: '1',
      network: 'threads',
      /* Only an X connect keeps a PKCE verifier (social-api.t27). */
      verifier: null,
    })
    expect(await takeState(q as never, 'n', 1_000_000 + 600_000)).toBeNull()
    expect(await takeState(q as never, '', 0)).toBeNull()
  })

  it("the desk stays far under every network's daily ceiling", () => {
    expect(SPEC.DESK_POSTS_PER_DAY).toBeLessThan(SPEC.IG_POSTS_PER_DAY)
    expect(SPEC.DESK_POSTS_PER_DAY).toBeLessThan(SPEC.THREADS_POSTS_PER_DAY)
    expect(SPEC.THREADS_TEXT_MAX).toBeLessThan(SPEC.IG_CAPTION_MAX)
  })

  it('the card is the tallest shape Instagram keeps', async () => {
    expect(SPEC.CARD_W).toBe(1080)
    expect(SPEC.CARD_H).toBe(1350)
    expect(SPEC.CARD_H * 4).toBe(SPEC.CARD_W * 5)
    const { wrap } = await import('../agent/meta-card')
    expect(wrap('a bb ccc', 4, s => s.length)).toEqual(['a bb', 'ccc'])
  })

  it('the token never leaves the server and nothing posts without a yes', async () => {
    expect(SPEC.TOKEN_LEAVES_SERVER).toBe(false)
    expect(SPEC.ASK_NEEDS_YES).toBe(true)
    const secret = 'EAAsecretsecretsecretsecret' // secret-guard-ok: a fake token shape for the scrub test
    expect(unseal(seal(secret, env), env)).toBe(secret)
    expect(seal(secret, env)).not.toContain(secret)
    expect(scrub(`bad access_token=${secret}&x=1`)).not.toContain(secret)
    expect(scrub(`token ${secret} refused`)).not.toContain(secret)
    expect(
      JSON.stringify(statusView([token({ token: secret })], 0))
    ).not.toContain(secret)
    /* Connecting is the owner's own act: the agent's key is refused. */
    const deps = {
      getPool: async () => poolWith([]) as never,
      identity: () => '1',
      actor: () => 'agent' as const,
      owner: '1',
      fetch: fakeGraph().f,
      now: () => 0,
      titleOf: async () => null,
      drawCard: async () => Buffer.from(''),
    }
    const out = await handleMeta(
      { url: '/api/social/meta/start?network=threads' },
      deps
    )
    expect(out.status).toBe(403)
    const stranger = await handleMeta(
      { url: '/api/social/meta/status' },
      { ...deps, identity: () => '2' }
    )
    expect(stranger.status).toBe(403)
  })

  it('an Instagram linked after Connect is read again, at most once in ten minutes', async () => {
    expect(shouldRelink(false, false, 600000)).toBe(true)
    expect(shouldRelink(false, false, 4294967295)).toBe(true)
    expect(shouldRelink(false, false, 599999)).toBe(false)
    expect(shouldRelink(true, true, 600000)).toBe(true)
    expect(shouldRelink(true, true, 599999)).toBe(false)
    expect(shouldRelink(true, false, 4294967295)).toBe(false)
    expect(SPEC.IG_RELINK_EVERY_MS).toBe(SPEC.STATE_TTL_MS)
    expect(SPEC.IG_RELINK_NEEDS_CONSENT).toBe(false)

    /* The host: an empty row, the Page now linked -> healed, saved, posted. */
    const linked = relinkGraph({ id: 'ig9', username: 't27_dev' })
    const pool = relinkPool([fbRow({})])
    const out = await postByApi(pool as never, '1', post, {
      fetch: linked.f,
      sleep: async () => undefined,
      env,
      now: () => T0,
    })
    expect(out.Instagram).toMatch(/^опубликовано через API/) // cyrillic-ok: meta-connect.ts VIA_API
    expect(linked.calls.some(c => c.includes('/ig9/media_publish'))).toBe(true)
    expect(linked.pageReads()).toBe(1)
    expect(JSON.parse(String(pool.updates[0][2]))).toEqual({
      ig_checked_at: T0,
      ig_id: 'ig9',
      ig_username: 't27_dev',
    })
    /* Only meta is written: the sealed token is not re-sealed or touched. */
    expect(pool.sql.some(q => /token_sealed\s*=/.test(q))).toBe(false)
    /* No consent asked: the stored Page token is what reads the Page. */
    expect(
      linked.calls.find(c => c.includes('instagram_business_account'))
    ).toMatch(/^GET https:\/\/graph\.facebook\.com\/v23\.0\/page1\?/)

    /* A Page with no Instagram: a clear line, and no second look in the window. */
    const none = relinkGraph(null)
    const first = await postByApi(relinkPool([fbRow({})]) as never, '1', post, {
      fetch: none.f,
      sleep: async () => undefined,
      env,
      now: () => T0,
    })
    expect(first.Instagram).toBe(IG_NOT_LINKED)
    expect(none.pageReads()).toBe(1)
    const marked = fbRow({ ig_checked_at: T0, ig_id: null })
    const again = await postByApi(relinkPool([marked]) as never, '1', post, {
      fetch: none.f,
      sleep: async () => undefined,
      env,
      now: () => T0 + SPEC.IG_RELINK_EVERY_MS - 1,
    })
    expect(again.Instagram).toBe(IG_NOT_LINKED)
    expect(none.pageReads()).toBe(1)
    expect(none.calls.some(c => c.includes('/media'))).toBe(false)
    /* The window over: the Page is asked once more. */
    await postByApi(relinkPool([marked]) as never, '1', post, {
      fetch: none.f,
      sleep: async () => undefined,
      env,
      now: () => T0 + SPEC.IG_RELINK_EVERY_MS,
    })
    expect(none.pageReads()).toBe(2)

    /* The status read (GET /api/social/meta/status) heals the row too. */
    const read = await readTokensRelinked(
      relinkPool([fbRow({})]) as never,
      relinkGraph({ id: 'ig9', username: 't27_dev' }).f,
      '1',
      T0,
      env
    )
    expect(read[0].meta.ig_username).toBe('t27_dev')
    /* The door unseals with the service's own key, as in production. */
    vi.stubEnv('META_TOKEN_KEY', env.META_TOKEN_KEY)
    const view = await handleMeta(
      { url: '/api/social/meta/status' },
      {
        getPool: async () => relinkPool([fbRow({})]) as never,
        identity: () => '1',
        actor: () => 'person' as const,
        owner: '1',
        fetch: relinkGraph({ id: 'ig9', username: 't27_dev' }).f,
        now: () => T0,
        titleOf: async () => null,
        drawCard: async () => Buffer.from(''),
      }
    )
    const nets = (
      view as unknown as { json: { networks: Array<{ instagram: unknown }> } }
    ).json.networks
    vi.unstubAllEnvs()
    expect(nets[0].instagram).toBe('t27_dev')
  })

  it('a failed Instagram publish is retried once, only for another account', async () => {
    expect(retryAfterRelink('', 'ig2')).toBe(true)
    expect(retryAfterRelink('ig1', 'ig2')).toBe(true)
    expect(retryAfterRelink('ig1', 'ig1')).toBe(false)
    expect(retryAfterRelink('ig1', '')).toBe(false)
    expect(SPEC.IG_PUBLISH_RETRIES).toBe(1)

    /* The row names an old account; the Page now links another. */
    const moved = relinkGraph({ id: 'ig2', username: 'new' }, ['ig1'])
    const inside = await postByApi(
      relinkPool([fbRow({ ig_id: 'ig1', ig_checked_at: T0 - 1 })]) as never,
      '1',
      post,
      { fetch: moved.f, sleep: async () => undefined, env, now: () => T0 }
    )
    /* Inside the window a failure does not look again... */
    expect(inside.Instagram).toMatch(/^ошибка API/) // cyrillic-ok: meta-connect.ts postInstagram
    expect(moved.pageReads()).toBe(0)
    const later = await postByApi(
      relinkPool([fbRow({ ig_id: 'ig1', ig_checked_at: 1 })]) as never,
      '1',
      post,
      { fetch: moved.f, sleep: async () => undefined, env, now: () => T0 }
    )
    /* ...outside it: one look, one retry on the new account, and it posts. */
    expect(later.Instagram).toMatch(/^опубликовано через API/) // cyrillic-ok: meta-connect.ts VIA_API
    expect(moved.pageReads()).toBe(1)
    expect(
      moved.calls.filter(c => c.includes('/ig2/media_publish'))
    ).toHaveLength(1)

    /* The same account comes back: no retry, the first error is told. */
    const same = relinkGraph({ id: 'ig1', username: 'old' }, ['ig1'])
    const told = await postByApi(
      relinkPool([fbRow({ ig_id: 'ig1', ig_checked_at: 1 })]) as never,
      '1',
      post,
      { fetch: same.f, sleep: async () => undefined, env, now: () => T0 }
    )
    expect(told.Instagram).toMatch(/^ошибка API/) // cyrillic-ok: meta-connect.ts postInstagram
    expect(same.calls.filter(c => c.includes('/ig1/media?'))).toHaveLength(1)

    /* media_publish itself failed: the post may be up, so even another
       account coming back is not retried -- nothing is posted twice. */
    const maybe = relinkGraph({ id: 'ig2', username: 'new' })
    const maybeFetch: Fetch = async (url, init) =>
      /\/ig1\/media_publish$/.test(url)
        ? (maybe.calls.push(`POST ${url}`),
          Promise.reject(new Error('timeout')))
        : maybe.f(url, init)
    const once = await postByApi(
      relinkPool([fbRow({ ig_id: 'ig1', ig_checked_at: 1 })]) as never,
      '1',
      post,
      { fetch: maybeFetch, sleep: async () => undefined, env, now: () => T0 }
    )
    expect(once.Instagram).toMatch(/^ошибка API/) // cyrillic-ok: meta-connect.ts postInstagram
    expect(maybe.calls.filter(c => c.includes('/media_publish'))).toHaveLength(
      1
    )
    expect(maybe.calls.filter(c => c.includes('/ig2/'))).toHaveLength(0)

    /* A Graph error on the re-read is not an answer: the row keeps its own. */
    const kept = await relinkInstagram(
      relinkPool([]) as never,
      relinkGraph('error').f,
      '1',
      token({ meta: { ig_id: 'ig1' } }),
      T0,
      true,
      env
    )
    expect(kept.meta.ig_id).toBe('ig1')
    expect(kept.meta.ig_checked_at).toBe(T0)

    /* And the token never reaches a log or an answer on this road. */
    const secret = 'EAAsecretsecretsecretsecret' // secret-guard-ok: a fake token shape for the scrub test
    const logged: string[] = []
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        logged.push(a.map(String).join(' '))
      })
    )
    try {
      const res = await postByApi(
        relinkPool([fbRow({}, secret)]) as never,
        '1',
        post,
        {
          fetch: relinkGraph('error', [], secret).f,
          sleep: async () => undefined,
          env,
          now: () => T0,
        }
      )
      expect(JSON.stringify(res)).not.toContain(secret)
      const healed = await readTokensRelinked(
        relinkPool([fbRow({}, secret)]) as never,
        relinkGraph({ id: 'ig9', username: 'x' }).f,
        '1',
        T0,
        env
      )
      expect(JSON.stringify(statusView(healed, T0))).not.toContain(secret)
    } finally {
      spies.forEach(s => s.mockRestore())
    }
    expect(logged.join('\n')).not.toContain(secret)
  })

  it('nothing has been posted through it yet', () => {
    expect(SPEC.RUN_LIVE).toBe(false)
    expect(SPEC.VERSION).toBe(2)
  })
})
