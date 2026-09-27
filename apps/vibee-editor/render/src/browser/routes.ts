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
 * - The agent's side (the MCP facade over CDP) is not exposed at all.
 *
 * THE PROFILE IS PERSISTED, and this file used to say the opposite. It is on a
 * volume mounted at the pod's profile path (pod-driver.ts PROFILE_PATH), so
 * stopping, starting and restarting all keep the person's logins; only DELETE
 * /api/browser/profile wipes them. The stale line mattered: it made a restart
 * look like something that costs the person their accounts, which is the
 * opposite of true and is why the one cure for a broken pod was avoided.
 */

import {
  importCookies,
  MAX_IMPORT_BYTES,
  parseCookieExport,
  sitesOf,
  type CookieParam,
} from './cookie-import'
import {
  ensureBrowserSessions,
  readSession,
  writeSession,
  dropSession,
  touchSession,
  type BrowserSession,
  type Queryable,
  setWheel,
  personHasTheWheel,
  markAllowed,
} from './sessions'
import {
  ensureBrowserProfiles,
  profileIdFor,
  readProfileId,
  forgetProfile,
} from './profiles'
import { fitDesktop, isVisibleBox, wantedScreen } from './screen'
import { handMouseToPerson } from './mouse'
import { readJournal } from './journal'
import type { PodDriver } from './pod-driver'
import { announceBrowserStarted, type Actor, type Announcer } from './announce'
import {
  cdpTypeIo,
  canTypeInto,
  parseTypeBody,
  MAX_TYPE_BODY_BYTES,
  type Focus,
  type TypeIo,
} from './person-type'
import {
  markTyped,
  markChosen,
  pendingInput,
  inputRequestView,
} from './input-request'
import {
  ensureApprovals,
  pendingApprovalFor,
  decideAsPerson,
} from './approvals'

