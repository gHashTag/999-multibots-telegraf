/**
 * QUEEN-WATCH: THE RELAYS PROBE, HOURLY, ON RAILWAY -- REPORTED THROUGH THE QUEEN.
 *
 * Owner, 2026-10-03: run the experiments on Railway (the Mac sits at load
 * 300+), make monitoring and self-repair go through the Queen, report through
 * her. Until now the bot -> render roads were watched by `tri relays-watch`, a
 * launchd job on that Mac: a starved Mac is a silent watch.
 *
 * This is a PORT, not a new design:
 *   probe    bin/helpers/relays.sh        -- the same five roads, over HTTP
 *   watch    bin/helpers/relays-watch.sh  -- the same heal and report rules
 * Read those two first; every rule below names the one it carries over.
 *
 * A SECOND, INDEPENDENT WATCH (owner, 2026-10-04: the Queen watches the
 * BROWSER page too, and reports through the same channels): `watchPage` opens
 * app.t27.ai/game/browser as a person's browser would -- the page, the Queen
 * board it frames at /queen/, and every script and stylesheet the two name --
 * with public GETs and no secret. It never heals: a static page has nothing to
 * restart. Its long form sits above `probeBrowserPage`.
 *
 * Railway runs this as a CRON service (`0 * * * *`): it runs once and exits.
 * Exit code = the worse of the two watches: 0 every road and the page answer,
 * 1 something is broken, 2 nothing broken but something not measured. A cron
 * container has no memory, so the previous result lives in a JSON file on a
 * small Railway volume (STATE_DIR, /data); the page keeps its own key in it
 * (`page`), so one watch's "already reported" never silences the other. A
 * volume and not a Postgres row because the service has no npm dependencies,
 * and node has no Postgres client built in; a file is the whole of what this
 * needs.
 *
 * Secrets: every value arrives as a Railway REFERENCE variable and is never
 * printed. Keys are compared by sha256 and only the first 8 hex characters of
 * a hash are ever shown; every output line is scrubbed of every secret value
 * besides, so a future message that quotes a response cannot leak one. That
 * holds for the network as well as stdout: every request goes through
 * `call()`, which scrubs the request BODY of every secret (raw and as it
 * reads inside a JSON string) -- the Telegram message, the Queen report, the
 * GitHub issue and comment alike. Headers and the URL are left alone: that is
 * where a token is meant to go.
 *
 * Variables, all Railway references -- no value is ever copied:
 *   BOT_RENDER_API_KEY   ${{999-multibots-telegraf.RENDER_API_KEY}}
 *   RENDER_API_KEY       ${{vibee-render.RENDER_API_KEY}}
 *   RAILWAY_API_TOKEN    ${{vibee-render.RAILWAY_API_TOKEN}}  (project token)
 *   BOT_SERVICE_ID       ${{999-multibots-telegraf.RAILWAY_SERVICE_ID}}
 *   RENDER_SERVICE_ID    ${{vibee-render.RAILWAY_SERVICE_ID}}
 *   TRIOS_API_TOKEN      ${{trios-agent-server.TRIOS_API_TOKEN}}
 *   OWNER_BOT_TOKEN      ${{vibee-render.BOT_TOKEN_12}}       (@t27ai_bot)
 *   GITHUB_TOKEN         ${{trios-agent-server.TRIOS_GITHUB_API_TOKEN}}
 *   TELEGRAM_API_ROOT    ${{vibee-render.TELEGRAM_API_ROOT}}
 *   TELEGRAM_API_FILES_ROOT ${{vibee-render.TELEGRAM_API_FILES_ROOT}}
 *   BOT_API_LOCAL_BOTS   ${{vibee-render.BOT_API_LOCAL_BOTS}}
 *   RAILWAY_ENVIRONMENT_ID is given to every Railway service.
 *   BROWSER_PAGE_URL     optional, a plain URL (not a secret); `off` stops
 *                        the page watch. Default: BROWSER_PAGE below.
 *
 * After the two watches, on the same run, igla.mjs watches the IGLA-Coder
 * loop (gHashTag/igla-coder-gpu) and reports it to the Queen as `igla-loop`,
 * then release.mjs moves the board's QUEEN_REF (the port of
 * .github/workflows/queen-ref-bump.yml) and reports as `board-release`.
 * Their optional variables are listed in their own headers; neither changes
 * the exit code above (another project's budget is not a broken road here),
 * and a crash in either is one scrubbed log line.
 */
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const OWNER_CHAT = '144022504'
export const RAILWAY_API = 'https://backboard.railway.com/graphql/v2'
/*
 * Where the owner's bot answers. A bot moved to our own Bot API server must
 * never be called on the cloud again (the call logs it back in there and
 * splits its updates), so the host is the shared helper's answer, never a
 * literal. telegram-api.cjs is a BYTE COPY of scripts/lib/telegram-api.cjs:
 * the image is built from this directory alone, and
 * src/__tests__/telegram-api-parity.test.ts fails the moment the two differ.
 */
const { telegramApiFor } = createRequire(import.meta.url)('./telegram-api.cjs')
const GITHUB_API = 'https://api.github.com'
const LABEL = 'queen-watch'
/*
 * The address the owner opens, with a spec in it: the same URL a shared link
 * carries, so the probe asks for what a person asks for.
 */
export const BROWSER_PAGE =
  'https://app.t27.ai/game/browser?spec=specs%2Fdemos%2Fhello_world.t27'
/* How many assets one run fetches at most; more are named "NOT measured". */
export const PAGE_ASSETS_MAX = 40
/*
 * One open issue per watch, told apart by title: the label predates the page
 * watch, so a queen-watch issue with any OTHER title (one a person retitled
 * included) stays the relays' issue, as it always was.
 */
export const RELAYS_ISSUE_TITLE = 'queen-watch: a bot -> render road is broken'
export const PAGE_ISSUE_TITLE = 'queen-watch: the BROWSER page is broken'

