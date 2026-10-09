/**
 * CI FOR PULL REQUESTS ON RAILWAY, NOT ON GITHUB ACTIONS.
 *
 * Owner, 2026-10-09: "fix CI/CD", then "I have no money, find another way",
 * then "we have Railway, do it there". Measured that day: no GitHub Actions
 * job in this repository has started since June -- "recent account payments
 * have failed or your spending limit needs to be increased" -- so every PR
 * showed red checks that never ran, and the only real gates were the local
 * hooks. The check-runner service (deployment/check-runner) already runs
 * those gates on Railway for `tri remote-check`; what was missing is the
 * road from GitHub to it.
 *
 * This is that road. Every POLL_S seconds:
 *   1. list the open pull requests whose head lives in this repository
 *      (a fork's code is never run here: it would run inside our project's
 *      private network);
 *   2. skip a head commit that already carries a `railway/checks` status,
 *      unless that status is a `pending` older than STALE_MIN (a run this
 *      service lost to a restart);
 *   3. mark it pending, download the commit's tarball, drop the ballast no
 *      check opens (the same list as bin/helpers/remote-check.sh), add the
 *      PR's changed files as .check-files, and send it to the check-runner
 *      with the suites of the local gates (SUITES): the pre-commit type
 *      gates, the pre-push related tests and the bundle boot;
 *   4. post the verdict as the commit status, and on a failure one PR
 *      comment with the tail of the output.
 * The state lives on GitHub (the statuses themselves), so a restart loses
 * at most the run in flight, and that one is retried once it goes stale.
 *
 * Variables, all Railway references -- no value is ever copied or printed:
 *   GITHUB_TOKEN       a token that reads code and pull requests and
 *                      writes commit statuses and issue comments, or
 *   GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY
 *                      a GitHub App installed on the repository with the
 *                      same permissions; the bridge mints an installation
 *                      token (one hour) and renews it before it ends.
 *                      When both are set, the app is used.
 *                      2026-10-09: TRIOS_GITHUB_API_TOKEN answered 403 on
 *                      this private repository's pull requests.
 *   CHECK_RUNNER_KEY   ${{check-runner.CHECK_RUNNER_KEY}}
 *   CHECK_RUNNER_URL   http://${{check-runner.RAILWAY_PRIVATE_DOMAIN}}:${{check-runner.PORT}}
 *   REPO               gHashTag/999-multibots-telegraf by default
 *   RAILWAY_API_TOKEN  ${{vibee-render.RAILWAY_API_TOKEN}} (project token), optional:
 *                      with it a bridge left on old code asks Railway to deploy
 *                      main (Railway skipped five of its auto-deploys on
 *                      2026-10-09). RAILWAY_GIT_COMMIT_SHA, RAILWAY_SERVICE_ID
 *                      and RAILWAY_ENVIRONMENT_ID are Railway's own.
 * Every number and decision -- when a head runs, how the mark is written,
 * the verdict, the token's renewal -- is spec automation/ci-bridge
 * (gHashTag/t27), vendored in spec/ with its compiled logic; this file
 * makes the HTTP calls around it.
 *   SINCE              ISO time; a PR last updated before it is left alone.
 *                      Default: when this process started. 2026-10-09 the
 *                      repository had 34 open PRs, most of them stale: a
 *                      backfill would hold the shared runner for hours and
 *                      post a comment on each red one nobody is working on.
 * Every line this service logs or posts is scrubbed of both secret values.
 */
import { spawn } from 'node:child_process'
import { createSign } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import * as SPEC from './spec/ci-bridge.gen.ts'
import * as LOGIC from './spec/ci-bridge.logic.ts'

export const CONTEXT = SPEC.CONTEXT
export const SUITES = SPEC.SUITES.split(',')
/* What bin/helpers/remote-check.sh leaves out: no test opens it. */
export const BALLAST = [
  '*/avatar_brain',
  '*/data/backups',
  '*/vaults',
  '*.mp4',
  '*.webm',
  '*.mov',
]
const API = 'https://api.github.com'
const RAILWAY_API = 'https://backboard.railway.com/graphql/v2'
const TAIL_BYTES = 256 * 1024

