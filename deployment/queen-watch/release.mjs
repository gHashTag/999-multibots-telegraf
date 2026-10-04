/**
 * BOARD RELEASE: QUEEN_REF FOLLOWS TRINITY, ON THE QUEEN'S HOURLY CRON.
 *
 * The board lives in gHashTag/trinity and is baked into the vibee-editor image
 * at a pinned commit (apps/vibee-editor/Dockerfile, ARG QUEEN_REF). The pin is
 * right; remembering to move it was the failure (measured 2026-09-23: three
 * merges sat on top of the pin, the ROADMAP view among them, believed shipped
 * and not on the site). .github/workflows/queen-ref-bump.yml opened the bump
 * pull request every six hours -- and has run no step since 2026-10-03:
 * every workflow in this private repository is refused before its first step
 * while its Actions billing is exhausted. Owner, 2026-10-04: off GitHub
 * Actions, onto Railway, through the Queen.
 *
 * This is a PORT of that workflow, not a new design; read it first. The same
 * pin (the first line `ARG QUEEN_REF=<40 hex>` of the Dockerfile on main), the
 * same head (gHashTag/trinity main), the same branch `release/board-<h7>`, the
 * same commit message, the same pull request title and body (the commit list,
 * at most the last 40 lines, and "Merging is deliberately left to a person").
 * The container has no git, so the one-line change goes through the GitHub
 * API: create the branch at main, PUT the file, open the pull request. Where
 * the port differs, it says so:
 *   - a pull request check that GitHub does not answer stops the run (the
 *     workflow's pipeline read a failed check as "none open" and went on);
 *   - the API write is three calls where `git push` was one, so a branch this
 *     port left half-written (created, file not moved, or moved and no pull
 *     request) is finished by the next run. A branch whose pull request a
 *     person CLOSED is not reopened: that is an anomaly, and theirs to undo.
 *
 * gHashTag/trinity `.github/workflows/board-release.yml` opens the same pull
 * request from the trinity side (it runs there: that repository is public).
 * Both look for an open pull request for the head first, so they do not open
 * two; a race that loses on the branch or the pull request reads the winner's
 * and is quiet.
 *
 * Cadence: once per UTC six-hour slot (00, 06, 12, 18), the first hourly run
 * in it; its own state in STATE_DIR/release.json (never state.json).
 *
 * TOKENS. The repository it writes to is THIS file's constant, never a
 * variable. It writes only with RELEASE_GITHUB_TOKEN, never with the TRIOS
 * GITHUB_TOKEN (that one may read, nothing more), and a RELEASE_GITHUB_TOKEN
 * that IS the GITHUB_TOKEN is not used to write. With no token at all nothing
 * is read and the run says "not measured".
 *
 * Codes:
 *   PIN       the Dockerfile on main has no `ARG QUEEN_REF=<40 hex>` line
 *   UNWRITTEN the board is behind trinity, no release pull request is open,
 *             and there is no RELEASE_GITHUB_TOKEN to open one
 *   WRITE     the branch, the file or the pull request was refused (or a
 *             person closed this head's release pull request)
 * Reports: POST /queen/report as source `board-release` on the first run, when
 * the state changes, when a pull request is opened, and every REPEAT_S while
 * something needs the owner; the owner's DM only on the first run and when the
 * set of codes changes (as igla.mjs). Exit code (logged only): 0 ok, 1 an
 * anomaly, 2 not measured.
 *
 * Variables -- optional, never printed (watch.mjs secretsOf() scrubs them):
 *   BOARD_RELEASE         '0' turns this off
 *   RELEASE_GITHUB_TOKEN  fine-grained, gHashTag/999-multibots-telegraf only:
 *                         Contents read+write, Pull requests read+write
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { call, redact, reportToQueen, secretsOf, tellOwner } from './watch.mjs'

export const RELEASE_REPO = 'gHashTag/999-multibots-telegraf'
export const BOARD_REPO = 'gHashTag/trinity'
export const DOCKERFILE = 'apps/vibee-editor/Dockerfile'
const BASE = 'main'
const OWNER = RELEASE_REPO.split('/')[0]
const SOURCE = 'board-release'
const GITHUB_API = 'https://api.github.com'
const UA = 'queen-watch-release'
export const EVERY_S = 6 * 3600
/* queen-ref-bump.yml: sed -n 's/^ARG QUEEN_REF=\([0-9a-f]\{40\}\)$/\1/p' */
const PIN = /^ARG QUEEN_REF=([0-9a-f]{40})$/
const SHA = /^[0-9a-f]{40}$/
const NO_COMPARE = '- (the comparison could not be read)'

