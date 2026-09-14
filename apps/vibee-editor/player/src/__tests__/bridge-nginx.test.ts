import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE BRIDGE'S OWN POLICY IN nginx, EXACTLY.
 *
 * frame-ancestors is https://t27.ai and nothing else. 'self' would let the
 * bridge load inside /hive (app.t27.ai > t27.ai > app.t27.ai), where a frame
 * shares the player's sessionStorage, Telegram launch data included
 * (measured in Chrome). The policy is compared whole, so an added source of
 * any kind fails. Both locations carry it, because a location with its own
 * add_header drops every inherited one, and without the ^~ block
 * /bridge/bridge.js would fall into the `.js` location, cached for a year.
 */

const TEMPLATE = path.resolve(__dirname, '../../../nginx/default.conf.template')

const BRIDGE_CSP =
  "default-src 'none'; script-src 'self'; connect-src https://vibee-render-production.up.railway.app; style-src 'self'; frame-ancestors https://t27.ai"

const LOCATIONS = ['= /bridge', '^~ /bridge/']

function block(conf: string, match: string): string | null {
  const head = `\n    location ${match} {\n`
  const start = conf.indexOf(head)
  if (start < 0) return null
  const end = conf.indexOf('\n    }\n', start + head.length)
  return end < 0 ? null : conf.slice(start, end)
}

function bridgeProblems(conf: string): string[] {
  const out: string[] = []
  for (const match of LOCATIONS) {
    const body = block(conf, match)
    if (!body) {
      out.push(`no location ${match}`)
      continue
    }
    const csp = [
      ...body.matchAll(/add_header\s+Content-Security-Policy\s+"([^"]*)"/g),
    ].map(m => m[1])
    if (csp.length !== 1 || csp[0] !== BRIDGE_CSP) {
      out.push(`${match}: policy is ${JSON.stringify(csp)}`)
    }
    const cache = [...body.matchAll(/add_header\s+Cache-Control\s+"([^"]*)"/g)]
    if (cache.length !== 1 || cache[0][1] !== 'no-store') {
      out.push(
        `${match}: Cache-Control is ${JSON.stringify(cache.map(m => m[1]))}`
      )
    }
    if (!/add_header X-Content-Type-Options "nosniff" always;/.test(body)) {
      out.push(`${match}: no nosniff`)
    }
  }
  return out
}

describe('nginx serves the bridge with its own exact policy', () => {
  const conf = fs.readFileSync(TEMPLATE, 'utf8')

  it('both bridge locations: the exact policy, no-store, nosniff', () => {
    expect(bridgeProblems(conf)).toEqual([])
  })

  it("the policy's frame-ancestors is https://t27.ai alone", () => {
    const directive = BRIDGE_CSP.split(';')
      .map(d => d.trim())
      .find(d => d.startsWith('frame-ancestors '))
    expect(directive?.split(/\s+/).slice(1)).toEqual(['https://t27.ai'])
  })

  it('/bridge serves the page, and /bridge/ only existing files', () => {
    expect(block(conf, '= /bridge')).toContain(
      'try_files /bridge/index.html =404;'
    )
    expect(block(conf, '^~ /bridge/')).toContain('try_files $uri =404;')
  })

  it("negative control: 'self' added to frame-ancestors is caught", () => {
    const broken = conf.replace(
      'frame-ancestors https://t27.ai" always;',
      `frame-ancestors 'self' https://t27.ai" always;`
    )
    expect(broken).not.toBe(conf)
    expect(bridgeProblems(broken)).toEqual([
      expect.stringMatching(/^= \/bridge: policy is/),
    ])
  })

  it('negative control: Telegram added to the copy in ^~ /bridge/ is caught', () => {
    const idx = conf.indexOf('location ^~ /bridge/')
    const broken =
      conf.slice(0, idx) +
      conf
        .slice(idx)
        .replace(
          'frame-ancestors https://t27.ai"',
          'frame-ancestors https://t27.ai https://web.telegram.org"'
        )
    expect(bridgeProblems(broken)).toEqual([
      expect.stringMatching(/^\^~ \/bridge\/: policy is/),
    ])
  })

  it('negative control: a missing ^~ /bridge/ block or no-store is caught', () => {
    const noPrefix = conf.replace(
      /\n {4}location \^~ \/bridge\/ \{[\s\S]*?\n {4}\}\n/,
      '\n'
    )
    expect(bridgeProblems(noPrefix)).toEqual(['no location ^~ /bridge/'])

    const cached = conf.replace(
      'add_header Cache-Control "no-store" always;',
      ''
    )
    expect(bridgeProblems(cached)).toEqual([
      expect.stringMatching(/^= \/bridge: Cache-Control is \[\]/),
    ])
  })
})