export function config(env = process.env) {
  return {
    token: env.GITHUB_TOKEN || '',
    appId: env.GITHUB_APP_ID || '',
    appKey: (env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    minted: null,
    runnerKey: env.CHECK_RUNNER_KEY || '',
    runnerUrl: (env.CHECK_RUNNER_URL || '').replace(/\/+$/, ''),
    repo: env.REPO || 'gHashTag/999-multibots-telegraf',
    pollMs: SPEC.POLL_S * 1000,
    work: env.WORK_DIR || '/tmp/ci-bridge',
    since: Date.parse(env.SINCE || '') || Date.now(),
    ownSha: env.RAILWAY_GIT_COMMIT_SHA || '',
    railwayToken: env.RAILWAY_API_TOKEN || '',
    serviceId: env.RAILWAY_SERVICE_ID || '',
    environmentId: env.RAILWAY_ENVIRONMENT_ID || '',
    startedAt: Date.now(),
    healed: false,
  }
}

/* Every secret value out of a text before it is logged or posted. */
export function redact(text, secrets) {
  let out = String(text)
  for (const s of secrets)
    if (s && s.length >= 8) out = out.split(s).join('***')
  return out
}

/* Our own status on a commit, from GET /commits/{sha}/status. */
export function ourStatus(combined) {
  return (combined?.statuses || []).find(s => s.context === CONTEXT) || null
}

const seconds = ms => Math.max(0, Math.floor(ms / 1000))

/* Whether a head commit still needs a run (spec needs_run). */
export function needsRun(status, now) {
  return LOGIC.needsRun(
    Boolean(status),
    status?.state === 'pending',
    status ? seconds(now - Date.parse(status.updated_at)) : 0
  )
}

/* Whether a PR's head runs here at all (spec runs_here): our own
 * repository, touched since the bridge began. */
export function runsHere(pr, repo, since) {
  const updated = Date.parse(pr?.updated_at)
  return LOGIC.runsHere(
    pr?.head?.repo?.full_name?.toLowerCase() === repo.toLowerCase(),
    Number.isFinite(updated) ? seconds(updated) : 0,
    seconds(since)
  )
}

/*
 * The runner's verdict as a commit status. The runner's last line is
 * `::result {json}` with each suite's exit code, or {"error": ...}.
 */
const STATES = {
  [SPEC.STATE_SUCCESS]: 'success',
  [SPEC.STATE_FAILURE]: 'failure',
  [SPEC.STATE_ERROR]: 'error',
}
export function verdict(result) {
  const has = Boolean(result) && typeof result === 'object'
  const error = has && 'error' in result
  const names = has && !error ? Object.keys(result) : []
  const failed = names.filter(k => result[k] !== 0)
  const code = LOGIC.verdictState(has, error, names.length, failed.length)
  const description = !has
    ? 'the runner gave no result'
    : error
      ? `runner: ${String(result.error)}`
      : !names.length
        ? 'the runner ran nothing'
        : names
            .map(k => `${k}:${result[k] === 0 ? 'ok' : `FAIL(${result[k]})`}`)
            .join(' ')
  return { state: STATES[code], code, description: description.slice(0, 140) }
}

/* The last `::result` line of the runner's output, parsed, or null. */
export function resultOf(text) {
  const line = String(text)
    .split('\n')
    .filter(l => l.startsWith('::result '))
    .pop()
  if (!line) return null
  try {
    return JSON.parse(line.slice('::result '.length))
  } catch {
    return null
  }
}

/* The end of the output a person needs to see, heartbeats dropped. */
export function tailOf(text, n = SPEC.TAIL_LINES) {
  return String(text)
    .split('\n')
    .filter(l => l !== ':: still working' && !l.startsWith(':: queued'))
    .slice(-n)
    .join('\n')
}

export function commentBody(sha, v, tail) {
  return [
    `**${CONTEXT}: ${v.state}** on \`${sha.slice(0, 9)}\` -- ${v.description}`,
    '',
    '```',
    tail.replace(/```/g, "'''"),
    '```',
    '',
    'Run the same checks locally: `tri remote-check types render-types guard boots`.',
    '',
    '---',
    '_Posted by the ci-bridge service on Railway (deployment/ci-bridge)_',
  ].join('\n')
}

/* A GitHub App's own JWT (RS256, ten minutes), for minting a token. */
export function appJwt(appId, key, nowMs) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  const iat = Math.floor(nowMs / 1000) - SPEC.JWT_BACKDATE_S
  const head = b64({ alg: 'RS256', typ: 'JWT' })
  const body = b64({ iat, exp: iat + SPEC.JWT_LIFE_S, iss: String(appId) })
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key)
  return `${head}.${body}.${sig.toString('base64url')}`
}

