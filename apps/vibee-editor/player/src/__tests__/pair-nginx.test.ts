import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE SIGN-IN CODE'S OWN POLICY IN nginx, EXACTLY.
 *
 * `/pair` (pages/Pair.tsx) mints a credential from one button. That is the
 * same object class as /bridge/consent.html, and it gets the same treatment:
 * its own location, its own frame-ancestors, compared whole so an added source
 * of any kind fails here.
 *
 * NOT the server-level policy, which admits 'self' and https://t27.ai:
 *  - https://t27.ai is every GitHub Pages site gHashTag publishes there, not
 *    only the game -- CSP cannot narrow an origin to a path.
 *  - 'self' is the /hive chain app.t27.ai > t27.ai > app.t27.ai, where a frame
 *    shares this app's sessionStorage, Telegram launch data included.
 *
 * Neither can mint a code today: getInitData() returns '' when an ancestor is
 * not Telegram, so the server answers 401 -- fail-closed. What a frame CAN do
 * is render the real button, and a decoy laid over it is exactly the attack
 * the consent popup's 'none' exists to prevent.
 *
 * Telegram stays: the Mini App genuinely runs in an iframe on web.telegram.org,
 * and that is where every person reaching this screen comes from.
 */

const TEMPLATE = path.resolve(__dirname, '../../../nginx/default.conf.template')

const LOCATION = '~ ^/pair/?$'

const PAIR_CSP =
  'frame-ancestors https://web.telegram.org https://*.telegram.org;'

function block(conf: string, match: string): string | null {
  const head = `\n    location ${match} {\n`
  const start = conf.indexOf(head)
  if (start < 0) return null
  const end = conf.indexOf('\n    }\n', start + head.length)
  return end < 0 ? null : conf.slice(start, end)
}

function pairProblems(conf: string): string[] {
  const body = block(conf, LOCATION)
  if (!body) return [`no location ${LOCATION}`]
  const out: string[] = []

  const csp = [
    ...body.matchAll(/add_header\s+Content-Security-Policy\s+"([^"]*)"/g),
  ].map(m => m[1])
  if (csp.length !== 1 || csp[0] !== PAIR_CSP) {
    out.push(`policy is ${JSON.stringify(csp)}`)
  }

  // add_header inside a location drops every inherited one, so the headers the
  // server block sets have to be repeated here or they are simply gone.
  if (!/add_header X-Content-Type-Options "nosniff" always;/.test(body)) {
    out.push('no nosniff')
  }
  if (!/add_header Referrer-Policy "[^"]+" always;/.test(body)) {
    out.push('no Referrer-Policy')
  }

  // A page that shows a short-lived credential must not be stored by anything
  // between the browser and nginx -- same reasoning as /index.html.
  if (
    !/add_header Cache-Control "no-cache, no-store, must-revalidate"/.test(body)
  ) {
    out.push('not no-store')
  }

  // The SPA entry document, not $uri: nothing named "pair" exists on disk, and
  // try_files $uri would 404 the screen.
  if (!body.includes('try_files /index.html =404;')) {
    out.push('not try_files /index.html =404')
  }

  return out
}

describe('nginx serves the sign-in code with its own exact policy', () => {
  const conf = fs.readFileSync(TEMPLATE, 'utf8')

  it('the exact policy, no-store, nosniff, the SPA document', () => {
    expect(pairProblems(conf)).toEqual([])
  })

  it('frame-ancestors is Telegram alone', () => {
    const sources = PAIR_CSP.replace(/;$/, '').split(/\s+/).slice(1)
    expect(sources).toEqual([
      'https://web.telegram.org',
      'https://*.telegram.org',
    ])
    // Spelled out because these two are what the server-level line grants, and
    // "harmonising" this block with it is the obvious wrong edit.
    expect(sources).not.toContain("'self'")
    expect(sources).not.toContain('https://t27.ai')
  })

  it('the location is a regex, so /pair/ cannot fall through', () => {
    // `location = /pair` would match only the exact path. React Router serves
    // /pair/ as the same screen, and that address would land in `location /`
    // with the permissive server-level policy and a cacheable response.
    expect(conf).toContain(`location ${LOCATION} {`)
  })

  it("negative control: 'self' added to frame-ancestors is caught", () => {
    const broken = conf.replace(
      `"${PAIR_CSP}"`,
      `"frame-ancestors 'self' https://web.telegram.org https://*.telegram.org;"`
    )
    expect(broken).not.toBe(conf)
    expect(pairProblems(broken)).toEqual([expect.stringMatching(/^policy is/)])
  })

  it('negative control: no /pair block at all is caught', () => {
    const missing = conf.replace(
      /\n {4}location ~ \^\/pair\/\?\$ \{[\s\S]*?\n {4}\}\n/,
      '\n'
    )
    expect(missing).not.toBe(conf)
    expect(pairProblems(missing)).toEqual([`no location ${LOCATION}`])
  })

  it('negative control: a cacheable code screen is caught', () => {
    const cached = conf.replace(
      /\n {4}location ~ \^\/pair\/\?\$ \{([\s\S]*?)\n {4}\}\n/,
      (whole, body: string) =>
        whole.replace(
          body,
          body.replace(
            /\n\s*add_header Cache-Control "no-cache, no-store, must-revalidate" always;/,
            ''
          )
        )
    )
    expect(cached).not.toBe(conf)
    expect(pairProblems(cached)).toEqual(['not no-store'])
  })
})
