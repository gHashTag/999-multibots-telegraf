#!/usr/bin/env node
/**
 * MERGED IS NOT SHIPPED: THE THREE WAYS IT FAILED ON ONE EVENING.
 *
 * 2026-09-21/22, all within six hours, none announced by anything:
 *
 *   UNWIRED  four services lost their GitHub source. Merges kept landing;
 *            Railway never heard of them.
 *   STALLED  the same thing seen from the other side: main moved on, and no
 *            deployment of any status named the new commit.
 *   FAILING  a build passed and then failed its healthcheck eleven times
 *            (#2741, an import cycle). Railway kept the previous build, so
 *            production looked healthy while every later bot fix was stuck.
 *
 * This names each, per service, from Railway's own deployment list and the
 * repository's main. Exit 0 all clear, 1 an anomaly (each named, with the
 * command that shows more), 2 when it could not look -- which is not a pass.
 *
 *   node scripts/railway-drift.mjs          (tri drift)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  PROJECT_ID,
  MUST_DEPLOY_FROM_MAIN,
  unwired,
} from './railway-sources-check.mjs'

/** Longer than this without Railway naming main's head is a stall. */
export const STALL_MS = 20 * 60 * 1000

const SETTLED_BAD = new Set(['FAILED', 'CRASHED'])
const BUSY = new Set([
  'BUILDING',
  'DEPLOYING',
  'INITIALIZING',
  'QUEUED',
  'WAITING',
])

/**
 * Pure. `deploys` newest first: { status, createdAt (ISO), commit | null }.
 * Returns null when this service is fine, or one sentence when it is not.
 */
export function anomalyOf({ name, deploys, mainHead, mainHeadAtMs, nowMs }) {
  const lastGood = deploys.find(d => d.status === 'SUCCESS')
  const lastReal = deploys.find(
    d => d.status !== 'SKIPPED' && d.status !== 'REMOVED'
  )
  if (lastReal && SETTLED_BAD.has(lastReal.status)) {
    return (
      `${name}: FAILING -- the newest build (${short(lastReal.commit)}, ${lastReal.createdAt}) ` +
      `${lastReal.status}; production is still ${lastGood ? `on ${short(lastGood.commit)}` : 'on no successful build'}`
    )
  }
  const seen = deploys.some(d => d.commit === mainHead)
  if (
    !seen &&
    nowMs - mainHeadAtMs > STALL_MS &&
    !(lastReal && BUSY.has(lastReal.status))
  ) {
    const minutes = Math.round((nowMs - mainHeadAtMs) / 60000)
    return (
      `${name}: STALLED -- main ${short(mainHead)} is ${minutes} min old and Railway ` +
      `has no deployment of it (newest it knows: ${short(deploys[0]?.commit)})`
    )
  }
  return null
}

const short = c => (c ? String(c).slice(0, 9) : '(by hand)')

function token() {
  if (process.env.RAILWAY_API_TOKEN) return process.env.RAILWAY_API_TOKEN // secret-guard-ok: a variable name, no value
  try {
    const cfg = JSON.parse(
      readFileSync(path.join(homedir(), '.railway/config.json'), 'utf8')
    )
    return cfg?.user?.accessToken || null
  } catch {
    return null
  }
}

async function gql(t, query, variables = {}) {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${t}`,
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = await res.json()
  if (!body?.data)
    throw new Error(JSON.stringify(body?.errors ?? body).slice(0, 200))
  return body.data
}

async function main() {
  const t = token()
  if (!t) {
    console.log(
      'drift: no Railway token (RAILWAY_API_TOKEN or `railway login`) -- could not look'
    )
    process.exit(2)
  }
  let head, headAt
  try {
    execFileSync('git', ['fetch', '-q', 'origin', 'main'], { stdio: 'ignore' })
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%H %ct', 'origin/main'],
      { encoding: 'utf8' }
    ).trim()
    ;[head, headAt] = out.split(' ')
  } catch (e) {
    console.log(
      `drift: could not read origin/main (${e.message}) -- could not look`
    )
    process.exit(2)
  }
  let services
  try {
    const data = await gql(
      t,
      `query($p:String!){ project(id:$p){ services{ edges{ node{ id name repoTriggers{ edges{ node{ repository branch } } } } } } } }`,
      { p: PROJECT_ID }
    )
    services = data.project.services.edges.map(e => ({
      id: e.node.id,
      name: e.node.name,
      triggers: e.node.repoTriggers.edges.map(x => x.node),
    }))
  } catch (e) {
    console.log(
      `drift: Railway did not answer (${e.message}) -- could not look`
    )
    process.exit(2)
  }

  const found = unwired(services).map(
    n => `${n}: UNWIRED -- no trigger on main; merges will not reach it`
  )
  for (const name of MUST_DEPLOY_FROM_MAIN) {
    const s = services.find(x => x.name === name)
    if (!s) continue
    try {
      const data = await gql(
        t,
        `query($p:String!,$s:String!){ deployments(first:15, input:{projectId:$p, serviceId:$s}){ edges{ node{ status createdAt meta } } } }`,
        { p: PROJECT_ID, s: s.id }
      )
      const deploys = data.deployments.edges.map(e => ({
        status: e.node.status,
        createdAt: e.node.createdAt,
        commit: e.node.meta?.commitHash ?? null,
      }))
      const a = anomalyOf({
        name,
        deploys,
        mainHead: head,
        mainHeadAtMs: Number(headAt) * 1000,
        nowMs: Date.now(),
      })
      if (a) found.push(a)
    } catch (e) {
      found.push(`${name}: could not read deployments (${e.message})`)
    }
  }

  if (found.length === 0) {
    console.log(
      `drift: ok -- ${MUST_DEPLOY_FROM_MAIN.length} services wired to main and none stuck (main ${head.slice(0, 9)})`
    )
    process.exit(0)
  }
  console.log(found.join('\n'))
  console.log(
    'more: railway deployment list --service <name> --json; build events: GraphQL deploymentEvents(id)'
  )
  process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