/* The token to call GitHub with: the given one, or a minted installation token. */
export async function tokenOf(cfg, deps) {
  /* An app, when configured, wins: Railway keeps a variable set to "". */
  if (cfg.token && (cfg.preferToken || !(cfg.appId && cfg.appKey)))
    return cfg.token
  if (cfg.minted && !LOGIC.renewDue(seconds(cfg.minted.until - deps.now())))
    return cfg.minted.token
  const jwt = appJwt(cfg.appId, cfg.appKey, deps.now())
  const as = {
    Authorization: `Bearer ${jwt}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ci-bridge',
  }
  const inst = await deps.fetch(`${API}/repos/${cfg.repo}/installation`, {
    headers: as,
  })
  if (!inst.ok) throw new Error(`app installation -> ${await why(inst)}`)
  const { id } = await inst.json()
  const res = await deps.fetch(`${API}/app/installations/${id}/access_tokens`, {
    method: 'POST',
    headers: as,
  })
  if (!res.ok) throw new Error(`installation token -> ${await why(res)}`)
  const { token, expires_at, permissions } = await res.json()
  cfg.minted = {
    token,
    until: Date.parse(expires_at),
    perms: permissions || {},
  }
  /* what the installation may do, names only: the first thing to read when
   * a mark is refused (2026-10-09: statuses and checks were both missing) */
  deps.log?.(
    `app token: ${
      Object.entries(cfg.minted.perms)
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join(' ') || 'no permissions'
    }`
  )
  return token
}

/*
 * How the verdict is written: a commit status, or a check run when the
 * token may write checks but not statuses. 2026-10-09 the trios bees app
 * read pull requests here but answered "Resource not accessible by
 * integration" on commit statuses. A personal token carries no permission
 * map and is taken to write statuses. null: neither can be written.
 */
const MODES = {
  [SPEC.MARK_STATUS]: 'statuses',
  [SPEC.MARK_CHECK]: 'checks',
  [SPEC.MARK_COMMENT]: 'comment',
  [SPEC.MARK_NONE]: null,
}
export function markMode(perms) {
  return MODES[
    LOGIC.markMode(
      Boolean(perms),
      perms?.statuses === 'write',
      perms?.checks === 'write',
      perms?.issues === 'write' || perms?.pull_requests === 'write'
    )
  ]
}

/* A check run read as a status: the shape needsRun() takes. */
export function runAsStatus(run) {
  if (!run) return null
  return {
    state: run.status === 'completed' ? run.conclusion : 'pending',
    updated_at: run.completed_at || run.started_at,
  }
}

/* A refusal's status and GitHub's own words for it (never a header). */
async function why(res) {
  const body = await res.json().catch(() => ({}))
  return `${res.status} ${String(body?.message || '').slice(0, 120)}`.trim()
}

async function gh(cfg, deps, path, init = {}) {
  const res = await deps.fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await tokenOf(cfg, deps)}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ci-bridge',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(init.timeoutMs || 30_000),
  })
  return res
}

async function ghJson(cfg, deps, path) {
  const res = await gh(cfg, deps, path)
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]} -> ${await why(res)}`)
  return res.json()
}

/*
 * The comment mark (spec v3): one comment per head, opened pending and
 * edited to the verdict. Its first line is the marker the bridge reads back;
 * only a comment the app itself wrote counts (spec comment_is_mark).
 */
export const marker = (sha, state) =>
  `<!-- ${CONTEXT} sha=${sha} state=${state} -->`
const MARKER = new RegExp(`^<!-- ${CONTEXT} sha=([0-9a-f]+) state=(\\w+) -->`)

export async function commentMark(cfg, deps, pr) {
  let found = null
  for (let page = 1; page <= 5; page++) {
    const batch = await ghJson(
      cfg,
      deps,
      `/repos/${cfg.repo}/issues/${pr.number}/comments?per_page=100&page=${page}`
    )
    for (const c of batch) {
      const m = MARKER.exec(String(c.body || ''))
      const byApp =
        Boolean(cfg.appId) &&
        String(c.performed_via_github_app?.id ?? '') === String(cfg.appId)
      if (LOGIC.commentIsMark(Boolean(m) && m[1] === pr.head.sha, byApp))
        found = { state: m[2], updated_at: c.updated_at, id: c.id }
    }
    if (batch.length < 100) break
  }
  return found
}