const parse = text => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
const short = s => String(s || '').slice(0, 7)

// --- the workflow's words ----------------------------------------------------

/** The first `ARG QUEEN_REF=<40 hex>` line's commit id, or null. */
export function readPin(text) {
  for (const line of String(text).split('\n')) {
    const m = PIN.exec(line)
    if (m) return m[1]
  }
  return null
}

/** sed "s/^ARG QUEEN_REF=$PINNED$/ARG QUEEN_REF=$HEAD_SHA/": every such line. */
export function bump(text, pinned, head) {
  return String(text)
    .split('\n')
    .map(l => (l === `ARG QUEEN_REF=${pinned}` ? `ARG QUEEN_REF=${head}` : l))
    .join('\n')
}

/** `- <sha7> <first line>` per commit, the last 40 (`| tail -40`). */
export function brings(commits) {
  if (!Array.isArray(commits)) return [NO_COMPARE]
  return commits
    .map(
      c =>
        `- ${short(c?.sha)} ${String(c?.commit?.message || '').split('\n')[0]}`
    )
    .slice(-40)
}

export const prTitle = head => `release(board): ship trinity ${short(head)}`

/* git commit -m ... -m ... -m ...: three paragraphs. */
export const commitMessage = (pinned, head, count) =>
  [
    prTitle(head),
    `The board is pinned by commit id, so a merge in ${BOARD_REPO} ships nothing until this line moves. It was ${count} commit(s) behind.`,
    `QUEEN_REF ${short(pinned)} -> ${short(head)}`,
  ].join('\n\n')

export function prBody(pinned, head, lines) {
  return [
    `The board on app.t27.ai is pinned to a commit of ${BOARD_REPO}, so a merge there ships nothing until this line moves. It was **${lines.length} commit(s)** behind.`,
    '',
    `\`QUEEN_REF\` \`${short(pinned)}\` → \`${short(head)}\``,
    '',
    '## What this ships',
    ...lines,
    '',
    'Opened by `deployment/queen-watch/release.mjs` (the queen-watch cron on Railway), because every workflow in this repository fails before its first step while its Actions billing is exhausted. Merging is deliberately left to a person: this is the release.',
    '',
  ].join('\n')
}

// --- GitHub -------------------------------------------------------------------

async function github(cfg, deps, token, path, init = {}, timeoutMs) {
  const r = await call(
    cfg,
    deps,
    `${GITHUB_API}${path}`,
    {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': UA,
      },
    },
    timeoutMs
  )
  return { status: r.status, body: parse(r.text), error: r.error }
}

/** Why a write did not land, in words that blame the token only on auth. */
function refused(what, r) {
  return (
    `WRITE ${what} ` +
    ([401, 403, 404].includes(r.status)
      ? `refused (HTTP ${r.status}): RELEASE_GITHUB_TOKEN needs Contents and Pull requests read+write on ${RELEASE_REPO}`
      : r.status === 0
        ? `not sent: GitHub did not answer (${r.error || 'Error'})`
        : `not accepted: GitHub answered HTTP ${r.status}${r.body?.message ? ` (${String(r.body.message).slice(0, 120)})` : ''}`)
  )
}

/** The tokens: `write` only ever RELEASE_GITHUB_TOKEN, and never the TRIOS one. */
export function tokensOf(cfg) {
  const own = cfg.releaseGhToken || ''
  const write = own && own !== cfg.ghToken ? own : ''
  return { write, read: write || cfg.ghToken || '', same: !!own && !write }
}