export function config(env = process.env) {
  const n = (v, d) => (v !== undefined && v !== '' ? Number(v) : d)
  return {
    base:
      env.RENDER_BASE_URL || 'https://vibee-render-production.up.railway.app',
    botKey: env.BOT_RENDER_API_KEY || '',
    renderKey: env.RENDER_API_KEY || '',
    /* relays-watch runs `relays.sh 2`: two hours, so an hourly run overlaps. */
    hours: n(env.LOG_HOURS, 2),
    railwayToken: env.RAILWAY_API_TOKEN || '',
    railwayApi: env.RAILWAY_API_URL || RAILWAY_API,
    environmentId: env.RAILWAY_ENVIRONMENT_ID || '',
    botServiceId: env.BOT_SERVICE_ID || '',
    renderServiceId: env.RENDER_SERVICE_ID || '',
    queenUrl:
      env.QUEEN_URL || 'https://trios-agent-server-production.up.railway.app',
    queenToken: env.TRIOS_API_TOKEN || '',
    tgToken: env.OWNER_BOT_TOKEN || '',
    /* The render's Bot API routing, by reference: the same answer it gets. */
    botApiEnv: {
      TELEGRAM_API_ROOT: env.TELEGRAM_API_ROOT || '',
      TELEGRAM_API_FILES_ROOT: env.TELEGRAM_API_FILES_ROOT || '',
      BOT_API_LOCAL_BOTS: env.BOT_API_LOCAL_BOTS || '',
    },
    ownerChat: env.OWNER_CHAT || OWNER_CHAT,
    ghToken: env.GITHUB_TOKEN || '',
    ghRepo: env.GITHUB_REPO || 'gHashTag/999-multibots-telegraf',
    /* The BROWSER page (watchPage); '' when turned off with `off`. */
    pageUrl:
      env.BROWSER_PAGE_URL === 'off'
        ? ''
        : env.BROWSER_PAGE_URL || BROWSER_PAGE,
    stateDir: env.STATE_DIR || '/data',
    /* relays-watch.sh's own numbers. */
    healEveryS: n(env.HEAL_EVERY_S, 21600),
    repeatS: n(env.REPEAT_S, 21600),
    retryWaitS: n(env.RETRY_WAIT_S, 60),
    swapWaitS: n(env.SWAP_WAIT_S, 90),
    healWaitS: n(env.HEAL_WAIT_S, 240),
    /* igla.mjs, the IGLA-Coder loop on the same tick: its header says why. */
    iglaOn: env.IGLA !== '0',
    /* '0' watches without the tick (it replaces IGLA_DISPATCH). */
    iglaTrigger: env.IGLA_TRIGGER !== '0',
    /* Empty = igla.mjs IGLA_BOARD. The repo is igla.mjs's constant, not env. */
    iglaBoard: env.IGLA_BOARD_URL || '',
    runpodKey: env.RUNPOD_API_KEY || '',
    /* Retired with the GitHub tick: nothing sends it. Read only so that
     * secretsOf scrubs it if the owner leaves it set. */
    iglaGhToken: env.IGLA_GITHUB_TOKEN || '',
    /* igla-judge production project token: JUDGEUP, the loop runner, and
     * the tick (igla.mjs sends it to RAILWAY_API only). */
    iglaRailwayToken: env.IGLA_RAILWAY_TOKEN || '',
    /* release.mjs, the board's QUEEN_REF bump: its header says why. The repo
     * it writes to is release.mjs's constant, not env. */
    releaseOn: env.BOARD_RELEASE !== '0',
    releaseGhToken: env.RELEASE_GITHUB_TOKEN || '',
  }
}

/** Every value that must never reach the output. */
export function secretsOf(cfg) {
  return [
    cfg.botKey,
    cfg.renderKey,
    cfg.railwayToken,
    cfg.queenToken,
    cfg.tgToken,
    cfg.ghToken,
    cfg.runpodKey,
    cfg.iglaGhToken,
    cfg.iglaRailwayToken,
    cfg.releaseGhToken,
  ].filter(s => typeof s === 'string' && s.length >= 6)
}

export function redact(text, secrets) {
  let out = String(text)
  for (const s of secrets) {
    out = out.split(s).join('[redacted]')
    /* The same value as it reads inside a JSON string: a body is scrubbed
     * after JSON.stringify, where a quote or a backslash is escaped. */
    const inJson = JSON.stringify(s).slice(1, -1)
    if (inJson !== s) out = out.split(inJson).join('[redacted]')
  }
  return out
}

export const hash8 = v =>
  createHash('sha256').update(v).digest('hex').slice(0, 8)
const same = (a, b) =>
  createHash('sha256').update(a).digest('hex') ===
  createHash('sha256').update(b).digest('hex')

/**
 * One HTTP call; a road that does not answer is status 0 (curl's 000).
 *
 * THE choke point for the network: there is no other path to `deps.fetch`, and
 * the body is scrubbed here, so a sender added later cannot forget to. A
 * sender that truncates its text still redacts BEFORE slicing (a cut through
 * the middle of a secret leaves a prefix nothing here can recognise).
 */
export async function call(cfg, deps, url, init = {}, timeoutMs = 15000) {
  const out = { ...init, signal: AbortSignal.timeout(timeoutMs) }
  if (out.body !== undefined) out.body = redact(out.body, secretsOf(cfg))
  try {
    const res = await deps.fetch(url, out)
    return { status: res.status, text: await res.text() }
  } catch (e) {
    /* Only the error's NAME: a message may carry the URL, and the Telegram
     * URL carries the bot token. */
    return { status: 0, text: '', error: (e && e.name) || 'Error' }
  }
}

const json = text => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// --- Railway API --------------------------------------------------------

/*
 * Two kinds of Railway token and the shape does not say which (pod-driver.ts
 * in the render learned it): the account header first, a refusal retried as
 * a project token. The one on vibee-render is a project token.
 */
export async function railway(cfg, deps, query, variables) {
  let refusal = 'refused'
  for (const auth of [
    { authorization: `Bearer ${cfg.railwayToken}` },
    { 'project-access-token': cfg.railwayToken },
  ]) {
    const r = await call(
      cfg,
      deps,
      cfg.railwayApi,
      {
        method: 'POST',
        /* Cloudflare in front of the API answers 1010 to an empty agent. */
        headers: {
          'content-type': 'application/json',
          'user-agent': 'queen-watch',
          ...auth,
        },
        body: JSON.stringify({ query, variables }),
      },
      20000
    )
    if (r.status === 401 || r.status === 403) {
      refusal = `HTTP ${r.status}`
      continue
    }
    if (r.status !== 200) throw new Error(`railway API HTTP ${r.status}`)
    const body = json(r.text) || {}
    const said = body.errors?.[0]?.message
    if (said && /not authorized|unauthorized|invalid token/i.test(said)) {
      refusal = said
      continue
    }
    if (said) throw new Error(`railway API: ${said.slice(0, 120)}`)
    return body.data || {}
  }
  throw new Error(`railway API: ${refusal}`)
}

const DEPLOYMENTS = `query($input: DeploymentListInput!) {
  deployments(first: 30, input: $input) { edges { node { id status createdAt } } }
}`
const LOGS = `query($id: String!, $filter: String, $start: DateTime, $limit: Int) {
  deploymentLogs(deploymentId: $id, filter: $filter, startDate: $start, limit: $limit) { message }
}`
const RESTART = `mutation($id: String!) { deploymentRestart(id: $id) }`

async function deployments(cfg, deps, serviceId) {
  const d = await railway(cfg, deps, DEPLOYMENTS, {
    input: { serviceId, environmentId: cfg.environmentId },
  })
  return (d.deployments?.edges || []).map(e => e.node)
}

/*
 * EVERY DEPLOY IN THE WINDOW, NOT THE LATEST ONE (relays.sh): the first run
 * of that probe said "no relay failures in 24 h" eight hours after the 401s,
 * which lived in the deployment before. A deploy that ran inside the window:
 * created after the cut, or the last one before it.
 */
