import {
  askForInput,
  pendingInput,
  waitForTyped,
} from './src/browser/input-request'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  handleBrowser,
  isBrowserPath,
  type BrowserDeps,
} from './src/browser/routes'
import {
  firstMapping,
  driverFromEnv,
  dockerDriver,
  fixedDriver,
  pickMuxPort,
  MUX_PORT_MIN,
  MUX_PORT_MAX,
  PROFILE_PATH,
  STOP_GRACE_SECONDS,
  type PodDriver,
} from './src/browser/pod-driver'
import {
  resetBrowserSessionsCache,
  type Queryable,
} from './src/browser/sessions'
import { resetBrowserProfilesCache } from './src/browser/profiles'

/**
 * THE BROKER IS THE ONLY DOOR TO SOMEBODY'S LOGGED-IN BROWSER.
 *
 * Each test below pins a property whose failure is not a bug report but an
 * incident:
 *
 * - an unsigned caller getting a browser is one person reading another's mail;
 * - a pod address or the admin token reaching a client is a signed-in browser
 *   left addressable on the internet;
 * - a second POST starting a second pod strands the first, and an orphan pod
 *   is a browser nobody watches that still holds live sessions at ~743 MiB;
 * - a row that says "live" about a dead pod makes the mini app show a viewer
 *   onto nothing, and makes "do I have a browser" answer yes forever.
 *
 * The fake pool below implements the statements the module actually issues,
 * including ON CONFLICT upsert semantics. A fake that answered whatever made
 * the test pass would be testing itself.
 */

interface Row {
  telegram_id: string
  session_id: string
  pod_id: string | null
  endpoint: string | null
  state: string
  view_token: string
  admin_token: string
  last_seen_at: number
}

function fakePool(): Queryable & {
  rows: Map<string, Row>
  profiles: Map<string, string>
  statements: string[]
} {
  const rows = new Map<string, Row>()
  const profiles = new Map<string, string>()
  const statements: string[] = []
  return {
    rows,
    profiles,
    statements,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.trim().toUpperCase()
      statements.push(s.replace(/\s+/g, ' ').slice(0, 60))
      if (s.startsWith('CREATE TABLE')) return { rows: [] }
      if (s.startsWith('CREATE UNIQUE INDEX')) return { rows: [] }
      if (s.startsWith('ALTER TABLE')) return { rows: [] }

      /*
       * The profile table is modelled separately and honestly, including
       * ON CONFLICT DO NOTHING: a fake that minted a fresh profile on every
       * call would hide the one bug that matters here -- a second profile
       * for the same person, which reads as "my logins are gone".
       */
      if (s.includes('BROWSER_PROFILES')) {
        const who = String(params[0])
        if (s.startsWith('INSERT')) {
          const wanted = String(params[1])
          /*
           * UNIQUE(profile_id) is modelled, because Postgres enforces it and
           * a fake that did not would pass a collision that the real database
           * rejects -- two people pointed at one pile of cookies.
           */
          /*
           * The conflict ACTION is read from the statement, not assumed.
           * A fake that always kept the first value passed a mutation that
           * changed DO NOTHING into DO UPDATE -- which in Postgres rewrites
           * the profile id on every visit and loses the person's logins.
           */
          const overwrites = s.includes('DO UPDATE')
          if (!profiles.has(who) || overwrites) {
            for (const [owner, id] of profiles) {
              if (id === wanted && owner !== who) {
                throw new Error(
                  'duplicate key value violates unique constraint ' +
                    '"browser_profiles_profile_id_key"'
                )
              }
            }
            profiles.set(who, wanted)
          }
          return { rows: [] }
        }
        if (s.startsWith('UPDATE') || s.startsWith('SELECT')) {
          const id = profiles.get(who)
          return { rows: id ? [{ profile_id: id }] : [] }
        }
        if (s.startsWith('DELETE')) {
          profiles.delete(who)
          return { rows: [] }
        }
      }
      if (s.startsWith('SELECT')) {
        /*
         * Two readers, two keys: the broker looks a person up, the proxy
         * looks a session id up. A fake that answered both from the same key
         * would hide a real mix-up between them.
         */
        const bySession = s.includes('WHERE SESSION_ID')
        const want = String(params[0])
        const row = bySession
          ? [...rows.values()].find(r => r.session_id === want)
          : rows.get(want)
        return { rows: row ? [{ ...row } as Record<string, unknown>] : [] }
      }
      if (s.startsWith('INSERT')) {
        const [id, session, pod, endpoint, state, view, admin] =
          params as string[]
        rows.set(id, {
          telegram_id: id,
          session_id: session,
          pod_id: (pod as string | null) ?? null,
          endpoint: (endpoint as string | null) ?? null,
          state,
          view_token: view,
          admin_token: admin,
          last_seen_at: Date.now(),
        })
        return { rows: [] }
      }
      if (s.startsWith('UPDATE')) {
        const row = rows.get(String(params[0]))
        if (row) row.last_seen_at = Date.now()
        return { rows: [] }
      }
      if (s.startsWith('DELETE')) {
        rows.delete(String(params[0]))
        return { rows: [] }
      }
      throw new Error(`fake pool got a statement it does not model: ${sql}`)
    },
  }
}

