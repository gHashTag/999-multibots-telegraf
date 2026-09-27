/**
 * The Reddit desk (reddit.ts) wired to the person's own browser, their model
 * and their approvals. Kept apart so every rule in reddit.ts stays testable
 * without a pod.
 *
 * TWO THINGS ARE WORTH NOTICING HERE.
 *
 * WHAT IS READ IS READ AS REDDIT'S OWN JSON, from inside the signed-in page:
 * `/message/unread.json` and `about/rules.json` fetched by the page itself
 * (evaluateOn runs with awaitPromise). That is the account's own data, exactly
 * as Reddit reports it -- no scraping of a layout that changes every quarter,
 * and no second set of credentials, because the cookie is already there.
 *
 * WHAT IS WRITTEN IS WRITTEN BY LABEL, NEVER BY A MODEL DECIDING WHERE TO
 * CLICK: the prefilled submit page and the comment box the person would use,
 * with the buttons found by the words printed on them (browser/find-target.ts).
 * The model writes prose and nothing else.
 *
 * Switched on by REDDIT_DESK_ENABLED=1.
 */
import type { Queryable } from '../browser/sessions'
import {
  redditTick,
  submitUrl,
  subredditsOf,
  type Answer,
  type Mention,
  type PlannedPost,
} from './reddit'
import { RSS_URL } from './blog-share'

const settle = (ms: number) => new Promise(r => setTimeout(r, ms))

/** One line about the project, for the draft. Overridable without a deploy. */
const ABOUT =
  process.env.REDDIT_DESK_ABOUT ||
  /* cyrillic-ok: prompt copy, and the owner reads it in the question */
  't27 — язык, в котором спека исполняется: её assert-блоки проверяет ' +
    'компилятор. Trinity — среда вокруг него (агенты, FPGA-синтез). Сайт t27.ai.'

export async function runRedditDesk(pool: Queryable): Promise<string> {
  if (process.env.REDDIT_DESK_ENABLED !== '1') return 'off'
  const { OWNER_TELEGRAM_ID } = await import('./telegram-tools')
  const owner = String(process.env.REDDIT_DESK_OWNER || OWNER_TELEGRAM_ID || '')
  if (!owner) return 'no owner'
  const { requestPermission } = await import('../browser/agent-tools')
  const { readApproval } = await import('../browser/approvals')
  const { sendToTelegram } = await import('../auth/telegram-sender')
  const { readStrategy } = await import('./strategies')
  const { loginsOfPerson } = await import('../browser/logins')
  const { isNotConnected } = await import('./rounds')

  /*
   * A DESK THAT IS NOT SIGNED IN DOES NOTHING AT ALL -- it does not read the
   * inbox (there is none), and it certainly does not press a button on what
   * would be a sign-in form (#2965's rule). The owner is told once, here,
   * rather than by a round full of empty pages.
   */
  const logins = await loginsOfPerson(pool, owner).catch(() => null)
  if (isNotConnected('https://www.reddit.com/', logins))
    return 'reddit is not signed in'

  /* The desk's own list of communities, from its row if it has one. */
  const row = await readStrategy(pool, 'reddit:subreddits').catch(() => null)
  const subs = subredditsOf(
    (row as { subreddits?: unknown } | null)?.subreddits
  )

  return await redditTick({
    pool,
    now: Date.now,
    about: ABOUT,
    subs,
    readJson: url => readAsThePerson(pool, owner, url),
    ask: what => requestPermission(pool, owner, what),
    answerOf: async id =>
      ((await readApproval(pool, id))?.state ?? 'expired') as Answer,
    draft: text => writeDraft(text),
    reply: (m, text) => replyOnReddit(pool, owner, m, text),
    submit: p => submitOnReddit(pool, owner, p),
    fetchRss: async () => {
      const r = await fetch(RSS_URL, { signal: AbortSignal.timeout(20_000) })
      if (!r.ok) throw new Error(`feed answered ${r.status}`)
      return await r.text()
    },
    tell: text => sendToTelegram(owner, `[Reddit] ${text}`),
  })
}