export const BROWSER_PATHS = [
  '/api/browser/session',
  '/api/browser/profile',
  '/api/browser/screen',
  '/api/browser/cookies',
  '/api/browser/journal',
  '/api/browser/wheel',
  '/api/browser/type',
  '/api/browser/decide',
  '/api/browser/choose',
  '/api/browser/round',
  '/api/browser/learned',
  '/api/browser/strategy',
  '/api/browser/desks',
  '/api/browser/scenarios',
  '/api/browser/reach',
  '/api/browser/tabs',
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
  /**
   * The request body, for the one route that has one (the logins import).
   * Capped by the caller; absent, that route answers that it is not wired.
   */
  readBody?: (
    req: { url?: string; method?: string },
    maxBytes: number
  ) => Promise<string>
  /** Injected for tests; defaults to writing into the pod over CDP. */
  importCookies?: (cdpEndpoint: string, cookies: CookieParam[]) => Promise<void>
  /** Injected for tests; defaults to the pod over CDP (person-type.ts). */
  typeIo?: TypeIo
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
    /*
     * Who is driving, so a page opened later -- the board, a second device,
     * the app after a reload -- shows the truth instead of assuming the agent
     * (sessions.ts personHasTheWheel). An agent reads it too: "the person is
     * driving" is worth knowing before it tries to click.
     */
    wheel: personHasTheWheel(s, Date.now()) ? 'person' : 'agent',
    /* The agent is waiting for the person to type something (input-request.ts). */
    inputRequest: inputRequestView(pendingInput(s.telegramId)),
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
  /*
   * WHAT THE AGENT DID IN THIS BROWSER (journal.ts): the person's own steps,
   * newest first. Read-only; the agent's key may read it too -- it is the
   * agent's own record of its own work.
   */
  /*
   * WHO HOLDS THE WHEEL (sessions.ts setWheel). The person's door only: the
   * person takes it by touching the picture and hands it back by a press;
   * an agent key may not take it from them, or give itself the wheel back.
   */
  if (path === '/api/browser/wheel') {
    if (method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'POST only' } }
    }
    if (deps.actor(req) !== 'person') {
      return {
        status: 403,
        body: {
          ok: false,
          error: "the wheel is the person's to take and give",
        },
      }
    }
    const holder = new URLSearchParams((req.url || '').split('?')[1] || '').get(
      'holder'
    )
    if (holder !== 'person' && holder !== 'agent') {
      return { status: 400, body: { ok: false, error: 'holder=person|agent' } }
    }
    await setWheel(pool, who, holder)
    /*
     * Taking the wheel is a touch: the pod's mouse follows it (mouse.ts).
     * Not awaited -- the touch must not wait on the pod -- and a pod that
     * refuses leaves the wheel taken all the same.
     */
    if (holder === 'person') {
      const s = await readSession(pool, who)
      if (s?.state === 'live' && s.endpoint)
        void handMouseToPerson({
          endpoint: s.endpoint,
          adminToken: s.adminToken,
        })
          .then(r => console.log('[browser:mouse]', who, JSON.stringify(r)))
          .catch(e =>
            console.warn('[browser:mouse] failed', who, String(e).slice(0, 200))
          )
    }
    return { status: 200, body: { ok: true, holder } }
  }

  /*
   * THE ROUND, ON DEMAND (agent/rounds.ts). The cron walks the person's
   * connected accounts every few hours; this is the same walk started by
   * the person, because "it runs every three hours" is not something anybody
   * can watch. Their door only: it opens pages in their browser.
   */
  if (path === '/api/browser/round') {
    if (method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'POST only' } }
    }
    if (deps.actor(req) !== 'person') {
      return {
        status: 403,
        body: { ok: false, error: "a round is the person's to start" },
      }
    }
    const { runRoundNow, runEveryDeskNow } = await import(
      '../agent/rounds-wiring'
    )
    const profile = new URLSearchParams(
      (req.url || '').split('?')[1] || ''
    ).get('profile')
    /*
     * No desk named means every desk, each in its own window, side by side
     * (browser/windows.ts): that is what makes the agents parallel rather
     * than a queue with one tab.
     */
    const said = profile
      ? await runRoundNow(pool, who, profile)
      : await runEveryDeskNow(pool, who)
    console.log('[rounds] asked by the person:', said.slice(0, 300))
    return { status: 200, body: { ok: true, round: said } }
  }

  /*
   * WHAT THE AGENT LEARNED HERE (browser/recipes.ts): the labels its own
   * presses found, newest first. Readable by the person and by their agent
   * -- it is a list of words on buttons, nothing private.
   */
  /*
   * HOW MANY TABS ARE OPEN, AND HOW CLOSE THAT IS TO THE CEILING.
   *
   * The 27-tab wedge was invisible from outside: the pod answered HTTP 200
   * with a browser that could no longer fork. Read-only -- it lists targets
   * and prints the plan the sweep WOULD run, closing nothing. Addresses and
   * page titles are not returned, only counts and the doomed tabs' own urls,
   * which the sweep already writes into the log.
   */
  if (path === '/api/browser/tabs') {
    if (method !== 'GET') {
      return { status: 405, body: { ok: false, error: 'GET only' } }
    }
    const { listTargets } = await import('./cdp')
    const { viewEveryPodTabs } = await import('./tab-sweep')
    const pods = await viewEveryPodTabs(
      pool,
      listTargets,
      process.env.BROWSER_POD_CDP
    )
    return { status: 200, body: { ok: true, pods } }
  }

  if (path === '/api/browser/learned') {
    if (method !== 'GET') {
      return { status: 405, body: { ok: false, error: 'GET only' } }
    }
    const { learnedHere } = await import('./recipes')
    return { status: 200, body: { ok: true, learned: await learnedHere(pool) } }
  }

  /*
   * THE STRATEGY, READ AND WRITTEN WITHOUT A DEPLOY (agent/strategies.ts).
   * Reading is open to the person and their agent; writing is the person's
   * door only -- it is their agent's instructions, and an agent that could
   * widen its own rounds would be writing its own orders.
   */
  if (path === '/api/browser/strategy') {
    const { readStrategy, writeStrategy, roundStrategyOf } = await import(
      '../agent/strategies'
    )
    const { ROUND_SITES, SETTLE_MS } = await import('../agent/rounds')
    const fallback = {
      sites: ROUND_SITES,
      everyMin: Number(process.env.ROUNDS_EVERY_MIN) || 180,
      settleMs: SETTLE_MS,
    }
    if (method === 'GET') {
      const saved = await readStrategy(pool, 'rounds')
      return {
        status: 200,
        body: {
          ok: true,
          saved,
          inUse: roundStrategyOf(saved, fallback),
        },
      }
    }
    if (method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'GET or POST' } }
    }
    if (deps.actor(req) !== 'person') {
      return {
        status: 403,
        body: {
          ok: false,
          error: "a strategy is the person's to write",
        },
      }
    }
    if (!deps.readBody) {
      return { status: 500, body: { ok: false, error: 'no body reader' } }
    }
    let wanted: unknown
    try {
      wanted = JSON.parse((await deps.readBody(req, 8192)) || '{}')
    } catch {
      return { status: 400, body: { ok: false, error: 'body is not JSON' } }
    }
    await writeStrategy(pool, 'rounds', wanted)
    return {
      status: 200,
      body: { ok: true, inUse: roundStrategyOf(wanted, fallback) },
    }
  }

  /*
   * THE DESKS (agent/profiles.ts): every line of work the agent keeps for
   * this person, with the accounts that belong to it and the settings in
   * use. Read-only; the app draws a cabinet per desk from this.
   */
  if (path === '/api/browser/desks') {
    if (method !== 'GET') {
      return { status: 405, body: { ok: false, error: 'GET only' } }
    }
    const { PROFILES, strategyKeyOf } = await import('../agent/profiles')
    const { readStrategy, roundStrategyOf } = await import(
      '../agent/strategies'
    )
    const { SETTLE_MS } = await import('../agent/rounds')
    const desks = []
    for (const p of PROFILES) {
      const saved = await readStrategy(pool, strategyKeyOf(p.id))
      desks.push({
        id: p.id,
        name: p.name,
        about: p.about,
        inUse: roundStrategyOf(saved, {
          sites: p.sites,
          everyMin: Number(process.env.ROUNDS_EVERY_MIN) || 180,
          settleMs: SETTLE_MS,
        }),
      })
    }
    return { status: 200, body: { ok: true, desks } }
  }

  /*
   * THE SCENARIOS (agent/scenarios.ts): the runs the agent can repeat, and
   * the door that starts one. Reading is open to the person and their agent;
   * starting is the person's door only -- a scenario acts in their browser.
   */
  if (path === '/api/browser/scenarios') {
    const { SCENARIOS, scenarioOf, stepInWords } = await import(
      '../agent/scenarios'
    )
    const q = new URLSearchParams((req.url || '').split('?')[1] || '')
    if (method === 'GET') {
      return {
        status: 200,
        body: {
          ok: true,
          scenarios: SCENARIOS.map(s => ({
            id: s.id,
            name: s.name,
            steps: s.steps.map(stepInWords),
          })),
        },
      }
    }
    if (method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'GET or POST' } }
    }
    if (deps.actor(req) !== 'person') {
      return {
        status: 403,
        body: { ok: false, error: "a scenario is the person's to start" },
      }
    }
    const wanted = SCENARIOS.find(s => s.id === q.get('id'))
    if (!wanted) {
      return { status: 404, body: { ok: false, error: 'no such scenario' } }
    }
    /* Read back through the same gate a saved row would pass, so the
       shipped defaults cannot be looser than what a person may save. */
    const safe = scenarioOf(wanted)
    if (!safe) {
      return { status: 400, body: { ok: false, error: 'not a scenario' } }
    }
    const { runScenarioNow } = await import('../agent/scenarios-wiring')
    const out = await runScenarioNow(pool, who, safe)
    console.log('[scenario]', safe.id, JSON.stringify(out).slice(0, 300))
    return { status: 200, body: { ok: out.ok, ran: out } }
  }

  /*
   * WHAT THE NUMBERS SAY about the link-in-the-reply hypothesis
   * (agent/reach-test.ts). Read-only, and it says plainly when there is not
   * enough to compare rather than inventing a verdict.
   */
  if (path === '/api/browser/reach') {
    if (method !== 'GET') {
      return { status: 405, body: { ok: false, error: 'GET only' } }
    }
    const { postsSoFar } = await import('../agent/reach-log')
    const { whatTheNumbersSay } = await import('../agent/reach-test')
    const posts = await postsSoFar(pool)
    return {
      status: 200,
      body: {
        ok: true,
        posts: posts.length,
        verdict: whatTheNumbersSay(posts),
      },
    }
  }

  if (path === '/api/browser/journal') {
    if (method !== 'GET') {
      return { status: 405, body: { ok: false, error: 'GET only' } }
    }
    const q = new URLSearchParams((req.url || '').split('?')[1] || '')
    const steps = await readJournal(
      pool,
      who,
      Number(q.get('limit')) || undefined,
      // Probes (tri eyes) stay out of the person's view unless asked for.
      { probes: q.get('probes') === '1' }
    )
    return { status: 200, body: { ok: true, steps } }
  }

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

  /*
   * THE PERSON BRINGS THEIR LOGINS (cookie-import.ts). The person's door
   * only: an agent key is refused, because moving somebody's sessions is
   * theirs to do, not something done to them.
   */
  /*
   * THE PERSON TYPES FROM THEIR OWN KEYBOARD (person-type.ts). GET says
   * where it would land; POST types it. The person's door only.
   */
  if (path === '/api/browser/type') {
    if (deps.actor(req) !== 'person') {
      return {
        status: 403,
        body: {
          ok: false,
          error: 'вводить текст может только сам человек', // cyrillic-ok: user-facing error
        },
      }
    }
    if (method !== 'GET' && method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'GET or POST' } }
    }
    return await personTypes(pool, deps, who, req, method === 'POST')
  }

  /*
   * THE PERSON ANSWERS THE AGENT'S QUESTION IN THE APP (approvals.ts
   * decideAsPerson). GET: their open question; POST {id, allow}: the answer.
   * The person's door only -- an agent answering its own question would be
   * no question at all.
   */
  if (path === '/api/browser/decide') {
    if (deps.actor(req) !== 'person') {
      return {
        status: 403,
        body: {
          ok: false,
          error: 'отвечать на вопрос агента может только сам человек', // cyrillic-ok: user-facing error
        },
      }
    }
    await ensureApprovals(pool)
    if (method === 'GET') {
      return {
        status: 200,
        body: { ok: true, approval: await pendingApprovalFor(pool, who) },
      }
    }
    if (method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'GET or POST' } }
    }
    if (!deps.readBody) {
      return { status: 501, body: { ok: false, error: 'not wired' } }
    }
    let answer: { id?: unknown; allow?: unknown }
    try {
      answer = JSON.parse(await deps.readBody(req, 4096)) ?? {}
    } catch {
      return { status: 400, body: { ok: false, error: 'the body is not JSON' } }
    }
    if (typeof answer.id !== 'string' || typeof answer.allow !== 'boolean') {
      return {
        status: 400,
        body: { ok: false, error: 'id and allow are required' },
      }
    }
    const state = await decideAsPerson(pool, who, answer.id, answer.allow)
    if (!state) {
      return {
        status: 409,
        body: {
          ok: false,
          error: 'на этот вопрос уже ответили или он устарел',
        }, // cyrillic-ok: user-facing error
      }
    }
    /* A yes opens the guarded door for a few minutes (guard.ts), and hands
       the agent the wheel it needs to act on it. */
    if (state === 'allowed') {
      await markAllowed(pool, who)
      await setWheel(pool, who, 'agent').catch(() => {})
    }
    return { status: 200, body: { ok: true, state } }
  }

  /*
   * THE PERSON PRESSES ONE OF THE AGENT'S OPTIONS (input-request.ts
   * markChosen): a choice, or Done / Cannot for something only they can do.
   * The person's door only; only an option the agent offered; only once.
   */
  if (path === '/api/browser/choose') {
    if (deps.actor(req) !== 'person') {
      return {
        status: 403,
        body: { ok: false, error: 'выбирать может только сам человек' }, // cyrillic-ok: user-facing error
      }
    }
    if (method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'POST only' } }
    }
    if (!deps.readBody) {
      return { status: 501, body: { ok: false, error: 'not wired' } }
    }
    let pick: { id?: unknown; option?: unknown }
    try {
      pick = JSON.parse(await deps.readBody(req, 4096)) ?? {}
    } catch {
      return { status: 400, body: { ok: false, error: 'the body is not JSON' } }
    }
    if (typeof pick.id !== 'string' || typeof pick.option !== 'string') {
      return {
        status: 400,
        body: { ok: false, error: 'id and option are required' },
      }
    }
    const asked = pendingInput(who)
    if (!markChosen(who, pick.id, pick.option)) {
      return {
        status: 409,
        body: {
          ok: false,
          error: 'на этот вопрос уже ответили или он устарел',
        }, // cyrillic-ok: user-facing error
      }
    }
    /*
     * PICKING AN OPTION IS CONSENT TO IT. The agent asked "Skip or Save?" on
     * a guarded page; the person pressed Save. Asking a second time for
     * permission to press Save is the double question that left the agent
     * standing on the Google page (owner, 2026-09-22). A choice opens the
     * guard's few minutes; Done / Cannot (an action) opens nothing.
     */
    if (asked?.kind === 'choice') await markAllowed(pool, who)
    /*
     * ANSWERING THE AGENT HANDS IT THE WHEEL. The person just told the agent
     * what to do; a touch near the card had taken the wheel, and the agent
     * stood still on the very step it had asked about (2026-09-22, X).
     */
    await setWheel(pool, who, 'agent').catch(() => {})
    return { status: 200, body: { ok: true } }
  }

  if (path === '/api/browser/cookies') {
    if (method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'POST only' } }
    }
    if (deps.actor(req) !== 'person') {
      return {
        status: 403,
        body: {
          ok: false,
          error: 'переносить входы может только сам человек', // cyrillic-ok: user-facing error
        },
      }
    }
    return await bringLogins(pool, deps, who, req)
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