export function deploysInWindow(rows, cutMs) {
  const live = rows.filter(x =>
    ['SUCCESS', 'REMOVED', 'CRASHED'].includes(x.status)
  )
  const before = live.filter(x => Date.parse(x.createdAt) < cutMs)
  return [...live.filter(x => !before.includes(x)), ...before.slice(0, 1)]
}

// --- the probe (relays.sh) ----------------------------------------------

/**
 * The five roads. Returns { rc, lines }: each line { mark, road, code, text }
 * with mark ok | FAIL | warn | ?? -- the words relays.sh prints.
 */
export async function probe(cfg, deps) {
  const lines = []
  const add = (mark, road, text, code) => lines.push({ mark, road, code, text })
  if (!cfg.botKey || !cfg.renderKey) {
    add(
      '??',
      'keys',
      `could not read RENDER_API_KEY (bot: ${cfg.botKey ? 'set' : 'empty'}, ` +
        `render: ${cfg.renderKey ? 'set' : 'empty'}) -- NOT measured`
    )
    return { rc: 2, lines }
  }
  let rc = 0
  const bad = (road, text, code) => {
    add('FAIL', road, text, code)
    rc = 1
  }

  // 1. key parity, by hash
  if (same(cfg.botKey, cfg.renderKey)) {
    add(
      'ok',
      'parity',
      `key parity: the bot holds the render's key (sha256 ${hash8(cfg.botKey)})`
    )
  } else {
    bad(
      'parity',
      `key parity: the bot's key (sha256 ${hash8(cfg.botKey)}) differs from ` +
        `the render's (sha256 ${hash8(cfg.renderKey)}) -- every relay is 401`
    )
  }

  const junk = deps.randomHex(16)
  const approveUrl = `${cfg.base}/api/browser/approve?t=${junk}`

  // 2. guard: no key -> 401
  let r = await call(cfg, deps, approveUrl, {
    headers: { accept: 'application/json' },
  })
  if (r.status === 401) add('ok', 'guard', 'guard: no key -> 401')
  else
    bad(
      'guard',
      `guard: no key -> ${r.status} (expected 401; is the route public now?)`,
      r.status
    )

  // 3. approve with the bot's key and a junk token
  r = await call(cfg, deps, approveUrl, {
    headers: { accept: 'application/json', 'x-api-key': cfg.botKey },
  })
  let said = ((json(r.text) || {}).said || '').trim()
  if (r.status === 200 && said) {
    add(
      'ok',
      'approve',
      `approve (Allow/Deny button): 200, the person reads: ${said}`,
      200
    )
  } else {
    bad(
      'approve',
      `approve (Allow/Deny button): ${r.status}, words: ${said || 'none'}`,
      r.status
    )
  }

  // 4. meeting_answer over /mcp with a junk token
  r = await call(
    cfg,
    deps,
    `${cfg.base}/mcp?telegram_id=${OWNER_CHAT}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.botKey },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'meeting_answer',
          arguments: { action: 'ok', token: deps.randomHex(11) },
        },
      }),
    },
    20000
  )
  said = meetingSaid(r.text)
  if (r.status === 200 && said && !said.startsWith('ERROR')) {
    add(
      'ok',
      'meeting',
      `meeting card button: 200, the person reads: ${said}`,
      200
    )
  } else {
    bad(
      'meeting',
      `meeting card button: ${r.status}, words: ${said || 'none'}`,
      r.status
    )
  }

  // 5. relay failures in the bot's log, across every deploy in the window
  const notCounted = why => {
    add('??', 'log', `bot log: ${why} -- failures NOT counted`)
    rc = rc > 0 ? rc : 2
  }
  if (!cfg.railwayToken || !cfg.botServiceId || !cfg.environmentId) {
    notCounted(
      `no ${!cfg.railwayToken ? 'RAILWAY_API_TOKEN' : !cfg.botServiceId ? 'BOT_SERVICE_ID' : 'RAILWAY_ENVIRONMENT_ID'}`
    )
  } else {
    try {
      const cut = deps.now() * 1000 - cfg.hours * 3600_000
      const ids = deploysInWindow(
        await deployments(cfg, deps, cfg.botServiceId),
        cut
      )
      if (!ids.length) notCounted('Railway listed no deployments')
      else {
        const hits = []
        for (const d of ids) {
          const got = await railway(cfg, deps, LOGS, {
            id: d.id,
            filter: '"browser-approval" OR "meeting-answer"',
            start: new Date(cut).toISOString(),
            limit: 500,
          })
          for (const l of got.deploymentLogs || []) {
            const m =
              /\[(browser-approval|meeting-answer)\][^{]*(\{[^}]*\})?/.exec(
                l.message || ''
              )
            if (m) hits.push(m[0].trim())
          }
        }
        if (!hits.length) {
          add(
            'ok',
            'log',
            `bot log, ${cfg.hours} h over ${ids.length} deploy(s): no relay failures`
          )
        } else {
          const counts = new Map()
          for (const h of hits) counts.set(h, (counts.get(h) || 0) + 1)
          const top = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([k, v]) => `${v}x ${k}`)
          add(
            'warn',
            'log',
            `bot log, ${cfg.hours} h over ${ids.length} deploy(s): ${hits.length} relay failure line(s): ${top.join('; ')}`
          )
        }
      }
    } catch (e) {
      notCounted(String(e && e.message).slice(0, 160))
    }
  }
  return { rc, lines }
}

function meetingSaid(text) {
  const r = json(text)
  if (!r) return ''
  if (r.error) return 'ERROR ' + JSON.stringify(r.error).slice(0, 80)
  let s = r.result?.structuredContent
  if (!s) s = json(r.result?.content?.[0]?.text || '{}') || {}
  return String(s.said || '').trim()
}

/* down = the render did not answer at all; everything else needs a person. */
export function kindOf(result) {
  return result.lines.some(
    l =>
      l.mark === 'FAIL' &&
      (l.road === 'approve' || l.road === 'meeting') &&
      (l.code === 0 || (l.code >= 500 && l.code < 600))
  )
    ? 'down'
    : 'person'
}

const fails = result =>
  result.lines.filter(l => l.mark === 'FAIL').map(l => `- ${l.text}`)

// --- the BROWSER page (app.t27.ai/game/browser) --------------------------

/*
 * WHAT A PERSON'S BROWSER FETCHES, NOT WHAT A ROUTE SAYS.
 *
 * /game/browser is two documents. The app's own index.html (the player,
 * apps/vibee-editor/player) draws the tab bar and an <iframe> of the Queen
 * board at /queen/ -- `queenPage()` in apps/vibee-editor/player/src/lib/hive.ts,
 * framed by pages/Hive.tsx. The board is gHashTag/trinity apps/website, built
 * into this image by the Dockerfile stage `queen` at a pinned QUEEN_REF. The
 * <iframe> is made by the app's script, so it is not in the HTML: the frame's
 * address is read from that source, and was checked in the live bundle
 * (index-*.js carries `/queen/?lang=`) on 2026-10-04.
 *
 * WHY EVERY ASSET, NOT ONLY THE PAGES. A deploy that drops a chunk leaves the
 * index naming a file that is not there: every HTML route still answers 200
 * and the person sees a blank page. So each <script src>, modulepreload and
 * stylesheet the two documents name ON THIS HOST is fetched, and has to answer
 * 200 with a body that is not HTML -- nginx's 404 page is HTML, and so would be
 * an SPA fallback answering 200 for a missing file (measured 2026-10-04: a
 * missing /queen/assets/*.js is 404 today; the HTML rule keeps it caught if a
 * config change ever routes it to index.html). Third-party files (Telegram's
 * SDK, Google Fonts) are not ours and are not fetched: their outage is not an
 * issue in this repository.
 *
 * AS THE FRAME ASKS. nginx sends a top-level visit to /queen/ on to /game
 * (`$http_sec_fetch_dest = "document"` in nginx/default.conf.template); the
 * Hive's frame asks with Sec-Fetch-Dest: iframe. The probe says the same, and
 * never follows a redirect: a 302 to /game would answer 200 with the APP's
 * index, and the board would look present while the frame drew the app inside
 * itself.
 *
 * NOT MEASURED HERE, on purpose and said so: the board's lazy chunks (69 on
 * 2026-10-04, the Queen view among them -- only what the two index documents
 * name is fetched), and whether the code runs (a script that throws is
 * `tri harness`'s finding, not this one's).
 *
 * Not measured vs broken, as in `probe`: a GET that got no answer at all
 * (status 0 -- DNS, TCP, timeout from Railway's side) is `??`, rc 2; an
 * answer that is wrong (404, 5xx, a redirect, HTML for a script) is FAIL,
 * rc 1. A host that is really down answers 502 from Railway's edge, so a
 * real outage is a FAIL, not a silence.
 */

/** True for a body that is an HTML document (an index, a fallback, a 404). */
export const looksLikeHtml = text => /^\s*<(!doctype\s+html|html)\b/i.test(text)

/**
 * The same-host assets an HTML document names, as absolute URLs, in order,
 * once each: <script src>, <link rel=modulepreload> and <link rel=stylesheet>
 * whose path starts with `prefix` (`/assets/` for the app, `/queen/assets/`
 * for the board). Pure: the probe and the tests call the same function.
 */
export function assetsOf(html, docUrl, prefix) {
  const base = new URL(docUrl)
  const attr = (attrs, name) => {
    const m = new RegExp(
      `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      'i'
    ).exec(attrs)
    return m ? (m[1] ?? m[2] ?? m[3]) : null
  }
  const out = []
  for (const m of String(html).matchAll(/<(script|link)\b([^>]*)>/gi)) {
    let ref = null
    if (m[1].toLowerCase() === 'script') ref = attr(m[2], 'src')
    else {
      const rel = (attr(m[2], 'rel') || '').toLowerCase().split(/\s+/)
      if (rel.includes('modulepreload') || rel.includes('stylesheet'))
        ref = attr(m[2], 'href')
    }
    if (!ref) continue
    let u
    try {
      u = new URL(ref, base)
    } catch {
      continue
    }
    if (u.origin !== base.origin || !u.pathname.startsWith(prefix)) continue
    if (!out.includes(u.href)) out.push(u.href)
  }
  return out
}