/* Our mark on a commit, whichever way it is written. */
async function readMark(cfg, deps, mode, pr) {
  const sha = pr.head.sha
  if (mode === 'comment') return commentMark(cfg, deps, pr)
  if (mode === 'checks') {
    const r = await ghJson(
      cfg,
      deps,
      `/repos/${cfg.repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(CONTEXT)}&per_page=1`
    )
    return runAsStatus(r.check_runs?.[0])
  }
  return ourStatus(
    await ghJson(cfg, deps, `/repos/${cfg.repo}/commits/${sha}/status`)
  )
}

/* Pending first; the verdict later writes onto the same mark. */
async function startMark(cfg, deps, mode, sha, pr) {
  if (mode === 'comment') {
    const res = await gh(
      cfg,
      deps,
      `/repos/${cfg.repo}/issues/${pr.number}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({
          body: `${marker(sha, 'pending')}\n⏳ **${CONTEXT}**: running on \`${sha.slice(0, 9)}\` (Railway check-runner)`,
        }),
      }
    )
    if (!res.ok) throw new Error(`mark comment -> ${await why(res)}`)
    return (await res.json()).id
  }
  if (mode !== 'checks') {
    await setStatus(
      cfg,
      deps,
      sha,
      'pending',
      'running on Railway check-runner'
    )
    return null
  }
  const res = await gh(cfg, deps, `/repos/${cfg.repo}/check-runs`, {
    method: 'POST',
    body: JSON.stringify({
      name: CONTEXT,
      head_sha: sha,
      status: 'in_progress',
    }),
  })
  if (!res.ok) throw new Error(`check run -> ${await why(res)}`)
  return (await res.json()).id
}

async function endMark(cfg, deps, mode, sha, id, v, tail) {
  if (mode === 'comment') {
    const body =
      v.state === 'success'
        ? `${marker(sha, v.state)}\n✅ **${CONTEXT}: success** on \`${sha.slice(0, 9)}\` -- ${v.description}`
        : `${marker(sha, v.state)}\n${commentBody(sha, v, tail)}`
    const res = await gh(
      cfg,
      deps,
      `/repos/${cfg.repo}/issues/comments/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ body: redact(body, secretsOf(cfg)) }),
      }
    )
    if (!res.ok) throw new Error(`mark comment end -> ${await why(res)}`)
    return
  }
  if (mode !== 'checks')
    return setStatus(cfg, deps, sha, v.state, v.description)
  const title = redact(v.description, secretsOf(cfg)).slice(0, 140)
  const res = await gh(cfg, deps, `/repos/${cfg.repo}/check-runs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'completed',
      conclusion: v.state === 'success' ? 'success' : 'failure',
      output: {
        title,
        summary: title,
        text: redact(
          '```\n' + tail.replace(/```/g, "'''") + '\n```',
          secretsOf(cfg)
        ),
      },
    }),
  })
  if (!res.ok) throw new Error(`check run end -> ${await why(res)}`)
}

async function setStatus(cfg, deps, sha, state, description) {
  const res = await gh(cfg, deps, `/repos/${cfg.repo}/statuses/${sha}`, {
    method: 'POST',
    body: JSON.stringify({
      state,
      context: CONTEXT,
      description: redact(description, secretsOf(cfg)).slice(0, 140),
    }),
  })
  if (!res.ok) throw new Error(`status ${state} -> ${await why(res)}`)
}

const secretsOf = cfg => [
  cfg.railwayToken,
  cfg.token,
  cfg.runnerKey,
  cfg.appKey,
  cfg.minted?.token,
]

/* Changed files of a PR, paths from the repository root, removed ones out. */
async function changedFiles(cfg, deps, number) {
  const out = []
  for (let page = 1; page <= 30; page++) {
    const batch = await ghJson(
      cfg,
      deps,
      `/repos/${cfg.repo}/pulls/${number}/files?per_page=100&page=${page}`
    )
    for (const f of batch) if (f.status !== 'removed') out.push(f.filename)
    if (batch.length < 100) break
  }
  return out
}

