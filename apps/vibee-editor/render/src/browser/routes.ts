/**
 * THE BROKER: WHO ASKED, DO THEY ALREADY HAVE A BROWSER, START ONE IF NOT.
 *
 * This is the only door to a per-client browser. Everything it protects was
 * measured rather than assumed (docs/architecture/remote-browser-f0-
 * measurements.md), and three decisions here carry the weight:
 *
 * 1. NO IDENTITY, NO BROWSER. There is no anonymous mode and no default
 *    answer. A browser is somebody's logged-in accounts; a wrong guess about
 *    whose it is hands one person another person's mail.
 *
 * 2. THE POD ADDRESS NEVER TRAVELS. The client receives a path through us and
 *    a token, never `host:port` of the pod. A pod address in a client is an
 *    address anybody can try, and behind it sits a browser already signed in
 *    as that person.
 *
 * 3. A LIVE POD IS REUSED, NOT REPLACED. Pressing the button twice must not
 *    strand the first pod: an orphan pod is a browser nobody is watching that
 *    still holds live sessions, and it costs ~743 MiB for as long as it is
 *    forgotten.
 *
 * WHAT THIS DOES NOT DO YET, said plainly so nobody assumes otherwise:
 *
 * - `/live/:sessionId` DOES NOT EXIST. `viewUrl` names where the viewer will
 *   be proxied; until that proxy is written the path 404s, and a pod started
 *   here can only be reached from inside our network. That is the next step,
 *   and the order is deliberate: the address of a signed-in browser should
 *   not become reachable before the thing guarding it is written.
 * - Idle pods are not stopped. A pod lives until it is stopped here.
 * - The profile is not persisted between sessions: stopping loses the logins.
 * - The agent's side (the MCP facade over CDP) is not exposed at all.
 */

import {
  ensureBrowserSessions,
  readSession,
  writeSession,
  dropSession,
  touchSession,
  type BrowserSession,
  type Queryable,
} from './sessions'
import {
  ensureBrowserProfiles,
  profileIdFor,
  readProfileId,
  forgetProfile,
} from './profiles'
import { fitDesktop, wantedScreen } from './screen'
import type { PodDriver } from './pod-driver'
import { announceBrowserStarted, type Actor, type Announcer } from './announce'

export const BROWSER_PATHS = [
  '/api/browser/session',
  '/api/browser/profile',
  '/api/browser/screen',
] as const

export function isBrowserPath(path: string): boolean {
  return (BROWSER_PATHS as readonly string[]).includes(path)
}

export interface BrowserDeps {
  getPool: () => Promise<Queryable>
  identity: (req: { url?: string; method?: string }) => string | null
  /**
   * Null where this deployment cannot run pods -- Railway, for one. A missing
   * driver is answered as "not configured" rather than left to fail deeper
   * and look to the person like a browser that is broken.
   */
  driver: PodDriver | null
  /** Random, unguessable, long. Injected so tests are deterministic. */
  newToken: () => string
  /**
   * Which door the caller came through. Only an agent-started browser is
   * announced; telling somebody their browser started a second after they
   * pressed the button is the noise that gets a channel muted.
   */
  actor: (req: { url?: string; method?: string }) => Actor
  /** Optional: without it nothing is announced and nothing breaks. */
  announcer?: Announcer
  /** Injected for tests; defaults to process.env. */
  env?: Record<string, string | undefined>
}

/**
 * Who the single shared pod belongs to.
 *
 * BROWSER_POD_OWNER names them; unset, it is the platform owner. There is no
 * way to name two, on purpose -- see the gate in handleBrowser.
 */
export function isThePodsOwner(
  who: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  const owner = (
    env.BROWSER_POD_OWNER ||
    env.OWNER_TELEGRAM_ID ||
    '144022504'
  ).trim()
  return Boolean(who) && who === owner
}

export interface RouteResult {
  status: number
  body: Record<string, unknown>
}

/**
 * What a client is allowed to know about its own session.
 *
 * Deliberately not included: `podId`, the pod endpoint and `adminToken`. The
 * first two are addresses of a running browser, the third is the key to the
 * room's settings. None of them make the mini app work, so none of them go.
 */
function publicView(s: BrowserSession): Record<string, unknown> {
  return {
    ok: true,
    state: s.state,
    sessionId: s.sessionId,
    viewUrl: `/live/${s.sessionId}?t=${encodeURIComponent(s.viewToken)}`,
  }
}