function fakeDriver(over: Partial<PodDriver> = {}) {
  const started: string[] = []
  const stopped: string[] = []
  const wiped: string[] = []
  const profilesSeen: string[] = []
  const living = new Set<string>()
  const driver: PodDriver & {
    started: string[]
    stopped: string[]
    wiped: string[]
    profilesSeen: string[]
    living: Set<string>
  } = {
    name: 'fake',
    started,
    stopped,
    wiped,
    profilesSeen,
    living,
    async start(input) {
      const podId = `pod-${input.sessionId}`
      started.push(podId)
      profilesSeen.push(input.profileId)
      living.add(podId)
      return { podId, endpoint: '127.0.0.1:32768' }
    },
    async wipeProfile(profileId) {
      wiped.push(profileId)
    },
    async stop(podId) {
      stopped.push(podId)
      living.delete(podId)
    },
    async alive(podId) {
      return living.has(podId)
    },
    ...over,
  }
  return driver
}

/** Shared so two callers in one test cannot be handed the same "random" id. */
function tokenFactory() {
  let n = 0
  return () => `tok${++n}`
}

function deps(
  over: Partial<BrowserDeps> & {
    pool?: ReturnType<typeof fakePool>
    tokens?: () => string
  } = {}
) {
  const pool = over.pool || fakePool()
  const driver = over.driver || fakeDriver()
  const newToken = over.tokens || tokenFactory()
  const sent: Array<{ to: string; text: string; markup?: unknown }> = []
  const d: BrowserDeps = {
    getPool: async () => pool,
    identity: () => 'tg-900000001',
    driver,
    newToken,
    actor: () => 'person',
    announcer: {
      async send(to, text, markup) {
        sent.push({ to, text, markup })
      },
    },
    ...over,
  }
  return { d, pool, sent, driver: driver as ReturnType<typeof fakeDriver> }
}

beforeEach(() => {
  resetBrowserSessionsCache()
  resetBrowserProfilesCache()
})

describe('which paths the broker owns', () => {
  it('claims its own path and nothing near it', () => {
    expect(isBrowserPath('/api/browser/session')).toBe(true)
    expect(isBrowserPath('/api/browser/sessions')).toBe(false)
    expect(isBrowserPath('/api/browser')).toBe(false)
  })
})

describe('no identity, no browser', () => {
  it('refuses an unsigned caller AND starts nothing', async () => {
    const { d, driver } = deps({ identity: () => null })
    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'POST' },
      d
    )
    expect(out.status).toBe(401)
    /* The refusal is worthless if a pod was started on the way to it. */
    expect(driver.started).toEqual([])
  })
})

