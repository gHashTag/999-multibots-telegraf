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
 * Railway runs this as a CRON service (`0 * * * *`): it runs once and exits.
 * Exit code = the probe: 0 every road answers, 1 a road is broken, 2 not
 * measured. A cron container has no memory, so the previous result lives in
 * a JSON file on a small Railway volume (STATE_DIR, /data). A volume and not
 * a Postgres row because the service has no npm dependencies, and node has no
 * Postgres client built in; a file is the whole of what this needs.
 *
 * Secrets: every value arrives as a Railway REFERENCE variable and is never
 * printed. Keys are compared by sha256 and only the first 8 hex characters of
 * a hash are ever shown; every output line is scrubbed of every secret value
 * besides, so a future message that quotes a response cannot leak one.
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
 *   RAILWAY_ENVIRONMENT_ID is given to every Railway service.
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const OWNER_CHAT = '144022504'
export const RAILWAY_API = 'https://backboard.railway.com/graphql/v2'
const TELEGRAM_API = 'https://api.telegram.org'
const GITHUB_API = 'https://api.github.com'
const LABEL = 'queen-watch'

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
    ownerChat: env.OWNER_CHAT || OWNER_CHAT,
    ghToken: env.GITHUB_TOKEN || '',
    ghRepo: env.GITHUB_REPO || 'gHashTag/999-multibots-telegraf',
    stateDir: env.STATE_DIR || '/data',
    /* relays-watch.sh's own numbers. */
    healEveryS: n(env.HEAL_EVERY_S, 21600),
    repeatS: n(env.REPEAT_S, 21600),
    retryWaitS: n(env.RETRY_WAIT_S, 60),
    swapWaitS: n(env.SWAP_WAIT_S, 90),
    healWaitS: n(env.HEAL_WAIT_S, 240),
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
  ].filter(s => typeof s === 'string' && s.length >= 6)
}

export function redact(text, secrets) {
  let out = String(text)
  for (const s of secrets) out = out.split(s).join('[redacted]')
  return out
}

export const hash8 = v =>
  createHash('sha256').update(v).digest('hex').slice(0, 8)
const same = (a, b) =>
  createHash('sha256').update(a).digest('hex') ===
  createHash('sha256').update(b).digest('hex')

/** One HTTP call; a road that does not answer is status 0 (curl's 000). */
async function call(deps, url, init = {}, timeoutMs = 15000) {
  try {
    const res = await deps.fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
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
  let r = await call(deps, approveUrl, {
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
  r = await call(deps, approveUrl, {
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
  tooSoon: {
    ru: 'Перезапуск render уже был меньше 6 ч назад — второй раз сам не делаю.', // cyrillic-ok
    en: 'The render was already restarted less than 6 h ago; not doing it twice unattended.',
  },
}

// --- report: the Queen, the owner's DM, one GitHub issue ----------------

export async function reportToQueen(cfg, deps, { headline, body, needsYou }) {
  if (!cfg.queenToken) return 'no TRIOS_API_TOKEN -- not sent'
  const r = await call(deps, `${cfg.queenUrl}/queen/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.queenToken}`,
    },
    /* Exactly these four fields: the route answers 400 to any other. It
     * stores the headline as "[source] headline" and the needs-you panel
     * shows 200 characters, so ours stays at 120. */
    body: JSON.stringify({
      source: 'queen-watch',
      headline: headline.slice(0, 120),
      body: String(body || '').slice(0, 8000),
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
  const r = await call(deps, `${TELEGRAM_API}/bot${cfg.tgToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.ownerChat, text: text.slice(0, 4000) }),
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

async function gh(cfg, deps, path, init = {}) {
  const r = await call(deps, `${GITHUB_API}${path}`, {
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

/** One open `queen-watch` issue at a time: comment on it, or open it. */
export async function fileIssue(cfg, deps, { title, body, comment }) {
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
  const mine = open.body.filter(i => !i.pull_request)
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

async function report(cfg, deps, log, ev) {
  const queen = await reportToQueen(cfg, deps, {
    headline: ev.headline,
    body: ev.body,
    needsYou: ev.needsYou,
  })
  log(`queen-watch: queen: ${queen}`)
  let issue = null
  if (ev.red) {
    issue = await fileIssue(cfg, deps, {
      title: `queen-watch: a bot -> render road is broken`,
      body: issueSpec({ result: ev.result, note: ev.noteEn, when: ev.when }),
      comment: `Still broken at ${ev.when}.\n\n\`\`\`\n${ev.result.lines
        .map(l => `${l.mark.padEnd(4)}  ${l.text}`)
        .join('\n')}\n\`\`\`${ev.noteEn ? `\n\n${ev.noteEn}` : ''}`,
    })
    log(`queen-watch: github: ${issue.said}`)
  }
  const tg = await tellOwner(
    cfg,
    deps,
    ev.telegram + (issue?.url ? `\n${issue.url}` : '')
  )
  log(`queen-watch: telegram: ${tg}`)
}

// --- the watch (relays-watch.sh run) ------------------------------------

export async function run(cfg, deps) {
  const log = line => deps.write(redact(line, secretsOf(cfg)) + '\n')
  const show = result => {
    for (const l of result.lines) log(`  ${l.mark.padEnd(4)}  ${l.text}`)
  }
  const st = await loadState(cfg.stateDir)
  const now = deps.now()
  const when = new Date(now * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
  const persist = async () => {
    try {
      await saveState(cfg.stateDir, st)
    } catch (e) {
      log(
        `queen-watch: could not save state in ${cfg.stateDir} (${e && e.code}) -- the next run is a first run`
      )
    }
  }
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
        await persist()
        if (await deps.restartRender(cfg)) {
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
  run(cfg, deps).then(
    rc => process.exit(rc),
    e => {
      process.stdout.write(
        redact(`queen-watch: crashed: ${e && e.stack}`, secretsOf(cfg)) + '\n'
      )
      process.exit(2)
    }
  )
}
