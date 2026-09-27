import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * EVERY "WHO PAID" READS THE LIVE WALLET (CRM audit 2026-09-27, #1).
 *
 * whoPaid(scope) alone reads payments_v2, the archive nothing writes since
 * the one-wallet decision. The second argument -- the pool -- adds the
 * purchases in token_ledger. A call without it looks right, type-checks, and
 * quietly tells the seller that a client who paid has not, so the client is
 * pitched again. This fails on the day such a call is written.
 *
 * `tri paid-sources` prints the same list.
 */
const SRC = path.join(__dirname, 'src')

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return files(p)
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : []
  })
}

describe('whoPaid is never called with the archive alone', () => {
  it('each call passes the pool', () => {
    const bare: string[] = []
    for (const f of files(SRC)) {
      const text = fs.readFileSync(f, 'utf8')
      // whoPaid(x) or whoPaid) as a bare .then(whoPaid): one argument only.
      for (const m of text.matchAll(/whoPaid\(([^(),]*)\)|\.then\(whoPaid\)/g))
        bare.push(`${path.relative(SRC, f)}: ${m[0]}`)
    }
    expect(bare).toEqual([])
  })

  it('the guard sees a bare call when there is one', () => {
    const sample = 'const p = await whoPaid(scope)\nx.then(whoPaid)'
    expect(
      [...sample.matchAll(/whoPaid\(([^(),]*)\)|\.then\(whoPaid\)/g)].length
    ).toBe(2)
  })
})