/*
 * THE AGENT STARTS THE BROWSER ITSELF (owner's A2A test, 2026-09-22: the
 * agent found the browser off and told the person to go and switch it on --
 * a trip to another tab for something the agent key is allowed to do).
 * Same door as the button, marked as the agent, so the person gets the
 * "the agent opened your browser" message with a way to watch.
 */
let agentStartDeps: (() => BrowserDeps) | null = null

export function configureAgentStart(deps: () => BrowserDeps): void {
  agentStartDeps = deps
}

/**
 * THE BROWSER IS RESTARTED WHEN IT IS NO LONGER A BROWSER.
 *
 * 2026-09-23: Chromium in the pod ran out of memory with a dozen tabs open.
 * It kept answering -- new tabs opened, and every one of them was blank --
 * so nothing looked broken from outside, and the round walked five accounts
 * seeing nothing. A pod in that state is cured by a restart and only by a
 * restart, and a restart keeps the person's logins: the profile is on a
 * volume, and only DELETE /api/browser/profile ever wipes it.
 *
 * WHY THIS IS NOT stop-then-start ANY MORE. On the `fixed` driver -- what
 * production runs -- `stop` is a documented no-op, so stopping and starting
 * dropped the row, wrote a new one, and handed back THE SAME broken Chromium
 * while this function returned true. Measured: the browser was unreadable from
 * 2026-09-24, every round "restarted" it, and the pod had not actually
 * restarted since 2026-09-23T11:21:26Z -- three days in which the person could
 * not sign in to anything and nothing said why. So the driver is asked for a
 * real restart, and the browser must ANSWER before this reports one
 * (health.ts): HTTP liveness is what lied.
 *
 * The person is told, because it is their browser and they may be watching
 * it at that moment.
 */