/** The pin and the head, or { blind } / { anom } saying why not. */
async function measure(cfg, deps, read) {
  const name = cfg.releaseGhToken ? 'RELEASE_GITHUB_TOKEN' : 'GITHUB_TOKEN'
  const base = await github(
    cfg,
    deps,
    read,
    `/repos/${RELEASE_REPO}/git/ref/heads/${BASE}`
  )
  const baseSha = base.body?.object?.sha
  if (base.status !== 200 || !SHA.test(baseSha || ''))
    return {
      blind: `${RELEASE_REPO} ${BASE} not read (HTTP ${base.status}): ${name} does not reach it`,
    }
  const f = await github(
    cfg,
    deps,
    read,
    `/repos/${RELEASE_REPO}/contents/${DOCKERFILE}?ref=${baseSha}`
  )
  if (f.status !== 200 || typeof f.body?.content !== 'string')
    return { blind: `${DOCKERFILE} not read (HTTP ${f.status})` }
  const text = Buffer.from(f.body.content, 'base64').toString('utf8')
  const pinned = readPin(text)
  if (!pinned)
    return {
      anom: `PIN no \`ARG QUEEN_REF=<40 hex>\` line in ${DOCKERFILE} on ${BASE}: the board cannot be released`,
    }
  const h = await github(
    cfg,
    deps,
    read,
    `/repos/${BOARD_REPO}/git/ref/heads/main`
  )
  const head = h.body?.object?.sha
  if (h.status !== 200 || !SHA.test(head || ''))
    return { blind: `${BOARD_REPO} main not read (HTTP ${h.status})` }
  return { baseSha, file: { text, sha: f.body.sha }, pinned, head }
}

/** Open and closed pull requests for `branch`, or null when not answered. */
async function pullsFor(cfg, deps, token, branch) {
  const r = await github(
    cfg,
    deps,
    token,
    `/repos/${RELEASE_REPO}/pulls?state=all&per_page=100&head=${encodeURIComponent(`${OWNER}:${branch}`)}`
  )
  if (r.status !== 200 || !Array.isArray(r.body)) return null
  return {
    open: r.body.filter(p => p.state === 'open'),
    closed: r.body.filter(p => p.state === 'closed' && !p.merged_at),
  }
}

/**
 * Branch, file, pull request. Returns { opened } or { open } (a race the
 * other clock won) or { anom }.
 */
async function write(cfg, deps, token, m, lines) {
  const { pinned, head } = m
  const branch = `release/board-${short(head)}`
  const ref = await github(
    cfg,
    deps,
    token,
    `/repos/${RELEASE_REPO}/git/refs`,
    {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: m.baseSha }),
    }
  )
  let file = m.file
  if (ref.status === 422) {
    /* The branch exists: half-written by an earlier run, the other clock in
     * the middle of its own write, or a release a person closed. */
    const f = await github(
      cfg,
      deps,
      token,
      `/repos/${RELEASE_REPO}/contents/${DOCKERFILE}?ref=${encodeURIComponent(branch)}`
    )
    const text =
      f.status === 200 && typeof f.body?.content === 'string'
        ? Buffer.from(f.body.content, 'base64').toString('utf8')
        : null
    const pin = text === null ? null : readPin(text)
    if (pin === head) {
      const prs = await pullsFor(cfg, deps, token, branch)
      if (!prs)
        return {
          anom: `WRITE ${branch} exists and its pull requests were not read: not written`,
        }
      if (prs.open.length) return { open: prs.open[0] }
      if (prs.closed.length)
        return {
          anom: `WRITE ${branch} exists and its pull request #${prs.closed[0].number} was closed unmerged: not reopened (delete the branch to release ${short(head)} again)`,
        }
      file = null
    } else if (pin === pinned) {
      file = { text, sha: f.body.sha }
    } else {
      return {
        anom: `WRITE ${branch} exists ${pin ? `pinned at ${short(pin)}` : `without a readable pin (HTTP ${f.status})`}: not written`,
      }
    }
  } else if (ref.status !== 201) {
    return { anom: refused(`branch ${branch}`, ref) }
  }
  if (file) {
    const put = await github(
      cfg,
      deps,
      token,
      `/repos/${RELEASE_REPO}/contents/${DOCKERFILE}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          message: commitMessage(pinned, head, lines.length),
          content: Buffer.from(bump(file.text, pinned, head), 'utf8').toString(
            'base64'
          ),
          sha: file.sha,
          branch,
        }),
      }
    )
    if (put.status !== 200 && put.status !== 201)
      return { anom: refused(`${DOCKERFILE} on ${branch}`, put) }
  }
  const pr = await github(cfg, deps, token, `/repos/${RELEASE_REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: prTitle(head),
      head: branch,
      base: BASE,
      body: prBody(pinned, head, lines),
    }),
  })
  if (pr.status === 201 && pr.body?.number) return { opened: pr.body }
  if (pr.status === 422) {
    const prs = await pullsFor(cfg, deps, token, branch)
    if (prs?.open.length) return { open: prs.open[0] }
  }
  return { anom: refused(`pull request for ${branch}`, pr) }
}

