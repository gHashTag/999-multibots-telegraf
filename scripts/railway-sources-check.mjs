#!/usr/bin/env node
/**
 * ARE THE SERVICES STILL WIRED TO THE REPOSITORY?
 *
 * 2026-09-22: four services -- the bot, vibee-editor, vibee-render and
 * supabase-gateway -- lost their GitHub source some time after 16:06 UTC.
 * Nothing said so: merges kept landing, deployments simply stopped, and the
 * repo's own statuses stayed green. Found hours later by noticing that fixes
 * were not on production. Reconnected by hand (serviceConnect).
 *
 * This asks Railway, for each service that must deploy from main, whether it
 * still has a repo trigger on gHashTag/999-multibots-telegraf@main. Exit 0
 * when all do, 1 when any does not (each named), 2 when Railway could not be
 * asked -- a check that could not run is not a pass.
 *
 * The token: RAILWAY_API_TOKEN, else the Railway CLI login in (secret-guard-ok: a variable name, no value)
 * ~/.railway/config.json. It is read, used in one header, never printed.
 *
 *   node scripts/railway-sources-check.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function invokedDirectly() {
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1] ?? '')
    )
  } catch {
    return false
  }
}

export const PROJECT_ID = '564d9ebd-7aa8-44fe-93ec-e0b03c87158d'
export const REPO = 'gHashTag/999-multibots-telegraf'
export const BRANCH = 'main'
export const MUST_DEPLOY_FROM_MAIN = [
  '999-multibots-telegraf',
  'vibee-editor',
  'vibee-render',
  'supabase-gateway',
]

/** Pure: which of the required services have no trigger on REPO@BRANCH. */
export function unwired(services, required = MUST_DEPLOY_FROM_MAIN) {
  const byName = new Map(services.map(s => [s.name, s]))
  return required.filter(name => {
    const s = byName.get(name)
    if (!s) return true
    return !(s.triggers ?? []).some(
      t => t.repository === REPO && t.branch === BRANCH
    )
  })
}

/*
 * The CLI keeps a short-lived accessToken (user.tokenExpiresAt, seconds) and
 * refreshes it itself on any command. Read raw from the file, it goes stale
 * overnight: on 2026-09-22 at 02:57 this check and tri drift both answered
 * "Not Authorized" -- "could not check" -- until `railway whoami` had run.
 * So: near or past expiry, let the CLI refresh it, then read again.
 * forceRefresh does the same after Railway refuses a token that looked fine.
 */
function readCliToken() {
  try {
    const cfg = JSON.parse(
      readFileSync(path.join(homedir(), '.railway/config.json'), 'utf8')
    )
    return {
      token: cfg?.user?.accessToken || null,
      expiresAt: Number(cfg?.user?.tokenExpiresAt) || 0,
    }
  } catch {
    return { token: null, expiresAt: 0 }
  }
}

function cliRefresh() {
  try {
    execFileSync('railway', ['whoami'], { stdio: 'ignore', timeout: 30_000 })
  } catch {
    /* no CLI or no login: the caller reports "could not check" */
  }
}

export function freshToken({ forceRefresh = false, nowMs = Date.now() } = {}) {
  if (process.env.RAILWAY_API_TOKEN) return process.env.RAILWAY_API_TOKEN // secret-guard-ok: a variable name, no value
  let t = readCliToken()
  if (
    forceRefresh ||
    !t.token ||
    (t.expiresAt && t.expiresAt * 1000 < nowMs + 120_000)
  ) {
    cliRefresh()
    t = readCliToken()
  }
  return t.token
}

function token() {
  return freshToken()
}

async function main() {
  const t = token()
  if (!t) {
    console.log(
      'railway-sources: no token (RAILWAY_API_TOKEN or `railway login`) -- could not check'
    )
    process.exit(2)
  }
  const query = `query { project(id: "${PROJECT_ID}") { services { edges { node { name repoTriggers { edges { node { repository branch } } } } } } } }`
  let body
  try {
    const res = await fetch('https://backboard.railway.com/graphql/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({ query }),
    })
    body = await res.json()
  } catch (e) {
    console.log(
      `railway-sources: Railway did not answer (${e?.message ?? e}) -- could not check`
    )
    process.exit(2)
  }
  const edges = body?.data?.project?.services?.edges
  if (!Array.isArray(edges)) {
    console.log(
      `railway-sources: unexpected answer -- could not check: ${JSON.stringify(body?.errors ?? body).slice(0, 200)}`
    )
    process.exit(2)
  }
  const services = edges.map(e => ({
    name: e.node.name,
    triggers: e.node.repoTriggers.edges.map(x => x.node),
  }))
  const missing = unwired(services)
  if (missing.length === 0) {
    console.log(
      `railway-sources: ok -- ${MUST_DEPLOY_FROM_MAIN.length} services deploy from ${REPO}@${BRANCH}`
    )
    process.exit(0)
  }
  console.log(
    `railway-sources: NOT WIRED to ${REPO}@${BRANCH}: ${missing.join(', ')}.\n` +
      'Merges to main will not reach them. Reconnect: Railway service Settings > Source, ' +
      'or GraphQL serviceConnect(id, input: { repo, branch }).'
  )
  process.exit(1)
}

/*
 * Run when invoked directly -- compared by REAL path. The plain
 * `import.meta.url === file://argv[1]` test was false for a copy under
 * mktemp on macOS (/var is a link to /private/var), so main() never ran and
 * the process exited 0 having checked nothing: the daily task runs exactly
 * such a copy. A check that silently skips itself is worse than none.
 */
if (invokedDirectly()) await main()