describe('what the client is told', () => {
  it('hands back a path through us, never the pod address or admin token', async () => {
    const { d, driver } = deps()
    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'POST' },
      d
    )
    expect(out.status).toBe(201)
    expect(String(out.body.viewUrl)).toMatch(/^\/live\/tok1\?t=tok2$/)

    const serialized = JSON.stringify(out.body)
    expect(serialized).not.toContain('127.0.0.1')
    expect(serialized).not.toContain('32768')
    expect(serialized).not.toContain(driver.started[0])
    /* tok3 is the admin token: it must not have left the server. */
    expect(serialized).not.toContain('tok3')
  })
})

describe('pressing the button twice', () => {
  it('reuses the live pod instead of stranding it', async () => {
    const { d, driver } = deps()
    const first = await handleBrowser(
      { url: '/api/browser/session', method: 'POST' },
      d
    )
    const second = await handleBrowser(
      { url: '/api/browser/session', method: 'POST' },
      d
    )
    expect(driver.started).toHaveLength(1)
    expect(second.status).toBe(200)
    expect(second.body.sessionId).toBe(first.body.sessionId)
  })

  it('starts a fresh pod when the recorded one has died', async () => {
    const { d, driver } = deps()
    await handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)
    driver.living.clear() // the pod was reaped behind our back

    const again = await handleBrowser(
      { url: '/api/browser/session', method: 'POST' },
      d
    )
    expect(again.status).toBe(201)
    expect(driver.started).toHaveLength(2)
    expect(again.body.sessionId).not.toBe('tok1')
  })
})

describe('telling the person their browser started', () => {
  const open = (d: BrowserDeps) =>
    handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)

  it('ANNOUNCES a browser an agent started', async () => {
    /*
     * The mini app only notices an agent while it is open. With the app
     * closed -- most of the time, on a phone -- this message is the only
     * thing standing between an agent working in somebody's accounts and
     * them never learning of it.
     */
    const { d, sent } = deps({ actor: () => 'agent' })
    await open(d)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('tg-900000001')
    /*
     * The SHAPE, not just the address. Telegram rejects any other key, and
     * the button would vanish with nothing said -- a mutation renaming
     * `inline_keyboard` survived a test that only looked for the URL.
     */
    const markup = sent[0].markup as {
      inline_keyboard?: Array<
        Array<{ text?: string; url?: string; web_app?: { url?: string } }>
      >
    }
    expect(Array.isArray(markup.inline_keyboard)).toBe(true)
    const button = markup.inline_keyboard![0][0]
    /*
     * A web_app button, not a url one: a url button opens the phone's own
     * browser, where the person is not signed in and sees nothing
     * (owner, 2026-09-22). The mini app arrives signed.
     */
    expect(button.url).toBeUndefined()
    expect(button.web_app?.url).toContain('/browser')
    expect(button.text).toBeTruthy()
  })

  it('SAYS NOTHING when the person started it themselves', async () => {
    /* A message one second after they pressed the button is how a channel
     * gets muted, taking the one message that mattered with it. */
    const { d, sent } = deps({ actor: () => 'person' })
    await open(d)
    expect(sent).toEqual([])
  })

  it('does not announce a browser that was already running', async () => {
    const { d, sent } = deps({ actor: () => 'agent' })
    await open(d)
    await open(d)
    expect(sent).toHaveLength(1)
  })

  it('still opens the browser when Telegram refuses', async () => {
    const { d, driver } = deps({
      actor: () => 'agent',
      announcer: {
        async send() {
          throw new Error('bot was blocked by the user')
        },
      },
    })
    const out = await open(d)
    /* They asked for a browser, not for a notification. */
    expect(out.status).toBe(201)
    expect(driver.started).toHaveLength(1)
  })
})

describe('what counts as using the browser', () => {
  it('A STATUS POLL IS NOT USE', async () => {
    /*
     * The mini app asks this route every ten seconds to notice an agent
     * starting work. If that marked the session as used, no pod would ever
     * go idle and the reaper would have nothing to do -- ~743 MiB held per
     * person for as long as they have the app open.
     */
    const { d, pool } = deps()
    await handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)
    pool.statements.length = 0

    await handleBrowser({ url: '/api/browser/session', method: 'GET' }, d)
    const touched = pool.statements.filter(
      s => s.startsWith('UPDATE BROWSER_SESSIONS') && s.includes('LAST_SEEN_AT')
    )
    expect(touched).toEqual([])
  })

  it('but opening one is', async () => {
    /* Negative control: the check above must not pass by touching nothing. */
    const { d, pool } = deps()
    await handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)
    pool.statements.length = 0

    await handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)
    const touched = pool.statements.filter(
      s => s.startsWith('UPDATE BROWSER_SESSIONS') && s.includes('LAST_SEEN_AT')
    )
    expect(touched.length).toBeGreaterThan(0)
  })
})

