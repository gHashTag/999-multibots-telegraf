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
 *   GITHUB_TOKEN       ${{trios-agent-server.TRIOS_GITHUB_API_TOKEN}}
 *                      (needs read on code and pull requests, write on
 *                      commit statuses and issue comments)
 *   CHECK_RUNNER_KEY   ${{check-runner.CHECK_RUNNER_KEY}}
 *   CHECK_RUNNER_URL   http://${{check-runner.RAILWAY_PRIVATE_DOMAIN}}:${{check-runner.PORT}}
 *   REPO               gHashTag/999-multibots-telegraf by default
 *   POLL_S, STALE_MIN  120 and 60 by default
 * Every line this service logs or posts is scrubbed of both secret values.
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'

export const CONTEXT = 'railway/checks'
export const SUITES = ['types', 'render-types', 'guard', 'boots']
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
const TAIL_LINES = 80
const TAIL_BYTES = 256 * 1024

export function config(env = process.env) {
  return {
    token: env.GITHUB_TOKEN || '',
    runnerKey: env.CHECK_RUNNER_KEY || '',
    runnerUrl: (env.CHECK_RUNNER_URL || '').replace(/\/+$/, ''),
    repo: env.REPO || 'gHashTag/999-multibots-telegraf',
    pollMs: Number(env.POLL_S || 120) * 1000,
    staleMs: Number(env.STALE_MIN || 60) * 60_000,
    work: env.WORK_DIR || '/tmp/ci-bridge',
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

/* Whether a head commit still needs a run. */
export function needsRun(status, now, staleMs) {
  if (!status) return true
  if (status.state !== 'pending') return false
  return now - Date.parse(status.updated_at) > staleMs
}

/* Only a head that lives in this repository: a fork's code never runs here. */
export function ownHead(pr, repo) {
  return pr?.head?.repo?.full_name?.toLowerCase() === repo.toLowerCase()
}

/*
 * The runner's verdict as a commit status. The runner's last line is
 * `::result {json}` with each suite's exit code, or {"error": ...}.
 */
export function verdict(result) {
  if (!result || typeof result !== 'object')
    return { state: 'error', description: 'the runner gave no result' }
  if ('error' in result)
    return {
      state: 'error',
      description: `runner: ${String(result.error)}`.slice(0, 140),
    }
  const names = Object.keys(result)
  if (!names.length)
    return { state: 'error', description: 'the runner ran nothing' }
  const failed = names.filter(k => result[k] !== 0)
  const description = names
    .map(k => `${k}:${result[k] === 0 ? 'ok' : `FAIL(${result[k]})`}`)
    .join(' ')
    .slice(0, 140)
  return { state: failed.length ? 'failure' : 'success', description }
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
export function tailOf(text, n = TAIL_LINES) {
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

async function gh(cfg, deps, path, init = {}) {
  const res = await deps.fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
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
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]} -> ${res.status}`)
  return res.json()
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
  if (!res.ok) throw new Error(`status ${state} -> ${res.status}`)
}

const secretsOf = cfg => [cfg.token, cfg.runnerKey]

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
export async function checkPr(cfg, deps, pr) {
  const sha = pr.head.sha
  const log = deps.log
  await setStatus(cfg, deps, sha, 'pending', 'running on Railway check-runner')
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
  await setStatus(cfg, deps, sha, v.state, v.description)
  log(`#${pr.number} ${sha.slice(0, 9)}: ${v.state} ${v.description}`)
  if (v.state !== 'success') {
    const comment = redact(commentBody(sha, v, tailOf(text)), secretsOf(cfg))
    await gh(cfg, deps, `/repos/${cfg.repo}/issues/${pr.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: comment }),
    })
  }
  return v
}

/* One pass over the open pull requests; runs them one at a time. */
export async function tick(cfg, deps) {
  const prs = await ghJson(
    cfg,
    deps,
    `/repos/${cfg.repo}/pulls?state=open&per_page=50`
  )
  const done = []
  for (const pr of prs) {
    if (!ownHead(pr, cfg.repo)) continue
    const combined = await ghJson(
      cfg,
      deps,
      `/repos/${cfg.repo}/commits/${pr.head.sha}/status`
    )
    if (!needsRun(ourStatus(combined), deps.now(), cfg.staleMs)) continue
    done.push({ number: pr.number, ...(await checkPr(cfg, deps, pr)) })
  }
  return done
}

async function main() {
  const cfg = config()
  const deps = {
    fetch,
    sh,
    now: Date.now,
    log: m => console.log(redact(`[ci-bridge] ${m}`, secretsOf(cfg))),
  }
  const missing = ['token', 'runnerKey', 'runnerUrl'].filter(k => !cfg[k])
  if (missing.length) {
    deps.log(
      `not configured: ${missing.join(', ')} -- see the header of bridge.mjs`
    )
    process.exit(1)
  }
  deps.log(
    `watching ${cfg.repo} every ${cfg.pollMs / 1000} s, suites ${SUITES.join(',')}`
  )
  for (;;) {
    try {
      await tick(cfg, deps)
    } catch (e) {
      deps.log(`tick failed: ${e?.message || e}`)
    }
    await new Promise(r => setTimeout(r, cfg.pollMs))
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main()