export async function restartBrowserAsAgent(who: string): Promise<boolean> {
  const deps = agentStartDeps?.()
  if (!deps?.driver) return false
  const driver = deps.driver
  const pool = await deps.getPool()
  await ensureBrowserSessions(pool)
  await ensureBrowserProfiles(pool)

  if (driver.restart) {
    const existing = await readSession(pool, who)
    const went = await driver
      .restart(existing?.podId ?? '')
      .catch((e: unknown) => {
        console.warn('[browser:restart]', who, String(e).slice(0, 200))
        return false
      })
    if (!went) {
      console.log(
        '[browser:restart]',
        who,
        'the driver cannot restart this pod'
      )
      return false
    }
    /* The pod it pointed at is going down: the row must not outlive it. */
    await dropSession(pool, who)
  } else {
    await close(pool, driver, who).catch(() => undefined)
  }

  const out = await open(pool, deps, driver, who, 'agent')
  if (out.status >= 300) {
    console.log('[browser:restart]', who, out.status, 'did not come back')
    return false
  }
  const back = await readSession(pool, who)
  if (!back?.cdpEndpoint) {
    /* No CDP means no agent can drive it; the person still has the wheel. */
    console.log('[browser:restart]', who, out.status, 'no cdp')
    return true
  }
  const { waitForBrowser, cdpHealthIo } = await import('./health')
  const answers = await waitForBrowser(back.cdpEndpoint, await cdpHealthIo())
  console.log(
    '[browser:restart]',
    who,
    out.status,
    answers ? 'answers' : 'still not answering'
  )
  return answers
}