describe('a row is a claim, not a fact', () => {
  it('reports "none" rather than a viewer onto a dead pod', async () => {
    const { d, driver, pool } = deps()
    await handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)
    driver.living.clear()

    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'GET' },
      d
    )
    expect(out.body).toEqual({ ok: true, state: 'none' })
    /* And the stale row is gone, so the next question is answered honestly. */
    expect(pool.rows.size).toBe(0)
  })

  it('answers "none" for somebody who never opened one', async () => {
    const { d } = deps()
    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'GET' },
      d
    )
    expect(out.body).toEqual({ ok: true, state: 'none' })
  })
})

describe('the kill switch', () => {
  it('stops the pod and forgets the row', async () => {
    const { d, driver, pool } = deps()
    await handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)
    const podId = driver.started[0]

    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'DELETE' },
      d
    )
    expect(out.status).toBe(200)
    expect(driver.stopped).toEqual([podId])
    expect(pool.rows.size).toBe(0)
  })

  it('still forgets the row when the driver refuses to stop', async () => {
    const angry = fakeDriver({
      async stop() {
        throw new Error('platform is having a day')
      },
    })
    const { d, pool } = deps({ driver: angry })
    await handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)

    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'DELETE' },
      d
    )
    /* A person asking to shut their browser down must never be told no. */
    expect(out.status).toBe(200)
    expect(pool.rows.size).toBe(0)
  })
})

describe('when the pod will not start', () => {
  it('reports the failure and leaves no row claiming a browser', async () => {
    const broken = fakeDriver({
      async start() {
        throw new Error('no capacity')
      },
    })
    const { d, pool } = deps({ driver: broken })
    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'POST' },
      d
    )
    expect(out.status).toBe(502)
    expect(pool.rows.size).toBe(0)
  })
})

describe('a deployment that cannot run pods', () => {
  it('says so plainly instead of failing deeper', async () => {
    const { d, pool } = deps({ driver: null })
    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'POST' },
      d
    )
    expect(out.status).toBe(503)
    expect(out.body.state).toBe('unavailable')
    /* Nothing was written: there is no browser to remember. */
    expect(pool.rows.size).toBe(0)
  })

  it('hands out a provisioned pod where the platform cannot make one', async () => {
    /*
     * Railway is this project's hosting and has no API to start a machine
     * per visit. The seam still holds: a different driver, same broker.
     */
    const exec = async () => ({ stdout: '' })
    const d = driverFromEnv(
      {
        BROWSER_POD_DRIVER: 'fixed',
        BROWSER_POD_ENDPOINT: 'https://pod.example.com/',
      },
      exec
    )!
    expect(d.name).toBe('fixed')
    const pod = await d.start({
      sessionId: 's1',
      profileId: 'p1',
      viewToken: 'v',
      adminToken: 'a',
    })
    /* The scheme and the trailing slash would break the proxy's host:port. */
    expect(pod.endpoint).toBe('pod.example.com')
  })

  it('refuses to be "fixed" with nowhere to point', () => {
    const exec = async () => ({ stdout: '' })
    expect(driverFromEnv({ BROWSER_POD_DRIVER: 'fixed' }, exec)).toBeNull()
  })

  it('will not pretend it forgot somebody it cannot reach', async () => {
    /*
     * Saying "wiped" about a profile on a service this process cannot touch
     * would be the worst kind of lie: the person believes they are signed
     * out everywhere, and they are not.
     */
    const d = fixedDriver({ endpoint: 'pod.example.com' })
    await expect(d.wipeProfile('p1')).rejects.toThrow(/cannot wipe/)
  })

  it('picks the docker driver only when asked for it by name', () => {
    const exec = async () => ({ stdout: '' })
    expect(driverFromEnv({}, exec)).toBeNull()
    expect(driverFromEnv({ BROWSER_POD_DRIVER: '' }, exec)).toBeNull()
    expect(driverFromEnv({ BROWSER_POD_DRIVER: 'fly' }, exec)).toBeNull()
    expect(driverFromEnv({ BROWSER_POD_DRIVER: 'Docker' }, exec)?.name).toBe(
      'docker'
    )
  })
})