/** Path and query of a URL: what the output prints of our own host. */
const pathOf = href => {
  const u = new URL(href)
  return u.pathname + u.search
}

/**
 * The BROWSER page. Returns { rc, lines } in `probe`'s shape: each line
 * { mark, road, code, text }, mark ok | FAIL | warn | ??.
 */
export async function probeBrowserPage(cfg, deps) {
  const lines = []
  const add = (mark, road, text, code) => lines.push({ mark, road, code, text })
  let rc = 0
  const bad = (road, text, code) => {
    add('FAIL', road, text, code)
    rc = 1
  }
  const notMeasured = (road, text) => {
    add('??', road, text)
    rc = rc > 0 ? rc : 2
  }

  /* One document: 200, HTML, no redirect. null when it is not usable. */
  const doc = async (road, label, url, dest) => {
    const r = await call(cfg, deps, url, {
      headers: { accept: 'text/html', 'sec-fetch-dest': dest },
      redirect: 'manual',
    })
    if (r.status === 0) {
      notMeasured(
        road,
        `${label}: GET ${pathOf(url)} got no answer (${r.error}) -- NOT measured`
      )
      return null
    }
    if (r.status !== 200) {
      bad(
        road,
        `${label}: GET ${pathOf(url)} -> ${r.status} (expected 200)`,
        r.status
      )
      return null
    }
    if (!looksLikeHtml(r.text)) {
      bad(
        road,
        `${label}: GET ${pathOf(url)} -> 200 but not an HTML document`,
        200
      )
      return null
    }
    add(
      'ok',
      road,
      `${label}: GET ${pathOf(url)} -> 200, HTML (${r.text.length} bytes)`,
      200
    )
    return r.text
  }

  let pageUrl
  try {
    pageUrl = new URL(cfg.pageUrl).href
  } catch {
    notMeasured('page', `page: BROWSER_PAGE_URL is not a URL -- NOT measured`)
    return { rc, lines }
  }
  const boardUrl = new URL('/queen/?lang=en', pageUrl).href

  const page = await doc('page', 'page', pageUrl, 'document')
  /* A host that did not answer the page will not answer the board either. */
  if (rc === 2) return { rc, lines }
  const board = await doc(
    'board',
    'board (as the frame asks)',
    boardUrl,
    'iframe'
  )

  const named = [
    ...(page === null ? [] : assetsOf(page, pageUrl, '/assets/')),
    ...(board === null ? [] : assetsOf(board, boardUrl, '/queen/assets/')),
  ]
  if (
    board !== null &&
    !named.some(u => new URL(u).pathname.startsWith('/queen/assets/'))
  ) {
    /* The frame would draw nothing; also what the APP's index served at
     * /queen/ looks like (its assets are /assets/, not /queen/assets/). */
    bad(
      'board',
      `board: the /queen/ index names no script or stylesheet under /queen/assets/`
    )
  }
  if (!named.length) return { rc, lines }

  const take = named.slice(0, PAGE_ASSETS_MAX)
  const got = []
  /* Eight at a time: a slow host costs minutes, not forty timeouts in a row.
   * 30 s each, not call()'s 15: the app's index script is 833 KB, and on
   * 2026-10-04 two of eight timed out at 15 s from a Mac at load 723 (one at
   * a time, every one answered 200 in 5-8 s). */
  for (let i = 0; i < take.length; i += 8) {
    got.push(
      ...(await Promise.all(
        take.slice(i, i + 8).map(async url => {
          const r = await call(
            cfg,
            deps,
            url,
            {
              headers: {
                'sec-fetch-dest': /\.css(\?|$)/.test(url) ? 'style' : 'script',
              },
              redirect: 'manual',
            },
            30000
          )
          return { url, ...r }
        })
      ))
    )
  }
  let good = 0
  const silent = []
  const wrong = []
  for (const r of got) {
    if (r.status === 0) silent.push(r)
    else if (r.status !== 200) wrong.push({ ...r, why: `${r.status}` })
    else if (!r.text.length) wrong.push({ ...r, why: '200 with an empty body' })
    else if (looksLikeHtml(r.text))
      wrong.push({
        ...r,
        why: '200 but HTML (a fallback page answered for a missing file)',
      })
    else good++
  }
  /* Eight lines at most: the count below carries the rest. */
  for (const w of wrong.slice(0, 8))
    bad('asset', `asset: ${pathOf(w.url)} -> ${w.why}`, w.status)
  for (const q of silent.slice(0, 8))
    notMeasured(
      'asset',
      `asset: ${pathOf(q.url)} got no answer (${q.error}) -- NOT measured`
    )
  const fromApp = take.filter(
    u => !new URL(u).pathname.startsWith('/queen/')
  ).length
  const tally = `(app ${fromApp}, board ${take.length - fromApp})`
  if (wrong.length) {
    bad(
      'assets',
      `assets: ${wrong.length} of ${take.length} broken, ${good} answer ${tally}`
    )
  } else if (silent.length) {
    notMeasured(
      'assets',
      `assets: ${good} of ${take.length} answer, ${silent.length} got no answer -- NOT measured ${tally}`
    )
  } else {
    add(
      'ok',
      'assets',
      `assets: ${good} of ${take.length} answer 200 with a body that is not HTML ${tally}`
    )
  }
  if (named.length > take.length) {
    add(
      'warn',
      'assets',
      `assets: ${named.length} named, ${take.length} fetched (PAGE_ASSETS_MAX) -- the other ${named.length - take.length} NOT measured`
    )
  }
  return { rc, lines }
}