/** Where the time of the last tick is kept, so a deploy cannot forget it. */
export const LAST_TICK_KEY = 'reddit:last-tick'

let running = false

/**
 * THE PACE LIVES IN THE DATABASE, NOT IN A TIMER.
 *
 * The render service is deployed many times a day and rarely lives an hour
 * (setinterval-counts-the-process: 13 deploys in 3.5 hours, the longest life 45
 * minutes), so a bare `setInterval(…, 60 min)` would never fire. The caller
 * ticks often and cheaply; whether the desk WORKS is decided against the last
 * tick recorded in agent_strategies.
 *
 * The mark is written BEFORE the work, for the same reason rounds-wiring writes
 * it first: a tick opens tabs and takes seconds, and the deploy that interrupts
 * it must not leave the next process starting another one.
 */
export async function runRedditIfDue(
  pool: Queryable,
  opts: { force?: boolean } = {}
): Promise<string> {
  if (process.env.REDDIT_DESK_ENABLED !== '1') return 'off'
  if (running) return 'already running'
  const { readStrategy, writeStrategy } = await import('./strategies')
  const everyMs =
    Math.max(5, Number(process.env.REDDIT_DESK_EVERY_MIN) || 60) * 60_000
  const row = await readStrategy(pool, LAST_TICK_KEY).catch(() => null)
  const at = (row as { at?: unknown } | null)?.at
  const last = typeof at === 'string' ? Date.parse(at) : NaN
  if (!opts.force && Number.isFinite(last) && Date.now() - last < everyMs)
    return 'not due'
  running = true
  try {
    await writeStrategy(pool, LAST_TICK_KEY, { at: new Date().toISOString() })
    return await runRedditDesk(pool)
  } finally {
    running = false
  }
}

/** The browser's endpoint, started if it is off. */
async function endpointOf(pool: Queryable, owner: string): Promise<string> {
  const { readSession } = await import('../browser/sessions')
  const { startBrowserAsAgent } = await import('../browser/routes')
  let s = await readSession(pool, owner)
  if (!s || s.state !== 'live' || !s.cdpEndpoint) {
    await startBrowserAsAgent(owner)
    s = await readSession(pool, owner)
  }
  if (!s?.cdpEndpoint) throw new Error('the browser did not start')
  return s.cdpEndpoint
}

/**
 * Reddit's own JSON, fetched BY the signed-in page, so the account's cookie
 * does the authenticating and no credential is ever handled here. The tab is
 * closed afterwards: reading the inbox must not leave the person's browser
 * fuller than it was.
 */
async function readAsThePerson(
  pool: Queryable,
  owner: string,
  url: string
): Promise<unknown> {
  const { listTargets, newPage, closePage } = await import('../browser/cdp')
  const cdp = await endpointOf(pool, owner)
  /*
   * TWO PLACES TO READ IN, AND NEITHER IS TRUSTWORTHY ALONE.
   *
   * A tab already on Reddit is the cheap one, and it is usually warm. But a
   * tab is not a promise of a live renderer: measured in this pod 2026-09-27,
   * the profile's reddit tab answered NOTHING -- not Runtime.evaluate, not
   * even Page.navigate -- while five other tabs in other windows answered at
   * once, and activating it did not change that. Its renderer was a corpse,
   * and a desk that always prefers the open tab would have read that corpse
   * forever. So: the open tab first, briefly, then a fresh one.
   */
  const mine = choosePage(
    await listTargets(cdp).catch(() => []),
    'https://www.reddit.com'
  )
  let first = ''
  if (mine) {
    try {
      return await readIn(cdp, mine, url, 4)
    } catch (e) {
      first = e instanceof Error ? e.message : String(e)
    }
  }
  const page = await newPage(cdp, 'https://www.reddit.com/')
  try {
    return await readIn(cdp, page.id, url)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    /*
     * BOTH SILENT MEANS THE BROWSER, NOT THE PAGE. When the pod ran out of
     * process slots the zygote never recovered: every renderer started after
     * that hung, old tabs kept working, and only restarting chromium cured it
     * (`supervisorctl restart chromium`). Saying so here saves the next day.
     */
    throw new Error(
      first
        ? `${why}; the tab already open on reddit did not answer either (${first}) -- chromium is not starting renderers, restart it`
        : why
    )
  } finally {
    /* Close only what this read opened: a tab that was the person's stays. */
    await closePage(cdp, page.id).catch(() => {})
  }
}