describe('what the docker driver actually runs', () => {
  it('passes the view token as the person password and never the admin one', async () => {
    const calls: string[][] = []
    const exec = async (_file: string, args: string[]) => {
      calls.push(args)
      return { stdout: args[0] === 'port' ? '0.0.0.0:32768\n' : '' }
    }
    const driver = driverFromEnv({ BROWSER_POD_DRIVER: 'docker' }, exec)!
    const pod = await driver.start({
      sessionId: 's1',
      viewToken: 'watch-me',
      adminToken: 'never-leaves',
    })
    expect(pod.endpoint).toBe('127.0.0.1:32768')

    const run = calls.find(a => a[0] === 'run')!.join(' ')
    expect(run).toContain('NEKO_MEMBER_MULTIUSER_USER_PASSWORD=watch-me')
    expect(run).toContain('NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=never-leaves')
    /* Port 0: the host picks a free one, so two sessions cannot collide. */
    expect(run).toContain('-p 0:8080')
  })

  it('publishes a media port unchanged and tells the pod to advertise it', async () => {
    /*
     * Without this the picture never arrives. Measured 2026-09-20: the pod
     * offered candidates on its container address and neko logged
     * "ICE connection state changed: failed". The number must be identical
     * inside and out, because the number is what the candidate carries.
     */
    const calls: string[][] = []
    const exec = async (_f: string, args: string[]) => {
      calls.push(args)
      return { stdout: args[0] === 'port' ? '0.0.0.0:32768\n' : '' }
    }
    const driver = dockerDriver({ exec, random: () => 0.5 })
    await driver.start({ sessionId: 's3', viewToken: 'v', adminToken: 'a' })

    const run = calls.find(a => a[0] === 'run')!
    const mux = pickMuxPort(() => 0.5)
    expect(run.join(' ')).toContain(`NEKO_WEBRTC_UDPMUX=${mux}`)
    expect(run.join(' ')).toContain(`NEKO_WEBRTC_TCPMUX=${mux}`)
    expect(run.join(' ')).toContain('NEKO_WEBRTC_NAT1TO1=127.0.0.1')
    expect(run.join(' ')).toContain(`-p ${mux}:${mux}/udp`)
  })

  it("mounts the person's profile where Chromium actually keeps it", async () => {
    const calls: string[][] = []
    const exec = async (_f: string, args: string[]) => {
      calls.push(args)
      return { stdout: args[0] === 'port' ? '0.0.0.0:32768\n' : '' }
    }
    const driver = dockerDriver({ exec })
    await driver.start({
      sessionId: 's4',
      profileId: 'prof-xyz',
      viewToken: 'v',
      adminToken: 'a',
    })
    const run = calls.find(a => a[0] === 'run')!.join(' ')
    expect(run).toContain(`browser-profile-prof-xyz:${PROFILE_PATH}`)
  })

  it('shuts the browser down before removing it, or the logins are lost', async () => {
    /*
     * `docker rm -f` is SIGKILL, and Chromium writes session cookies on a
     * clean exit. Killing it loses exactly what the profile exists to keep.
     */
    const calls: string[][] = []
    const exec = async (_f: string, args: string[]) => {
      calls.push(args)
      return { stdout: '' }
    }
    await dockerDriver({ exec }).stop('browser-s5')
    const verbs = calls.map(a => a[0])
    expect(verbs).toEqual(['stop', 'rm'])
    expect(calls[0]).toContain(String(STOP_GRACE_SECONDS))
  })

  it('wipes a profile by removing its volume', async () => {
    const calls: string[][] = []
    const exec = async (_f: string, args: string[]) => {
      calls.push(args)
      return { stdout: '' }
    }
    await dockerDriver({ exec }).wipeProfile('prof-xyz')
    expect(calls[0]).toEqual(['volume', 'rm', '-f', 'browser-profile-prof-xyz'])
  })

  it('keeps the media port inside the range it publishes from', () => {
    expect(pickMuxPort(() => 0)).toBe(MUX_PORT_MIN)
    expect(pickMuxPort(() => 0.999999)).toBe(MUX_PORT_MAX)
    for (const r of [0.1, 0.42, 0.77]) {
      const p = pickMuxPort(() => r)
      expect(p).toBeGreaterThanOrEqual(MUX_PORT_MIN)
      expect(p).toBeLessThanOrEqual(MUX_PORT_MAX)
    }
  })

  it('refuses a pod that published no port, and does not leave it running', async () => {
    const calls: string[][] = []
    const exec = async (_file: string, args: string[]) => {
      calls.push(args)
      return { stdout: '' } // `docker port` says nothing
    }
    const driver = driverFromEnv({ BROWSER_POD_DRIVER: 'docker' }, exec)!
    await expect(
      driver.start({ sessionId: 's2', viewToken: 'v', adminToken: 'a' })
    ).rejects.toThrow(/published no port/)
    /* A started-but-unreachable pod is an orphan; it has to be torn down. */
    expect(calls.some(a => a[0] === 'rm' && a.includes('browser-s2'))).toBe(
      true
    )
  })
})