// --- state (the volume) -------------------------------------------------

export async function loadState(dir) {
  try {
    return {
      first: false,
      ...JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')),
    }
  } catch {
    return {
      first: true,
      state: 'unknown',
      unmeasured: 0,
      healed_at: 0,
      told_at: 0,
    }
  }
}

export async function saveState(dir, st) {
  const { first, ...keep } = st
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, 'state.json.tmp')
  await writeFile(tmp, JSON.stringify(keep, null, 2))
  await rename(tmp, join(dir, 'state.json'))
}

// --- heal (relays-watch.sh: only a render that did not answer) ----------

/*
 * The one heal relays-watch does unattended: the render answered 000 or 5xx
 * after a deploy swap's worth of waiting -> restart its latest deployment, at
 * most once per HEAL_EVERY_S. Key parity, a public guard, a 401: a secret or
 * code -- never touched here; secrets wait for the owner's "yes".
 */
async function restartRender(cfg, deps) {
  if (!cfg.railwayToken || !cfg.renderServiceId || !cfg.environmentId)
    return false
  try {
    const live = (await deployments(cfg, deps, cfg.renderServiceId)).find(
      d => d.status === 'SUCCESS'
    )
    if (!live) return false
    const d = await railway(cfg, deps, RESTART, { id: live.id })
    return d.deploymentRestart === true
  } catch {
    return false
  }
}

const NOTE = {
  healed: {
    ru: 'Починил сам: перезапустил vibee-render, после перезапуска все дороги отвечают.', // cyrillic-ok
    en: 'Healed: restarted vibee-render; after the restart every road answers.',
  },
  notHelped: {
    ru: 'Перезапустил vibee-render — не помогло, дороги всё ещё не отвечают.', // cyrillic-ok
    en: 'Restarted vibee-render; it did not help, the roads still do not answer.',
  },
  refused: {
    ru: 'Пытался перезапустить vibee-render — Railway отказал в перезапуске.', // cyrillic-ok
    en: 'Tried to restart vibee-render; Railway refused the restart.',
  },
  unsaved: {
    ru: 'Render не отвечает, но перезапускать не стал: состояние сторожа не сохраняется (нет тома), и без него перезапуск шёл бы каждый час.', // cyrillic-ok
    en: 'The render does not answer, but it was not restarted: the watch state is not persisted (no writable volume), and without it a restart would repeat every hour.',
  },
  tooSoon: {
    ru: 'Перезапуск render уже был меньше 6 ч назад — второй раз сам не делаю.', // cyrillic-ok
    en: 'The render was already restarted less than 6 h ago; not doing it twice unattended.',
  },
}

// --- report: the Queen, the owner's DM, one GitHub issue ----------------

export async function reportToQueen(
  cfg,
  deps,
  { headline, body, needsYou, source = 'queen-watch' }
) {
  if (!cfg.queenToken) return 'no TRIOS_API_TOKEN -- not sent'
  const clean = t => redact(String(t || ''), secretsOf(cfg))
  const r = await call(cfg, deps, `${cfg.queenUrl}/queen/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.queenToken}`,
    },
    /* Exactly these four fields: the route answers 400 to any other. It
     * stores the headline as "[source] headline" and the needs-you panel
     * shows 200 characters, so ours stays at 120. */
    body: JSON.stringify({
      source,
      headline: clean(headline).slice(0, 120),
      body: clean(body).slice(0, 8000),
      needs_you: needsYou === true,
    }),
  })
  if (r.status === 201 || r.status === 200) {
    return `filed (id ${(json(r.text) || {}).id ?? '?'})`
  }
  /* The Queen being out of reach never silences the other channels. */
  if (r.status === 404)
    return 'queen report route not deployed yet (404) -- queen unreachable'
  if (r.status === 429) return 'queen rate limit (429) -- queen unreachable'
  if (r.status === 503) return 'queen database down (503) -- queen unreachable'
  if (r.status === 0) return 'queen did not answer -- queen unreachable'
  return `refused (HTTP ${r.status})`
}