export async function handleBrowser(
  req: { url?: string; method?: string },
  deps: BrowserDeps
): Promise<RouteResult> {
  const path = (req.url || '').split('?')[0]
  if (!isBrowserPath(path)) return { status: 404, body: { ok: false } }

  const who = deps.identity(req)
  if (!who) {
    return {
      status: 401,
      body: {
        ok: false,
        error: 'нужна подпись, сессия приложения или ключ агента', // cyrillic-ok: user-facing error
      },
    }
  }

  const driver = deps.driver
  if (!driver) {
    return {
      status: 503,
      body: {
        ok: false,
        state: 'unavailable',
        error: 'удалённый браузер на этой площадке не настроен', // cyrillic-ok: user-facing error
      },
    }
  }

  /*
   * A SHARED POD BELONGS TO EXACTLY ONE PERSON.
   *
   * `fixed` is one provisioned browser: one Chromium, one profile, one set
   * of cookies. Handed to everybody who opens the tab, the first person to
   * sign into their mail would open it to all the rest -- the opposite of
   * the rule this whole design rests on. So it is handed to ONE telegram id
   * and to nobody else, and everybody else gets the same honest answer they
   * got before any pod existed.
   *
   * One id, not the keepers list: two trusted people sharing one browser
   * still share each other's logins. A list would be a second place for
   * "who may see whose accounts" to be decided, and the wrong place.
   */
  if (driver.name === 'fixed' && !isThePodsOwner(who, deps.env)) {
    return {
      status: 503,
      body: {
        ok: false,
        state: 'unavailable',
        error: 'удалённый браузер на этой площадке не настроен', // cyrillic-ok: user-facing error
      },
    }
  }

  const pool = await deps.getPool()
  await ensureBrowserSessions(pool)
  await ensureBrowserProfiles(pool)
  const method = (req.method || 'GET').toUpperCase()

  /*
   * TWO DIFFERENT DOORS, AND THE DIFFERENCE IS THE WHOLE POINT.
   *
   *   DELETE /api/browser/session  -- close the browser, KEEP the logins.
   *                                   The ordinary thing, done all the time.
   *   DELETE /api/browser/profile  -- forget me: stop AND wipe the disk.
   *                                   Irreversible, and the person's right.
   *
   * Collapsing them would mean either logins lost on every close, or a red
   * button that quietly leaves the cookies behind.
   */
  if (path === '/api/browser/profile') {
    if (method !== 'DELETE') {
      return { status: 405, body: { ok: false, error: 'DELETE only' } }
    }
    return await wipe(pool, driver, who)
  }

  /*
   * THE DESKTOP IS RESHAPED TO THE DEVICE, and the size arrives in the query
   * rather than a body because this handler is given a url and a method and
   * nothing else. Two integers describing a rectangle are not worth growing
   * that seam for.
   */
  if (path === '/api/browser/screen') {
    if (method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'POST only' } }
    }
    return await fit(pool, who, req.url || '')
  }

  if (method === 'GET') return await describe(pool, deps, driver, who)
  if (method === 'POST')
    return await open(pool, deps, driver, who, deps.actor(req))
  if (method === 'DELETE') return await close(pool, driver, who)
  return { status: 405, body: { ok: false, error: 'GET, POST or DELETE' } }
}

async function describe(
  pool: Queryable,
  deps: BrowserDeps,
  driver: PodDriver,
  who: string
): Promise<RouteResult> {
  const existing = await readSession(pool, who)
  if (!existing) return { status: 200, body: { ok: true, state: 'none' } }

  /*
   * A row saying "live" is a claim, not a fact -- the pod can have died,
   * been reaped, or lost its host. Ask the driver before repeating it, or the
   * mini app shows a person a viewer for a browser that is not there.
   */
  if (existing.podId && !(await driver.alive(existing.podId))) {
    await dropSession(pool, who)
    return { status: 200, body: { ok: true, state: 'none' } }
  }
  /*
   * DELIBERATELY NOT TOUCHED HERE. The mini app polls this route every ten
   * seconds to notice an agent starting work; counting that as use would
   * keep a pod alive for as long as somebody has the app open, and the
   * idle reaper would never fire. Only real use counts -- see reaper.ts.
   */
  return { status: 200, body: publicView(existing) }
}