describe('the profile outlives the visit', () => {
  const open = (d: BrowserDeps) =>
    handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)
  const close = (d: BrowserDeps) =>
    handleBrowser({ url: '/api/browser/session', method: 'DELETE' }, d)
  const forget = (d: BrowserDeps) =>
    handleBrowser({ url: '/api/browser/profile', method: 'DELETE' }, d)

  it('hands the same profile to the second visit as to the first', async () => {
    /*
     * This IS the feature. A different profile the second time is an empty
     * browser, and to the person that reads as "my logins are gone".
     */
    const { d, driver } = deps()
    await open(d)
    await close(d)
    await open(d)
    expect(driver.profilesSeen).toHaveLength(2)
    expect(driver.profilesSeen[0]).toBe(driver.profilesSeen[1])
  })

  it('never hands one person another person’s profile', async () => {
    const pool = fakePool()
    const driver = fakeDriver()
    const tokens = tokenFactory()
    const a = deps({ pool, driver, tokens, identity: () => 'tg-900000001' }).d
    const b = deps({ pool, driver, tokens, identity: () => 'tg-900000002' }).d
    await open(a)
    await open(b)
    expect(driver.profilesSeen[0]).not.toBe(driver.profilesSeen[1])
  })

  it('closing the browser keeps the logins', async () => {
    const { d, driver, pool } = deps()
    await open(d)
    await close(d)
    /* The session is gone; the disk is not. */
    expect(pool.rows.size).toBe(0)
    expect(pool.profiles.size).toBe(1)
    expect(driver.wiped).toEqual([])
  })

  it('two taps at once mint one profile, not two', async () => {
    const { d, driver } = deps()
    await Promise.all([open(d), open(d)])
    const seen = new Set(driver.profilesSeen)
    expect(seen.size).toBe(1)
  })
})