export async function tellOwner(cfg, deps, text) {
  if (!cfg.tgToken) return 'no OWNER_BOT_TOKEN -- not sent'
  /* Plain text, no parse_mode (relays-watch.sh): a Markdown message with
   * RENDER_API_KEY in it is rejected by Telegram. */
  let api
  try {
    api = telegramApiFor(cfg.tgToken, cfg.botApiEnv || {})
  } catch (e) {
    /* Fails closed: an unreadable routing is not a licence for the cloud. */
    return `bot api routing unreadable -- not sent: ${redact(e.message, secretsOf(cfg))}`
  }
  const r = await call(cfg, deps, `${api}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: cfg.ownerChat,
      text: redact(text, secretsOf(cfg)).slice(0, 4000),
    }),
  })
  return r.status === 200 && (json(r.text) || {}).ok
    ? 'sent to the owner'
    : `refused (HTTP ${r.status})`
}

/**
 * The issue body is a Queen-delegatable spec (`tri spec check` passes it):
 * the Queen will not start a bee on an issue without a `## Boundary`.
 */
export function issueSpec({ result, note, when }) {
  return [
    '## Context',
    '',
    `queen-watch (Railway cron, \`deployment/queen-watch/watch.mjs\`) found a broken bot -> render road at ${when}.`,
    'A person who taps "Allow" or a meeting card in the bot reads "could not pass the answer on".',
    '',
    '```',
    ...result.lines.map(l => `${l.mark.padEnd(4)}  ${l.text}`),
    '```',
    note ? `\nWhat the watch already did: ${note}` : '',
    '',
    '## Boundary',
    '',
    '- `src/services/browserApproval.ts`',
    '- `src/services/meetingAnswer.ts`',
    '- `apps/vibee-editor/render/render-server.ts`',
    '- `deployment/queen-watch/watch.mjs`',
    '',
    '## User Scenarios & Testing',
    '',
    '- **Given** the bot holds RENDER_API_KEY, **When** a person taps Allow on a browser question, **Then** the render answers 200 with the words the person reads.',
    '- **Given** a meeting card in the bot, **When** the person taps a button, **Then** meeting_answer over /mcp answers 200 with words.',
    '',
    '## Requirements',
    '',
    "- FR-001: The bot's RENDER_API_KEY MUST equal the render's (compared by sha256, never printed).",
    '- FR-002: `/api/browser/approve` without a key MUST answer 401.',
    "- FR-003: `/api/browser/approve` with the bot's key MUST answer 200 with a non-empty `said`.",
    '- FR-004: `meeting_answer` over `/mcp` MUST answer 200 with words.',
    "- FR-005: A key or secret MUST NOT be changed without the owner's explicit yes.",
    '',
    '## Success Criteria',
    '',
    '- `node deployment/queen-watch/watch.mjs` on Railway exits 0, and its log ends in "every road answers".',
    '- `tri relays 2` exits 0 with no FAIL line.',
    '',
  ].join('\n')
}

/**
 * The page watch's issue, delegatable the same way. Its boundary spans two
 * repositories: the board is built in gHashTag/trinity and pinned into this
 * image, so a path there says so on its own line.
 */
export function pageIssueSpec({ result, note, when, url = BROWSER_PAGE }) {
  return [
    '## Context',
    '',
    `queen-watch (Railway cron, \`deployment/queen-watch/watch.mjs\`, \`probeBrowserPage\`) found the BROWSER page broken at ${when}:`,
    `${url}`,
    'A person who opens it sees a blank or half-drawn page: the app frames the Queen board at `/queen/` (built from gHashTag/trinity `apps/website` at the pinned `QUEEN_REF`), and a document or a file it names did not answer.',
    '',
    '```',
    ...result.lines.map(l => `${l.mark.padEnd(4)}  ${l.text}`),
    '```',
    note ? `\nWhat the watch already did: ${note}` : '',
    '',
    '## Boundary',
    '',
    '- `apps/vibee-editor/Dockerfile` -- stage `queen`, `ARG QUEEN_REF` (which trinity build is served at /queen/)',
    '- `apps/vibee-editor/nginx/default.conf.template` -- `location ^~ /queen/` and the asset rules',
    '- `apps/vibee-editor/player/src/lib/hive.ts` -- `queenPage()`, the frame address',
    '- `apps/vibee-editor/player/src/pages/Hive.tsx` -- the frame',
    '- `deployment/queen-watch/watch.mjs` -- this watch',
    '- `apps/website/vite.config.ts` -- in gHashTag/trinity: base `/queen/`, chunk names',
    '- `apps/website/index.html` -- in gHashTag/trinity: the board index',
    '- `apps/website/src/components/QueenBrowser.tsx` -- in gHashTag/trinity: the BROWSER view',
    '- `apps/website/src/lib/queenBrowser.ts` -- in gHashTag/trinity',
    '- `apps/website/package.json` -- in gHashTag/trinity: the build script',
    '',
    '## User Scenarios & Testing',
    '',
    `- **Given** a person opens ${url}, **When** the page loads, **Then** it answers 200 with HTML and every script and stylesheet it names answers 200.`,
    '- **Given** the app frames the Queen board, **When** the frame asks for `/queen/?lang=en` with Sec-Fetch-Dest: iframe, **Then** it answers 200 with the board index (not a redirect to /game), and every `/queen/assets/` file it names answers 200 with a body that is not HTML.',
    '',
    '## Requirements',
    '',
    '- FR-001: The page MUST answer 200 with an HTML document, without a redirect.',
    '- FR-002: `/queen/` asked as a frame MUST answer 200 with an index that names at least one script or stylesheet under `/queen/assets/`.',
    '- FR-003: Every same-host script, modulepreload and stylesheet the two documents name MUST answer 200 with a non-empty body that is not HTML.',
    '- FR-004: The fix MUST be a build or a deploy (a trinity change and a `QUEEN_REF` bump, or this image); the watch MUST NOT restart or change anything itself.',
    '',
    '## Success Criteria',
    '',
    '- `node deployment/queen-watch/watch.mjs` on Railway exits 0, and its log ends in "the page, the board and every asset answer".',
    '- 0 FAIL lines from `probeBrowserPage` against the address above.',
    '',
  ].join('\n')
}

async function gh(cfg, deps, path, init = {}) {
  const r = await call(cfg, deps, `${GITHUB_API}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${cfg.ghToken}`,
      'user-agent': 'queen-watch',
      'content-type': 'application/json',
    },
  })
  return { status: r.status, body: json(r.text) }
}

/**
 * One open `queen-watch` issue per watch: comment on it, or open it. `owns`
 * tells this watch's issue from the other's (RELAYS_ISSUE_TITLE above).
 */
