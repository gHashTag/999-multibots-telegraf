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
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

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

function token() {
  if (process.env.RAILWAY_API_TOKEN) return process.env.RAILWAY_API_TOKEN
  try {
    const cfg = JSON.parse(
      readFileSync(path.join(homedir(), '.railway/config.json'), 'utf8')
    )
    return cfg?.user?.accessToken || null
  } catch {
    return null
  }
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

if (import.meta.url === `file://${process.argv[1]}`) await main()