describe('forget me', () => {
  const open = (d: BrowserDeps) =>
    handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)
  const forget = (d: BrowserDeps) =>
    handleBrowser({ url: '/api/browser/profile', method: 'DELETE' }, d)

  it('stops the pod and wipes the disk', async () => {
    const { d, driver, pool } = deps()
    await open(d)
    const profileId = driver.profilesSeen[0]

    const out = await forget(d)
    expect(out.status).toBe(200)
    expect(out.body.wiped).toBe(true)
    /* Stopped FIRST: wiping under a running browser races its own writes. */
    expect(driver.stopped).toHaveLength(1)
    expect(driver.wiped).toEqual([profileId])
    expect(pool.profiles.size).toBe(0)
    expect(pool.rows.size).toBe(0)
  })

  it('keeps the profile findable when the wipe fails', async () => {
    const stubborn = fakeDriver({
      async wipeProfile() {
        throw new Error('volume in use')
      },
    })
    const { d, pool } = deps({ driver: stubborn })
    await open(d)

    const out = await forget(d)
    expect(out.status).toBe(502)
    /* Still named, so it can be retried -- not a nameless pile of cookies. */
    expect(pool.profiles.size).toBe(1)
  })

  it('is calm about somebody who never had one', async () => {
    const { d, driver } = deps()
    const out = await forget(d)
    expect(out.status).toBe(200)
    expect(driver.wiped).toEqual([])
  })

  it('refuses anything but DELETE on that door', async () => {
    const { d } = deps()
    const out = await handleBrowser(
      { url: '/api/browser/profile', method: 'POST' },
      d
    )
    expect(out.status).toBe(405)
  })
})

describe('reading the published port out of docker', () => {
  it('takes the first usable mapping', () => {
    expect(firstMapping('0.0.0.0:32768\n:::32768\n')).toBe('127.0.0.1:32768')
  })

  it('refuses to invent an address when nothing was published', () => {
    expect(firstMapping('')).toBeNull()
    expect(firstMapping('\n  \n')).toBeNull()
    expect(firstMapping('garbage without a port')).toBeNull()
  })
})