// --- state ----------------------------------------------------------------------

/* What changed, not by how much: commit ids and counts drift. */
const keyOf = (state, anom, blind) =>
  JSON.stringify([
    state,
    ...[...anom, ...blind]
      .map(l => l.replace(/\b[0-9a-f]{7,40}\b/g, 'SHA').replace(/\d+/g, '#'))
      .sort(),
  ])

export async function loadRelease(dir) {
  try {
    return {
      first: false,
      ...JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')),
    }
  } catch {
    return { first: true, slot: -1, key: '', codes: '', told_at: 0 }
  }
}

async function saveRelease(dir, st) {
  const { first, ...keep } = st
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, 'release.json.tmp')
  await writeFile(tmp, JSON.stringify(keep, null, 2))
  await rename(tmp, join(dir, 'release.json'))
}

// --- the run ----------------------------------------------------------------------

export async function runRelease(cfg, deps) {
  const log = line => deps.write(redact(line, secretsOf(cfg)) + '\n')
  if (!cfg.releaseOn) {
    log('board-release: off (BOARD_RELEASE=0)')
    return 0
  }
  const st = await loadRelease(cfg.stateDir)
  const nowS = deps.now()
  const iso = s => new Date(s * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
  const slot = Math.floor(nowS / EVERY_S)
  const next = iso((slot + 1) * EVERY_S)
  if (!st.first && st.slot === slot) {
    log(`board-release: not due (every 6 h; next slot ${next})`)
    return 0
  }
  st.slot = slot

  const anom = []
  const blind = []
  const facts = []
  let state = 'blind'
  let opened = null
  let head = ''
  const tokens = tokensOf(cfg)
  if (tokens.same)
    blind.push(
      'RELEASE_GITHUB_TOKEN is the TRIOS GITHUB_TOKEN: it reads here, it never writes'
    )
  if (!tokens.read) {
    blind.push(
      `no RELEASE_GITHUB_TOKEN or GITHUB_TOKEN on queen-watch: the pin and ${BOARD_REPO} not read, nothing written`
    )
  } else {
    const m = await measure(cfg, deps, tokens.read)
    if (m.blind) blind.push(m.blind)
    else if (m.anom) {
      anom.push(m.anom)
      state = 'pin'
    } else {
      head = m.head
      facts.push(
        `- pin: QUEEN_REF ${short(m.pinned)} (${RELEASE_REPO} ${DOCKERFILE}, ${BASE} ${short(m.baseSha)})`,
        `- ${BOARD_REPO} main: ${short(m.head)}`
      )
      if (m.pinned === m.head) {
        state = 'current'
        facts.push(`- the board is current at ${short(m.pinned)}`)
      } else {
        const c = await github(
          cfg,
          deps,
          tokens.read,
          `/repos/${BOARD_REPO}/compare/${m.pinned}...${m.head}`,
          {},
          30000
        )
        const lines = brings(c.status === 200 ? c.body?.commits : null)
        const branch = `release/board-${short(m.head)}`
        const prs = await pullsFor(cfg, deps, tokens.read, branch)
        facts.push(`- behind: ${lines.length} commit(s); branch ${branch}`)
        if (!prs) {
          blind.push(
            `open pull requests for ${branch} not read: nothing written (a failed check is not "none open")`
          )
        } else if (prs.open.length) {
          state = 'open'
          facts.push(
            `- a pull request for ${short(m.head)} is already open: #${prs.open[0].number}`
          )
        } else if (!tokens.write) {
          state = 'behind'
          anom.push(
            `UNWRITTEN the board is ${lines.length} commit(s) behind ${BOARD_REPO} (${short(m.pinned)} -> ${short(m.head)}) and no release pull request is open: no RELEASE_GITHUB_TOKEN on queen-watch to open one`
          )
        } else {
          const w = await write(cfg, deps, tokens.write, m, lines)
          if (w.anom) {
            state = 'behind'
            anom.push(w.anom)
          } else if (w.open) {
            state = 'open'
            facts.push(
              `- a pull request for ${short(m.head)} is already open: #${w.open.number}`
            )
          } else {
            state = 'opened'
            opened = w.opened
            facts.push(
              `- opened #${opened.number}: ${opened.html_url || prTitle(m.head)}`
            )
          }
        }
      }
    }
  }
  facts.push(`- next check: ${next}`)

  const when = iso(nowS)
  const body = [
    `QUEEN_REF follows ${BOARD_REPO}, checked by queen-watch at ${when}`,
    `Anomalies:${anom.length ? '' : ' none'}`,
    ...anom.map(a => `- ${a}`),
    `Not measured:${blind.length ? '' : ' nothing'}`,
    ...blind.map(b => `- ${b}`),
    ...facts,
  ].join('\n')
  for (const line of body.split('\n').slice(1)) log(`  ${line}`)

  const codes = [...new Set(anom.map(a => a.split(' ')[0]))]
  const codesKey = codes.join(',')
  const needsYou = !!opened || anom.length > 0 || blind.length > 0
  const key = keyOf(state, anom, blind)
  if (
    st.first ||
    key !== st.key ||
    opened ||
    (needsYou && nowS - (st.told_at || 0) >= cfg.repeatS)
  ) {
    const headline = opened
      ? `board release: opened #${opened.number} -- ${prTitle(head)}`
      : codes.length
        ? `board release: ${codes.join(', ')}`
        : `board release: ${state}${blind.length ? `, ${blind.length} not measured` : ''}`
    log(
      `board-release: queen: ${await reportToQueen(cfg, deps, { source: SOURCE, headline, body, needsYou })}`
    )
    st.told_at = nowS
    if (st.first || codesKey !== (st.codes || '')) {
      const tg = [
        st.first
          ? '👁 Королева теперь каждые 6 ч сверяет QUEEN_REF доски с trinity и открывает PR релиза (queen-watch, Railway).' // cyrillic-ok
          : codes.length
            ? `⚠️ Релиз доски: ${codes.join(', ')}.` // cyrillic-ok
            : '✅ Релиз доски: аномалий нет.', // cyrillic-ok
        ...anom.map(a => `- ${a}`),
        blind.length
          ? `Не измеряю (${blind.length}): список в отчёте королевы.` // cyrillic-ok
          : null,
      ]
        .filter(Boolean)
        .join('\n')
      log(`board-release: telegram: ${await tellOwner(cfg, deps, tg)}`)
    }
  } else {
    log('board-release: unchanged, already reported -- quiet until REPEAT_S')
  }
  st.key = key
  st.codes = codesKey
  st.first = false
  try {
    await saveRelease(cfg.stateDir, st)
  } catch (e) {
    log(`board-release: could not save state (${e && e.code})`)
  }
  log(
    `board-release: ${anom.length ? `anomalies: ${codesKey}` : blind.length ? 'not measured' : state}`
  )
  return anom.length ? 1 : blind.length ? 2 : 0
}