export function sh(cmd, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'pipe'],
    })
    let err = ''
    child.stderr.on('data', d => (err = (err + d).slice(-2000)))
    child.on('error', reject)
    child.on('close', code =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited ${code}: ${err.trim()}`))
    )
    if (stdin) {
      /* tar that stops early closes its stdin: not a crash of this service */
      child.stdin.on('error', () => {})
      stdin.on('error', e => {
        child.kill()
        reject(e)
      })
      stdin.pipe(child.stdin)
    }
  })
}

/* The commit's tree as the runner wants it: a .tar.gz of the root. */
async function pack(cfg, deps, sha, files, dir) {
  const tree = join(dir, 'tree')
  await mkdir(tree, { recursive: true })
  const res = await gh(cfg, deps, `/repos/${cfg.repo}/tarball/${sha}`, {
    timeoutMs: 10 * 60_000,
  })
  if (!res.ok || !res.body) throw new Error(`tarball -> ${res.status}`)
  await deps.sh(
    'tar',
    [
      '-xzf',
      '-',
      '--strip-components=1',
      '-C',
      tree,
      ...BALLAST.map(p => `--exclude=${p}`),
    ],
    Readable.fromWeb(res.body)
  )
  await writeFile(join(tree, '.check-files'), files.join('\n') + '\n')
  const out = join(dir, 'code.tar.gz')
  await deps.sh('tar', ['-czf', out, '-C', tree, '.'])
  return readFile(out)
}

/* Send the code, keep the end of what the runner says. */
async function runChecks(cfg, deps, body) {
  const res = await deps.fetch(
    `${cfg.runnerUrl}/run?suites=${SUITES.join(',')}&files=`,
    {
      method: 'POST',
      headers: {
        'X-Check-Key': cfg.runnerKey,
        'Content-Type': 'application/gzip',
      },
      body,
      signal: AbortSignal.timeout(90 * 60_000),
    }
  )
  if (!res.body) return `::result {"error":"runner answered ${res.status}"}`
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of res.body) {
    text += decoder.decode(chunk, { stream: true })
    if (text.length > TAIL_BYTES) text = text.slice(-TAIL_BYTES)
  }
  return text
}

/* One head commit, start to verdict. */
export async function checkPr(cfg, deps, pr, mode = 'statuses') {
  const sha = pr.head.sha
  const log = deps.log
  const id = await startMark(cfg, deps, mode, sha, pr)
  const dir = join(cfg.work, sha)
  let text
  try {
    const files = await changedFiles(cfg, deps, pr.number)
    const body = await pack(cfg, deps, sha, files, dir)
    log(
      `#${pr.number} ${sha.slice(0, 9)}: ${files.length} files, ${body.length} bytes`
    )
    text = await runChecks(cfg, deps, body)
  } catch (e) {
    text = `::result ${JSON.stringify({ error: String(e?.message || e).slice(0, 200) })}`
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  const v = verdict(resultOf(text))
  await endMark(cfg, deps, mode, sha, id, v, tailOf(text))
  log(`#${pr.number} ${sha.slice(0, 9)}: ${v.state} ${v.description}`)
  /* the comment mark already carries the tail: no second comment */
  if (mode !== 'comment' && LOGIC.comments(v.code)) {
    const comment = redact(commentBody(sha, v, tailOf(text)), secretsOf(cfg))
    const res = await gh(
      cfg,
      deps,
      `/repos/${cfg.repo}/issues/${pr.number}/comments`,
      { method: 'POST', body: JSON.stringify({ body: comment }) }
    )
    /* the mark already carries the verdict; a refused comment is only logged */
    if (!res.ok) log(`#${pr.number} comment -> ${await why(res)}`)
  }
  return v
}

/*
 * Whether a person who may write here asked `/recheck` after a finished
 * mark (spec recheck_due). The bridge's own comments never ask: they are
 * not the word alone.
 */
export async function recheckAsked(cfg, deps, pr, mark) {
  const finished = Boolean(mark) && mark.state !== 'pending'
  if (!finished) return false
  const at = Date.parse(mark.updated_at)
  const trusted = SPEC.RECHECK_TRUSTED.split(',')
  const comments = await ghJson(
    cfg,
    deps,
    `/repos/${cfg.repo}/issues/${pr.number}/comments?since=${encodeURIComponent(mark.updated_at)}&per_page=100`
  )
  return comments.some(c =>
    LOGIC.recheckDue(
      finished,
      Date.parse(c.created_at) > at &&
        String(c.body || '')
          .trim()
          .toLowerCase() === SPEC.RECHECK_WORD,
      trusted.includes(c.author_association)
    )
  )
}

/*
 * A bridge Railway did not redeploy (spec heal_due): it does not contain
 * the latest commit touching its own directory. It asks Railway to deploy
 * main's head, once per process, after the grace. Returns what it did.
 */