describe('the person types from their own keyboard (/api/browser/type)', () => {
  /*
   * Owner, 2026-09-22: signing in through the video stream was too hard on a
   * phone. The app's own field types into the focused field of THEIR
   * browser -- the person's door only, and the text is never kept.
   */
  const SECRET = 'hunter2-not-a-real-password' // secret-guard-ok: a made-up test string, never a credential
  const typing = (
    focus = {
      host: 'accounts.example.com',
      field: 'password',
      label: 'Password',
    }
  ) => {
    const typed: Array<{ text: string; enter: boolean }> = []
    return {
      typed,
      io: {
        focus: async () => focus,
        insert: async (_: string, text: string, enter: boolean) => {
          typed.push({ text, enter })
        },
      },
    }
  }
  /* A live browser, as the broker would have left it (with its CDP address). */
  const open = async (d: BrowserDeps) => {
    const pool = (await d.getPool()) as unknown as ReturnType<typeof fakePool>
    pool.rows.set('tg-900000001', {
      telegram_id: 'tg-900000001',
      session_id: 'tok-live',
      pod_id: 'pod-live',
      endpoint: '127.0.0.1:32768',
      cdp_endpoint: '127.0.0.1:9222',
      state: 'live',
      view_token: 'v',
      admin_token: 'a',
      last_seen_at: Date.now(),
    } as never)
  }
  const post = (d: BrowserDeps, body: unknown) =>
    handleBrowser(
      { url: '/api/browser/type', method: 'POST' },
      { ...d, readBody: async () => JSON.stringify(body) }
    )

  it('says where the text would land, before anything is sent', async () => {
    const t = typing()
    const { d } = deps({ typeIo: t.io })
    await open(d)
    const out = await handleBrowser(
      { url: '/api/browser/type', method: 'GET' },
      d
    )
    expect(out.status).toBe(200)
    expect(
      (out.body as { focus: { host: string; field: string } }).focus
    ).toMatchObject({
      host: 'accounts.example.com',
      field: 'password',
    })
    expect(t.typed).toEqual([])
  })

  it('types it, and the answer never carries the text', async () => {
    const t = typing()
    const { d } = deps({ typeIo: t.io })
    await open(d)
    const out = await post(d, { text: SECRET, enter: true })
    expect(out.status).toBe(200)
    expect(t.typed).toEqual([{ text: SECRET, enter: true }])
    expect(JSON.stringify(out.body)).not.toContain(SECRET)
    expect((out.body as { typed: number }).typed).toBe(SECRET.length)
  })

  it('REFUSES an agent key, and types nothing', async () => {
    const t = typing()
    const { d } = deps({ typeIo: t.io, actor: () => 'agent' })
    await open(d)
    const out = await post(d, { text: SECRET })
    expect(out.status).toBe(403)
    expect(t.typed).toEqual([])
  })

  it('types nowhere when no field has focus', async () => {
    const t = typing({ host: 'example.com', field: 'none', label: '' })
    const { d } = deps({ typeIo: t.io })
    await open(d)
    const out = await post(d, { text: SECRET })
    expect(out.status).toBe(409)
    expect(t.typed).toEqual([])
  })

  it('a broken body is refused with our words, never with the text', async () => {
    const t = typing()
    const { d } = deps({ typeIo: t.io })
    await open(d)
    const long = await post(d, { text: SECRET.repeat(500) })
    expect(long.status).toBe(400)
    expect(JSON.stringify(long.body)).not.toContain(SECRET)
    const bad = await handleBrowser(
      { url: '/api/browser/type', method: 'POST' },
      { ...d, readBody: async () => `{"text":"${SECRET}"` }
    )
    expect(bad.status).toBe(400)
    expect(JSON.stringify(bad.body)).not.toContain(SECRET)
    expect(t.typed).toEqual([])
  })

  it('scrolls and presses Tab even with no field in focus, and types nothing', async () => {
    const t = typing({ host: 'gds.example.com', field: 'none', label: '' })
    const pressed: Array<[unknown, unknown]> = []
    const io = {
      ...t.io,
      press: async (_: string, key: unknown, scroll: unknown) => {
        pressed.push([key, scroll])
      },
    }
    const { d } = deps({ typeIo: io })
    await open(d)
    expect((await post({ ...d, typeIo: io }, { scroll: 'down' })).status).toBe(
      200
    )
    expect((await post({ ...d, typeIo: io }, { key: 'Tab' })).status).toBe(200)
    expect(pressed).toEqual([
      [null, 'down'],
      ['Tab', null],
    ])
    expect(t.typed).toEqual([])
  })

  it('a browser that is not running takes nothing', async () => {
    const t = typing()
    const { d } = deps({ typeIo: t.io })
    const out = await post(d, { text: SECRET })
    expect(out.status).toBe(409)
    expect(t.typed).toEqual([])
  })

  it('the session answer carries the open request, so the app opens the sheet', async () => {
    const { d } = deps()
    await handleBrowser({ url: '/api/browser/session', method: 'POST' }, d)
    askForInput('tg-900000001', {
      id: 'q0',
      kind: 'code',
      why: 'the SMS code',
      host: 'bank.example',
      label: 'Code',
    })
    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'GET' },
      d
    )
    expect(
      (out.body as { inputRequest?: { why: string; kind: string } })
        .inputRequest
    ).toMatchObject({
      kind: 'code',
      why: 'the SMS code',
    })
  })

  it('answers the agent that asked for it (browser_ask_input), with the length only', async () => {
    const t = typing()
    const { d } = deps({ typeIo: t.io })
    await open(d)
    askForInput('tg-900000001', {
      id: 'q1',
      kind: 'password',
      why: 'sign in',
      host: 'accounts.example.com',
      label: '',
    })
    await post(d, { text: SECRET, enter: true })
    expect(pendingInput('tg-900000001')).toBeNull()
    const got = await waitForTyped('tg-900000001', 'q1', 0)
    expect(got).toMatchObject({
      chars: SECRET.length,
      field: 'password',
      enter: true,
    })
    expect(JSON.stringify(got)).not.toContain(SECRET)
  })

  it('typing takes the wheel: the agent stands still while the person signs in', async () => {
    const t = typing()
    const { d, pool } = deps({ typeIo: t.io })
    await open(d)
    const said: string[] = []
    const query = pool.query.bind(pool)
    pool.query = (async (sql: string, params?: unknown[]) => {
      said.push(sql)
      return query(sql, params as never)
    }) as typeof pool.query
    await post(d, { text: 'x' })
    expect(said.some(q => /person_wheel_until = now\(\)/.test(q))).toBe(true)
  })
})