export async function startBrowserAsAgent(who: string): Promise<boolean> {
  const deps = agentStartDeps?.()
  if (!deps?.driver) return false
  const pool = await deps.getPool()
  await ensureBrowserSessions(pool)
  await ensureBrowserProfiles(pool)
  const out = await open(pool, deps, deps.driver, who, 'agent')
  return out.status < 300
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
  const box = { width: Number(q.get('w')), height: Number(q.get('h')) }
  /* A hidden box is not asking for anything (screen.ts isVisibleBox). */
  if (!isVisibleBox(box))
    return { status: 200, body: { ok: true, ignored: 'hidden' } }
  const want = wantedScreen(box)

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

async function personTypes(
  pool: Queryable,
  deps: BrowserDeps,
  who: string,
  req: { url?: string; method?: string },
  send: boolean
): Promise<RouteResult> {
  const session = await readSession(pool, who)
  if (!session || session.state !== 'live' || !session.cdpEndpoint) {
    return {
      status: 409,
      body: { ok: false, error: 'сначала откройте браузер' }, // cyrillic-ok: user-facing error
    }
  }
  const io = deps.typeIo ?? cdpTypeIo
  let focus: Focus
  try {
    focus = await io.focus(session.cdpEndpoint)
  } catch {
    return {
      status: 502,
      body: { ok: false, error: 'the browser did not answer' },
    }
  }
  if (!send) return { status: 200, body: { ok: true, focus } }

  if (!deps.readBody) {
    return { status: 501, body: { ok: false, error: 'typing is not wired' } }
  }
  let wanted: ReturnType<typeof parseTypeBody>
  try {
    wanted = parseTypeBody(await deps.readBody(req, MAX_TYPE_BODY_BYTES))
  } catch (e) {
    /* parseTypeBody throws only its own fixed sentences, never the text. */
    return {
      status: 400,
      body: { ok: false, error: e instanceof Error ? e.message : 'bad body' },
    }
  }
  if (wanted.text && !canTypeInto(focus)) {
    return {
      status: 409,
      body: {
        ok: false,
        focus,
        error: 'нажмите в поле на странице, куда вводить', // cyrillic-ok: user-facing error
      },
    }
  }
  /* The person is driving now: the agent stands still (sessions.ts). */
  await setWheel(pool, who, 'person').catch(() => {})
  try {
    if (wanted.key || wanted.scroll) {
      await io.press?.(session.cdpEndpoint, wanted.key, wanted.scroll)
    }
    if (wanted.text || wanted.enter) {
      await io.insert(session.cdpEndpoint, wanted.text, wanted.enter)
    }
  } catch {
    return {
      status: 502,
      body: { ok: false, error: 'the browser did not take it' },
    }
  }
  /* An agent waiting for this (browser_ask_input) learns that it came. */
  if (wanted.text) {
    markTyped(who, {
      chars: wanted.text.length,
      field: focus.field,
      enter: wanted.enter,
    })
  }
  /* Where it went and how long it was. Never the text. */
  return {
    status: 200,
    body: { ok: true, focus, typed: wanted.text.length, enter: wanted.enter },
  }
}

async function bringLogins(
  pool: Queryable,
  deps: BrowserDeps,
  who: string,
  req: { url?: string; method?: string }
): Promise<RouteResult> {
  const session = await readSession(pool, who)
  if (!session || session.state !== 'live' || !session.cdpEndpoint) {
    return {
      status: 409,
      body: {
        ok: false,
        error: 'сначала откройте браузер', // cyrillic-ok: user-facing error
      },
    }
  }
  if (!deps.readBody) {
    return { status: 501, body: { ok: false, error: 'import is not wired' } }
  }

  let parsed: ReturnType<typeof parseCookieExport>
  try {
    parsed = parseCookieExport(await deps.readBody(req, MAX_IMPORT_BYTES))
  } catch (e) {
    /* The parser's own words, which never contain a value. */
    return {
      status: 400,
      body: { ok: false, error: e instanceof Error ? e.message : 'bad file' },
    }
  }
  if (parsed.cookies.length === 0) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'no usable cookies in this file',
        skipped: parsed.skipped,
      },
    }
  }

  try {
    await (deps.importCookies ?? importCookies)(
      session.cdpEndpoint,
      parsed.cookies
    )
  } catch {
    return {
      status: 502,
      body: { ok: false, error: 'the browser did not take them' },
    }
  }
  /* Counts and site names. Never a value. */
  return {
    status: 200,
    body: {
      ok: true,
      imported: parsed.cookies.length,
      skipped: parsed.skipped,
      sites: sitesOf(parsed.cookies),
    },
  }
}