const DEPLOY = `mutation($s: String!, $e: String!, $c: String) {
  serviceInstanceDeployV2(serviceId: $s, environmentId: $e, commitSha: $c)
}`
export async function heal(cfg, deps) {
  if (!cfg.ownSha || !cfg.railwayToken || !cfg.serviceId || !cfg.environmentId)
    return 'off'
  const [latest] = await ghJson(
    cfg,
    deps,
    `/repos/${cfg.repo}/commits?sha=main&path=deployment/ci-bridge&per_page=1`
  )
  let contains = !latest || latest.sha === cfg.ownSha
  if (!contains) {
    const cmp = await ghJson(
      cfg,
      deps,
      `/repos/${cfg.repo}/compare/${latest.sha}...${cfg.ownSha}`
    )
    contains = cmp.status === 'ahead' || cmp.status === 'identical'
  }
  const uptime = seconds(deps.now() - cfg.startedAt)
  if (!LOGIC.healDue(contains, uptime, cfg.healed))
    return contains ? 'fresh' : 'stale, waiting'
  cfg.healed = true
  const head = await ghJson(cfg, deps, `/repos/${cfg.repo}/commits/main`)
  for (const auth of [
    { authorization: `Bearer ${cfg.railwayToken}` },
    { 'project-access-token': cfg.railwayToken },
  ]) {
    const res = await deps.fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'ci-bridge',
        ...auth,
      },
      body: JSON.stringify({
        query: DEPLOY,
        variables: { s: cfg.serviceId, e: cfg.environmentId, c: head.sha },
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && !body.errors) {
      deps.log(
        `stale: running ${cfg.ownSha.slice(0, 9)}, asked Railway to deploy ${head.sha.slice(0, 9)}`
      )
      return 'healing'
    }
  }
  deps.log('stale, and Railway refused the deploy: redeploy ci-bridge by hand')
  return 'refused'
}

const APP_MAY_NOT_MARK =
  'the app may write neither commit statuses nor checks: give it ' +
  '"Commit statuses: write" or "Checks: write"'

/*
 * One pass over the open pull requests; runs them one at a time. Each pass
 * starts from the app again: a token fallback lasts one pass, so a
 * permission the owner grants later is picked up without a restart.
 */
export async function tick(cfg, deps, fallback = false) {
  cfg.preferToken = fallback
  const prs = await ghJson(
    cfg,
    deps,
    `/repos/${cfg.repo}/pulls?state=open&per_page=50`
  )
  const mode = markMode(fallback ? undefined : cfg.minted?.perms)
  if (!mode && cfg.token && !fallback) {
    /* the app reads but may not mark: a configured token marks instead */
    deps.log('the app may not mark; falling back to GITHUB_TOKEN')
    try {
      return await tick(cfg, deps, true)
    } catch (e) {
      throw new Error(`${APP_MAY_NOT_MARK}; GITHUB_TOKEN: ${e?.message || e}`)
    } finally {
      cfg.preferToken = false
    }
  }
  if (!mode) throw new Error(APP_MAY_NOT_MARK)
  const done = []
  for (const pr of prs) {
    if (!runsHere(pr, cfg.repo, cfg.since)) continue
    const mark = await readMark(cfg, deps, mode, pr)
    if (
      !needsRun(mark, deps.now()) &&
      !(await recheckAsked(cfg, deps, pr, mark))
    )
      continue
    done.push({ number: pr.number, ...(await checkPr(cfg, deps, pr, mode)) })
  }
  return done
}

/* What a start lacks, by name; empty when the bridge can run. */
export function missing(cfg) {
  const out = ['runnerKey', 'runnerUrl'].filter(k => !cfg[k])
  if (!cfg.token && !(cfg.appId && cfg.appKey)) out.push('token or app')
  return out
}

/* The service: one pass, a pause, again; a failed pass is one log line. */
export async function serve(cfg, deps, rounds = Infinity) {
  deps.log(
    `watching ${cfg.repo} every ${cfg.pollMs / 1000} s, suites ${SUITES.join(',')}`
  )
  for (let i = 0; i < rounds; i++) {
    try {
      await heal(cfg, deps)
    } catch (e) {
      deps.log(`heal failed: ${e?.message || e}`)
    }
    try {
      await tick(cfg, deps)
    } catch (e) {
      deps.log(`tick failed: ${e?.message || e}`)
    }
    await deps.sleep(cfg.pollMs)
  }
}

async function main() {
  const cfg = config()
  const deps = {
    fetch,
    sh,
    now: Date.now,
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    log: m => console.log(redact(`[ci-bridge] ${m}`, secretsOf(cfg))),
  }
  const lacks = missing(cfg)
  if (lacks.length) {
    deps.log(
      `not configured: ${lacks.join(', ')} -- see the header of bridge.mjs`
    )
    process.exit(1)
  }
  await serve(cfg, deps)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main()