/** The read itself, in one named tab. */
async function readIn(
  cdp: string,
  pageId: string,
  url: string,
  tries?: number
): Promise<unknown> {
  const { evaluateOn, activatePage } = await import('../browser/cdp')
  const page = { id: pageId }
  /* An activated tab is not a background tab, and so is not a frozen one. */
  await activatePage(cdp, page.id).catch(() => {})
  /*
   * THE FETCH MUST RUN FROM REDDIT'S OWN ORIGIN, NOT FROM A TAB THAT IS
   * STILL BLANK. On the first live tick (2026-09-27) the account was signed
   * in and the inbox held five unread replies, and the desk still reported
   * that the inbox had not answered: a flat 4-second wait ended while the
   * tab was on about:blank, so the request went out cross-origin, CORS
   * refused it, and `fetch` failed for a reason that had nothing to do with
   * Reddit. Asking the page where it IS costs one round trip and cannot be
   * wrong about it.
   */
  await waitForOrigin(cdp, page.id, 'https://www.reddit.com', tries)
  const text = await evaluateOn(
    cdp,
    page.id,
    `fetch(${JSON.stringify(url)}, { credentials: 'include' })
         .then(r => r.text()).catch(e => String(e))`
  )
  /*
   * Reddit answers JSON when the account is signed in and HTML when it is
   * not. Anything that is not JSON is a FAILURE to read, not an empty
   * inbox -- reddit.ts stops on a throw, and would have posted on a null.
   */
  const body = typeof text === 'string' ? text.trim() : ''
  if (!body.startsWith('{') && !body.startsWith('['))
    throw new Error(`reddit answered with no json: ${body.slice(0, 80)}`)
  return body
}

/**
 * The id of a page already open at that origin, or null. Reading is done in
 * such a page when there is one -- see readAsThePerson for why.
 */
export function choosePage(
  targets: Array<{ id: string; type: string; url: string }>,
  origin: string
): string | null {
  /*
   * Compared as ORIGINS, not as a prefix: `https://www.reddit.com.evil.test/`
   * starts with `https://www.reddit.com` and is a different site entirely, and
   * this page is about to be handed the account's cookie.
   */
  const at = (url: string): string => {
    try {
      return new URL(url).origin
    } catch {
      return ''
    }
  }
  const want = at(origin)
  const hit = targets.find(t => t.type === 'page' && at(t.url) === want)
  return hit ? hit.id : null
}

/**
 * Waits until the tab reports the origin it was opened at, and says what it
 * reported instead when it never does -- a wrong origin is exactly the failure
 * this helper exists to name.
 */
async function waitForOrigin(
  cdp: string,
  pageId: string,
  want: string,
  tries = 14,
  everyMs = 1_500
): Promise<void> {
  const { evaluateOn } = await import('../browser/cdp')
  let saw = ''
  /*
   * WHY IT NEVER ANSWERED IS THE WHOLE ANSWER. The first version reported
   * "it is at nowhere" for a tab whose renderer was frozen and timing out
   * every call -- true, useless, and it cost a day. The last error travels.
   */
  let why = ''
  for (let i = 0; i < tries; i++) {
    await settle(everyMs)
    const at = await evaluateOn(cdp, pageId, 'location.origin').catch(
      (e: unknown) => {
        why = String(e instanceof Error ? e.message : e).slice(0, 120)
        return ''
      }
    )
    saw = typeof at === 'string' ? at : ''
    if (saw === want) return
  }
  throw new Error(
    `the tab never reached ${want}, it is at ${saw || 'nowhere'}` +
      (why ? ` (${why})` : '')
  )
}