async function open(
  pool: Queryable,
  deps: BrowserDeps,
  driver: PodDriver,
  who: string,
  actor: Actor
): Promise<RouteResult> {
  const existing = await readSession(pool, who)
  if (existing?.podId && (await driver.alive(existing.podId))) {
    await touchSession(pool, who)
    return { status: 200, body: publicView(existing) }
  }
  /* A row pointing at a pod that is gone must not block a new one. */
  if (existing) await dropSession(pool, who)

  const session: BrowserSession = {
    telegramId: who,
    sessionId: deps.newToken(),
    podId: null,
    endpoint: null,
    cdpEndpoint: null,
    allowedAtMs: null,
    state: 'starting',
    viewToken: deps.newToken(),
    adminToken: deps.newToken(),
  }
  /*
   * The row is written BEFORE the pod starts, so a pod that comes up while
   * the process dies is still findable and stoppable. The other order leaves
   * a running browser with somebody's accounts that nothing has a name for.
   */
  await writeSession(pool, session)

  try {
    const pod = await driver.start({
      sessionId: session.sessionId,
      profileId: await profileIdFor(pool, who, deps.newToken),
      viewToken: session.viewToken,
      adminToken: session.adminToken,
    })
    const live: BrowserSession = {
      ...session,
      podId: pod.podId,
      endpoint: pod.endpoint,
      cdpEndpoint: pod.cdpEndpoint,
      /* The pod's own passwords win over the minted ones; see PodHandle. */
      viewToken: pod.viewToken || session.viewToken,
      adminToken: pod.adminToken || session.adminToken,
      state: 'live',
    }
    await writeSession(pool, live)
    /*
     * Announced AFTER the pod is up, so the button in Telegram leads to a
     * browser that exists. Announced before would race the person opening it.
     */
    if (deps.announcer) {
      await announceBrowserStarted(deps.announcer, who, actor)
    }
    return { status: 201, body: publicView(live) }
  } catch (err) {
    await dropSession(pool, who)
    return {
      status: 502,
      body: {
        ok: false,
        error: 'браузер не поднялся, попробуйте ещё раз', // cyrillic-ok: user-facing error
        detail: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

/**
 * The kill switch. It must work when the row is stale, when the pod is
 * already gone, and when the driver throws -- a person asking to shut their
 * browser down gets it shut down, and never an error that leaves it running.
 */
async function close(
  pool: Queryable,
  driver: PodDriver,
  who: string
): Promise<RouteResult> {
  const existing = await readSession(pool, who)
  if (existing?.podId) {
    await driver.stop(existing.podId).catch(() => undefined)
  }
  await dropSession(pool, who)
  return { status: 200, body: { ok: true, state: 'none' } }
}

/**
 * Forget me. The pod goes down first -- wiping the disk under a running
 * browser would race Chromium's own writes and could leave half a profile,
 * which is worse than either outcome: it looks signed in and is not.
 *
 * The database row goes LAST, so a failure leaves a profile that can still be
 * named and retried rather than a nameless pile of somebody's cookies.
 */
/**
 * Make the pod's screen the shape of the box the person is watching in.
 *
 * Returns what the screen ACTUALLY became, which is not always what was
 * asked for: X snaps the width to a multiple of 8, and some sizes it simply
 * declines while answering 200 (screen.ts records the measurements). The
 * client draws its frame from this answer, so a refusal shows up as a frame
 * that keeps its old shape rather than one that lies about the picture.
 */
async function fit(
  pool: Queryable,
  who: string,
  url: string
): Promise<RouteResult> {
  const q = new URLSearchParams(url.split('?')[1] || '')
  const want = wantedScreen({
    width: Number(q.get('w')),
    height: Number(q.get('h')),
  })

  const session = await readSession(pool, who)
  if (!session || session.state !== 'live' || !session.endpoint) {
    return { status: 409, body: { ok: false, error: 'no browser is running' } }
  }

  try {
    const got = await fitDesktop(
      {
        endpoint: session.endpoint,
        adminToken: session.adminToken,
        cdpEndpoint: session.cdpEndpoint,
      },
      want
    )
    return { status: 200, body: { ok: true, screen: got } }
  } catch (e) {
    /*
     * A browser that will not resize is still a browser. The person keeps
     * watching at whatever shape it has, and the frame keeps its own.
     */
    return {
      status: 502,
      body: { ok: false, error: e instanceof Error ? e.message : String(e) },
    }
  }
}

async function wipe(
  pool: Queryable,
  driver: PodDriver,
  who: string
): Promise<RouteResult> {
  const existing = await readSession(pool, who)
  if (existing?.podId) {
    await driver.stop(existing.podId).catch(() => undefined)
  }
  await dropSession(pool, who)

  const profileId = await readProfileId(pool, who)
  if (!profileId) return { status: 200, body: { ok: true, state: 'none' } }

  try {
    await driver.wipeProfile(profileId)
  } catch (err) {
    return {
      status: 502,
      body: {
        ok: false,
        error: 'браузер закрыт, но профиль стереть не удалось', // cyrillic-ok: user-facing error
        detail: err instanceof Error ? err.message : String(err),
      },
    }
  }
  await forgetProfile(pool, who)
  return { status: 200, body: { ok: true, state: 'none', wiped: true } }
}