export async function fileIssue(
  cfg,
  deps,
  { title, body, comment, owns = () => true }
) {
  if (!cfg.ghToken) return { said: 'no GITHUB_TOKEN -- no issue' }
  const open = await gh(
    cfg,
    deps,
    `/repos/${cfg.ghRepo}/issues?labels=${LABEL}&state=open&per_page=10`
  )
  if (open.status !== 200 || !Array.isArray(open.body)) {
    return {
      said: `could not list issues (HTTP ${open.status}) -- nothing filed`,
    }
  }
  const mine = open.body.filter(i => !i.pull_request && owns(i))
  if (mine.length) {
    const n = mine[0].number
    const c = await gh(cfg, deps, `/repos/${cfg.ghRepo}/issues/${n}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: comment }),
    })
    return c.status === 201
      ? { said: `commented on #${n}`, url: mine[0].html_url }
      : { said: `comment on #${n} refused (HTTP ${c.status})` }
  }
  const made = await gh(cfg, deps, `/repos/${cfg.ghRepo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title, body, labels: [LABEL] }),
  })
  return made.status === 201
    ? { said: `opened #${made.body.number}`, url: made.body.html_url }
    : { said: `opening the issue refused (HTTP ${made.status})` }
}

/**
 * One report through every channel. A red event carries its watch's issue
 * ({ title, body, owns }); `watch` names the watch in the log ('page'), and
 * the relays watch, which came first, keeps its unnamed lines.
 */
async function report(cfg, deps, log, ev) {
  const say = s => log(`queen-watch: ${ev.watch ? `${ev.watch}: ` : ''}${s}`)
  const queen = await reportToQueen(cfg, deps, {
    headline: ev.headline,
    body: ev.body,
    needsYou: ev.needsYou,
  })
  say(`queen: ${queen}`)
  let issue = null
  if (ev.red) {
    issue = await fileIssue(cfg, deps, {
      ...ev.issue,
      comment: `Still broken at ${ev.when}.\n\n\`\`\`\n${ev.result.lines
        .map(l => `${l.mark.padEnd(4)}  ${l.text}`)
        .join('\n')}\n\`\`\`${ev.noteEn ? `\n\n${ev.noteEn}` : ''}`,
    })
    say(`github: ${issue.said}`)
  }
  const tg = await tellOwner(
    cfg,
    deps,
    ev.telegram + (issue?.url ? `\n${issue.url}` : '')
  )
  say(`telegram: ${tg}`)
}

// --- the run: two watches, one state file -------------------------------

/** The worse of two exit codes: broken (1) over not measured (2) over ok (0). */
export const worst = (a, b) =>
  a === 1 || b === 1 ? 1 : a === 2 || b === 2 ? 2 : 0

export async function run(cfg, deps) {
  const log = line => deps.write(redact(line, secretsOf(cfg)) + '\n')
  const show = result => {
    for (const l of result.lines) log(`  ${l.mark.padEnd(4)}  ${l.text}`)
  }
  const st = await loadState(cfg.stateDir)
  const now = deps.now()
  const when = new Date(now * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
  /* true when the state reached the volume. */
  const persist = async () => {
    try {
      await saveState(cfg.stateDir, st)
      return true
    } catch (e) {
      log(
        `queen-watch: could not save state in ${cfg.stateDir} (${e && e.code}) -- the next run is a first run`
      )
      return false
    }
  }
  const ctx = { log, show, st, now, when, persist }
  /* Kept apart: a watch that crashes is that watch's "not measured", and the
   * other still runs and still reports. */
  const apart = async (name, watch) => {
    try {
      return await watch(cfg, deps, ctx)
    } catch (e) {
      log(`queen-watch: ${name} crashed: ${e && e.stack}`)
      return 2
    }
  }
  const relays = await apart('the relays watch', watchRelays)
  if (!cfg.pageUrl) return relays
  return worst(relays, await apart('the page watch', watchPage))
}

// --- the relays watch (relays-watch.sh run) -----------------------------

async function watchRelays(cfg, deps, { log, show, st, now, when, persist }) {
  log(
    `queen-watch: bot -> render (${cfg.base}), previous: ${st.first ? 'none (first run)' : st.state}`
  )

  let result = await probe(cfg, deps)
  if (result.rc === 2) {
    show(result)
    log(`queen-watch: not measured, one retry in ${cfg.retryWaitS}s`)
    await deps.sleep(cfg.retryWaitS)
    result = await probe(cfg, deps)
  }
  show(result)

  if (result.rc === 2) {
    st.unmeasured = (st.unmeasured || 0) + 1
    log(`queen-watch: not measured (${st.unmeasured} in a row)`)
    const why = result.lines
      .filter(l => l.mark === '??')
      .map(l => `- ${l.text}`)
    if (st.unmeasured === 3 || st.first) {
      await report(cfg, deps, log, {
        red: false,
        needsYou: true,
        headline: `the bot -> render roads could not be measured (${st.unmeasured} run(s) in a row)`,
        body: why.join('\n'),
        telegram: [
          `⚠️ Проверка дорог бот → render на Railway не может измерить (${st.unmeasured} раз подряд).`, // cyrillic-ok
          'Ничего не чинил: не знаю, что сломано.', // cyrillic-ok
          ...why,
        ].join('\n'),
      })
    }
    if (st.first) st.state = 'unmeasured'
    st.first = false
    await persist()
    return 2
  }
  st.unmeasured = 0

  let note = null
  if (result.rc !== 0) {
    if (kindOf(result) === 'down') {
      log(
        `queen-watch: the render did not answer -- waiting ${cfg.swapWaitS}s for a deploy swap`
      )
      await deps.sleep(cfg.swapWaitS)
      result = await probe(cfg, deps)
      show(result)
      if (result.rc === 0)
        log(
          `queen-watch: down for one probe, back after ${cfg.swapWaitS}s (a deploy swap)`
        )
    }
    if (result.rc !== 0 && kindOf(result) === 'down') {
      if (now - (st.healed_at || 0) >= cfg.healEveryS) {
        st.healed_at = now
        /* FAIL SAFE: the once-per-HEAL_EVERY_S bound lives only in the state
         * file. If it cannot be saved, the next run forgets this restart, and
         * a lasting outage would become an hourly restart -- so no restart. */
        if (!(await persist())) {
          log('queen-watch: state not persisted -- heal skipped')
          note = NOTE.unsaved
        } else if (await deps.restartRender(cfg)) {
          log(
            `queen-watch: restarted vibee-render, probing again in ${cfg.healWaitS}s`
          )
          await deps.sleep(cfg.healWaitS)
          result = await probe(cfg, deps)
          show(result)
          note = result.rc === 0 ? NOTE.healed : NOTE.notHelped
        } else {
          note = NOTE.refused
        }
      } else {
        note = NOTE.tooSoon
      }
    }
  }

  if (result.rc === 0) {
    const was = st.state
    if (was === 'broken' || note || st.first) {
      const first = st.first && was !== 'broken'
      await report(cfg, deps, log, {
        red: false,
        needsYou: false,
        headline: first
          ? 'live on Railway: every bot -> render road answers'
          : 'the bot -> render roads work again',
        body: [note?.en, ...result.lines.map(l => `${l.mark}  ${l.text}`)]
          .filter(Boolean)
          .join('\n'),
        telegram: first
          ? '✅ Сторож дорог бот → render теперь работает на Railway, каждый час. Сейчас все дороги отвечают.' // cyrillic-ok
          : [
              '✅ Дороги бот → render снова работают: кнопки «Разрешить» и карточки встреч доходят.', // cyrillic-ok
              note?.ru,
            ]
              .filter(Boolean)
              .join('\n'),
      })
    }
    st.state = 'ok'
    st.first = false
    await persist()
    log('queen-watch: ok -- every road answers')
    return 0
  }

  const kind = kindOf(result)
  const ruTail =
    note?.ru ??
    (kind === 'person'
      ? 'Сам не чиню: это ключ или код, а не упавший сервис. Строка FAIL выше говорит, что именно; задача для пчёл — в issue.' // cyrillic-ok
      : null)
  const enTail =
    note?.en ??
    (kind === 'person'
      ? 'Not healed: this is a key or code, not a fallen service. Secrets wait for the owner.'
      : null)
  if (st.state !== 'broken' || note || now - (st.told_at || 0) >= cfg.repeatS) {
    await report(cfg, deps, log, {
      red: true,
      needsYou: true,
      result,
      when,
      noteEn: enTail,
      issue: {
        title: RELAYS_ISSUE_TITLE,
        body: issueSpec({ result, note: enTail, when }),
        owns: i => i.title !== PAGE_ISSUE_TITLE,
      },
      headline: `a bot -> render road is broken (${result.lines.find(l => l.mark === 'FAIL')?.text.split(':')[0] || 'see body'})`,
      body: [...fails(result), enTail].filter(Boolean).join('\n'),
      telegram: [
        '🔴 Кнопки бота не доходят до render — человек видит «Не смог передать ответ».', // cyrillic-ok
        ...fails(result),
        ruTail,
      ]
        .filter(Boolean)
        .join('\n'),
    })
    st.told_at = now
  } else {
    log('queen-watch: still broken, already reported -- quiet until REPEAT_S')
  }
  st.state = 'broken'
  st.first = false
  await persist()
  log('queen-watch: broken -- a road does not answer (see FAIL)')
  return result.rc
}

// --- the page watch (probeBrowserPage) ----------------------------------

/*
 * The relays watch's rules, minus the heal: report on the first run, on a
 * change, and again every REPEAT_S while broken; three not-measured runs in a
 * row ask for a person, one does not. Its state is `st.page`, and nothing
 * here reads or writes the relays' keys.
 */
async function watchPage(cfg, deps, { log, show, st, now, when, persist }) {
  const say = s => log(`queen-watch: page: ${s}`)
  const first = !st.page
  const pg = (st.page = {
    state: 'unknown',
    unmeasured: 0,
    told_at: 0,
    ...st.page,
  })
  say(`${cfg.pageUrl}, previous: ${first ? 'none (first run)' : pg.state}`)

  let result = await probeBrowserPage(cfg, deps)
  if (result.rc === 2) {
    show(result)
    say(`not measured, one retry in ${cfg.retryWaitS}s`)
    await deps.sleep(cfg.retryWaitS)
    result = await probeBrowserPage(cfg, deps)
  } else if (result.rc === 1) {
    /* A deploy swaps the index and its files: one look in the middle of a
     * swap can see an index naming files the answering container lacks. */
    show(result)
    say(`broken, one more look in ${cfg.swapWaitS}s (a deploy swap passes)`)
    await deps.sleep(cfg.swapWaitS)
    result = await probeBrowserPage(cfg, deps)
  }
  show(result)

  if (result.rc === 2) {
    pg.unmeasured += 1
    say(`not measured (${pg.unmeasured} in a row)`)
    const why = result.lines
      .filter(l => l.mark === '??')
      .map(l => `- ${l.text}`)
    if (pg.unmeasured === 3 || first) {
      await report(cfg, deps, log, {
        watch: 'page',
        red: false,
        needsYou: true,
        headline: `the BROWSER page could not be measured (${pg.unmeasured} run(s) in a row)`,
        body: [cfg.pageUrl, ...why].join('\n'),
        telegram: [
          `⚠️ Сторож страницы BROWSER на Railway не может её измерить (${pg.unmeasured} раз подряд): ответа не было вовсе.`, // cyrillic-ok
          'Это не значит, что она сломана; ничего не чинил.', // cyrillic-ok
          ...why,
        ].join('\n'),
      })
    }
    if (first) pg.state = 'unmeasured'
    await persist()
    return 2
  }
  pg.unmeasured = 0

  if (result.rc === 0) {
    if (pg.state === 'broken' || first) {
      await report(cfg, deps, log, {
        watch: 'page',
        red: false,
        needsYou: false,
        headline: first
          ? 'live on Railway: the BROWSER page watch -- the page, the board and every asset answer'
          : 'the BROWSER page works again',
        body: [
          cfg.pageUrl,
          ...result.lines.map(l => `${l.mark}  ${l.text}`),
        ].join('\n'),
        telegram: first
          ? '✅ Сторож страницы BROWSER теперь работает на Railway, каждый час. Сейчас страница, доска Королевы и все их файлы отвечают.' // cyrillic-ok
          : '✅ Страница BROWSER снова открывается: страница, доска Королевы и все их файлы отвечают.', // cyrillic-ok
      })
    }
    pg.state = 'ok'
    await persist()
    say('ok -- the page, the board and every asset answer')
    return 0
  }

  const enTail =
    'Not healed: a static page has nothing to restart. The fix is a build or a deploy -- the app image (apps/vibee-editor), or gHashTag/trinity apps/website and then QUEEN_REF.'
  const ruTail =
    'Сам не чиню: у статической страницы нечего перезапускать. Чинит сборка или деплой: образ apps/vibee-editor, либо trinity apps/website и затем QUEEN_REF. Задача для пчёл — в issue.' // cyrillic-ok
  if (pg.state !== 'broken' || now - (pg.told_at || 0) >= cfg.repeatS) {
    await report(cfg, deps, log, {
      watch: 'page',
      red: true,
      needsYou: true,
      result,
      when,
      noteEn: enTail,
      issue: {
        title: PAGE_ISSUE_TITLE,
        body: pageIssueSpec({ result, note: enTail, when, url: cfg.pageUrl }),
        owns: i => i.title === PAGE_ISSUE_TITLE,
      },
      headline: `the BROWSER page is broken (${result.lines.find(l => l.mark === 'FAIL')?.text.split(':')[0] || 'see body'})`,
      body: [cfg.pageUrl, ...fails(result), enTail].join('\n'),
      telegram: [
        '🔴 Страница BROWSER на app.t27.ai открывается не целиком — человек видит пустую или недорисованную страницу.', // cyrillic-ok
        ...fails(result),
        ruTail,
      ].join('\n'),
    })
    pg.told_at = now
  } else {
    say('still broken, already reported -- quiet until REPEAT_S')
  }
  pg.state = 'broken'
  await persist()
  say('broken -- the page or a file it names does not answer (see FAIL)')
  return 1
}

export function realDeps() {
  return {
    fetch: globalThis.fetch,
    sleep: s => new Promise(r => setTimeout(r, s * 1000)),
    now: () => Math.floor(Date.now() / 1000),
    write: s => process.stdout.write(s),
    randomHex: n => randomBytes(n).toString('hex'),
    restartRender: null,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const cfg = config()
  const deps = realDeps()
  deps.restartRender = c => restartRender(c, deps)
  if (!process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.STATE_DIR) {
    process.stdout.write(
      'queen-watch: no volume mounted -- every run will look like a first run\n'
    )
  }
  /* igla.mjs, then release.mjs, after both watches, whatever they said; each
   * one's rc is logged only, and one crashing never skips the other. */
  const after = async (name, file, fn) => {
    try {
      const mod = await import(file)
      process.stdout.write(`${name}: rc ${await mod[fn](cfg, deps)}\n`)
    } catch (e) {
      process.stdout.write(
        redact(`${name}: crashed: ${e && e.stack}`, secretsOf(cfg)) + '\n'
      )
    }
  }
  const tail = async () => {
    await after('igla-loop', './igla.mjs', 'runIgla')
    await after('board-release', './release.mjs', 'runRelease')
  }
  run(cfg, deps).then(
    async rc => {
      await tail()
      process.exit(rc)
    },
    async e => {
      process.stdout.write(
        redact(`queen-watch: crashed: ${e && e.stack}`, secretsOf(cfg)) + '\n'
      )
      await tail()
      process.exit(2)
    }
  )
}