/**
 * The draft, from the one model call this codebase keeps for prose
 * (agent/provider.ts reserveEnv). Returns null rather than a guess when no
 * model answers -- reddit.ts then hands the comment to the owner instead of
 * offering them something to approve.
 */
async function writeDraft(prompt: string): Promise<string | null> {
  const { reserveEnv } = await import('./provider')
  const reserve = reserveEnv()
  if (!reserve?.key) return null
  try {
    const r = await fetch(`${reserve.base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${reserve.key}`,
      },
      body: JSON.stringify({
        model: reserve.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!r.ok) return null
    const out = (await r.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const text = out.choices?.[0]?.message?.content
    return typeof text === 'string' && text.trim() ? text.trim() : null
  } catch {
    return null
  }
}

/** Press the first button whose label matches, or throw saying so. */
async function pressOne(
  cdp: string,
  pageId: string,
  labels: string[]
): Promise<string> {
  const { evaluateOn, clickAt } = await import('../browser/cdp')
  const { findProbe, foundOf } = await import('../browser/find-target')
  for (const label of labels) {
    const found = foundOf(
      await evaluateOn(cdp, pageId, findProbe(label)).catch(() => null)
    )
    if (found) {
      await clickAt(cdp, pageId, found.x, found.y)
      return found.label
    }
  }
  throw new Error(`не найдено: ${labels[0]}`) // cyrillic-ok: told to the owner
}

/**
 * The answer, typed into the comment box under that comment, by the labels
 * the person reads. The window is LEFT OPEN when a button is missing: an
 * approved answer half-typed is something the owner can finish in one tap,
 * and a closed tab is something they cannot.
 */
async function replyOnReddit(
  pool: Queryable,
  owner: string,
  m: Mention,
  text: string
): Promise<string> {
  const { newPage, typeText, activatePage } = await import('../browser/cdp')
  const cdp = await endpointOf(pool, owner)
  const page = await newPage(cdp, m.link)
  /* Front, so the tab is awake -- and so the person sees what is typed. */
  await activatePage(cdp, page.id).catch(() => {})
  /* The same trap as the inbox: press nothing until the page is really here. */
  await waitForOrigin(cdp, page.id, 'https://www.reddit.com')
  await settle(3_000)
  /* Reddit's own words on the comment's own reply control. */
  await pressOne(cdp, page.id, ['reply', 'ответить'])
  await settle(1_500)
  await typeText(cdp, page.id, text)
  await settle(1_000)
  const pressed = await pressOne(cdp, page.id, [
    'comment',
    'reply',
    'ответить',
    'комментировать',
  ])
  return `ответ отправлен («${pressed}») u/${m.author} в r/${m.subreddit}` // cyrillic-ok: told to the owner
}

/** The post, on Reddit's own prefilled submit page. */
async function submitOnReddit(
  pool: Queryable,
  owner: string,
  p: PlannedPost
): Promise<string> {
  const { newPage, activatePage } = await import('../browser/cdp')
  const cdp = await endpointOf(pool, owner)
  const page = await newPage(cdp, submitUrl(p))
  /* Front, so the tab is awake -- and so the person sees what is posted. */
  await activatePage(cdp, page.id).catch(() => {})
  await waitForOrigin(cdp, page.id, 'https://www.reddit.com')
  await settle(3_000)
  const pressed = await pressOne(cdp, page.id, ['post', 'опубликовать'])
  return `опубликовано («${pressed}») в r/${p.subreddit}` // cyrillic-ok: told to the owner
}
