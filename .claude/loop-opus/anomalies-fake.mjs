#!/usr/bin/env node
/**
 * A production stand-in for anomalies.mjs, driven entirely by SCENARIO.
 *
 * ONE SERVER FOR BOTH ROLES. The checker talks to two hosts, RENDER and APP,
 * but their paths do not collide -- RENDER owns /api/* and /health, APP owns
 * /, /feed and /chat. So ANOMALIES_RENDER_URL and ANOMALIES_APP_URL can point
 * at the same port and each request still lands on the right handler. One
 * process, one thing to reap.
 *
 *   SCENARIO='{"providers":{"status":500}}' node anomalies-fake.mjs
 *
 * Prints FAKE_PORT=<n> on stdout as soon as it is listening; the caller reads
 * that instead of guessing. Port 0 means the OS picks, so two scenarios can
 * never collide and nothing has to be hunted down with lsof -- unlike
 * mock-selfcheck.sh, which pins 3399 and has to kill by port because tsx leaves
 * a node child holding it.
 *
 * Per-route behaviours, all optional. An absent key serves the HEALTHY default,
 * so a scenario breaks exactly one thing and every other section stays quiet:
 *
 *   {json}          200 with this body
 *   {status,json}   that status with this body
 *   {html}          200 text/html with this body
 *   {raw}           200 with a body that is NOT JSON (drives the !r.json arm)
 *   {kill:true}     destroy the socket -> fetch rejects -> the catch arm
 *
 * WHY kill AND NOT A HANG. req.socket.destroy() makes undici reject at once
 * with TypeError: fetch failed. A hang reaches the same six catch blocks but
 * costs the checker's own 20 s AbortController timeout each time, turning a
 * seven-second suite into a four-minute one -- and a four-minute self-test is
 * one nobody runs, which is how the thing it guards goes unguarded.
 */

import http from 'node:http'

import { K } from './anomalies-keys.mjs'

const S = JSON.parse(process.env.SCENARIO || '{}')

/**
 * The three extra-segment probes are Cyrillic, and they arrive PERCENT-ENCODED:
 * fetch of /api/feed/<ru> reaches this server as
 * /api/feed/%D1%87%D0%B5%D0%BF%D1%83%D1%85%D0%B0. A fake matching raw strings
 * would fall through to its own default and answer 404 -- passing the section-4
 * scenarios for entirely the wrong reason, which is the exact failure mode this
 * whole exercise exists to remove. Measured, not assumed.
 */
function route(url) {
  let p = url.split('?')[0]
  try {
    p = decodeURIComponent(p)
  } catch {
    /* malformed escape -- match the raw path, still deterministic */
  }
  if (p === '/health') return 'health'
  if (p === '/api/providers') return 'providers'
  // Order matters: the extra-segment probes are prefixes of the real routes.
  // /api/feed/<ru> must not be served by the feed arm, and
  // /api/users/t27_dev/templates must not be served by the profile arm.
  if (p.startsWith('/api/feed/')) return 'extra404'
  if (p.startsWith('/api/feed')) return 'feed'
  if (/^\/api\/users\/[^/]+\/templates$/.test(p)) return 'profileTemplates'
  if (/^\/api\/users\/[^/]+$/.test(p)) return 'profile'
  // Anything deeper under /api/users -- /api/users/t27_dev/<ru> and
  // /api/users/id/144022504/<ru> -- is an extra-segment probe.
  if (p.startsWith('/api/users/')) return 'extra404'
  if (p === '/' || p === '/feed' || p === '/chat') return 'spa'
  return 'unknown'
}

/**
 * HEALTHY DEFAULTS, IN PRODUCTION'S OWN SHAPES.
 *
 * Copied from the live handlers, not invented: the providers payload uses
 * Cyrillic keys, and createdAt comes back as '2026-08-29 12:00:00+00' -- a
 * space instead of T and an offset with no colon. That shape is the one that
 * once produced NaN and a false "no reels in a day", so a fake that emitted
 * clean ISO would test a payload production never sends.
 *
 * /health deliberately omits `version`. That takes the note() branch of the
 * deploy section and never shells out to git, which is the whole difference
 * between a suite measured in seconds and one paying a 20 s `git fetch` per
 * scenario. The two deploy scenarios send a version on purpose.
 */
const recentIso = h =>
  new Date(Date.now() - h * 3_600_000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '+00')

const DEFAULTS = {
  providers: {
    json: {
      // Computed keys, not literal ones -- see anomalies-keys.mjs. Written
      // plainly they are Cyrillic identifiers, which the no-cyrillic guard
      // rejects; written quoted, prettier removes the quotes and produces the
      // identifiers anyway.
      [K.providers]: [
        { [K.provider]: 'GLM — агент', ok: true, [K.details]: 'ok' },
        { [K.provider]: 'FAL — картинки', ok: true, [K.details]: 'ok' },
      ],
      [K.working]: 2,
      [K.total]: 2,
    },
  },
  health: { json: { status: 'ok' } },
  feed: {
    json: { templates: [{ name: 'fake reel', createdAt: recentIso(0.5) }] },
  },
  profile: { json: { templates_count: 3 } },
  profileTemplates: { json: { templates: [{}, {}, {}] } },
  extra404: { status: 404, json: { error: 'not found' } },
  spa: {
    html: '<!doctype html><html><body><div id="root"></div></body></html>',
  },
}

const server = http.createServer((req, res) => {
  const name = route(req.url || '/')
  const b = S[name] !== undefined ? S[name] : DEFAULTS[name]

  if (!b) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end('{"error":"fake has no such route"}')
    return
  }
  if (b.kill) {
    req.socket.destroy()
    return
  }
  if (b.html !== undefined) {
    res.writeHead(b.status || 200, { 'content-type': 'text/html' })
    res.end(b.html)
    return
  }
  if (b.raw !== undefined) {
    res.writeHead(b.status || 200, { 'content-type': 'text/plain' })
    res.end(b.raw)
    return
  }
  res.writeHead(b.status || 200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(b.json === undefined ? {} : b.json))
})

server.listen(0, '127.0.0.1', () => {
  console.log(`FAKE_PORT=${server.address().port}`)
})
