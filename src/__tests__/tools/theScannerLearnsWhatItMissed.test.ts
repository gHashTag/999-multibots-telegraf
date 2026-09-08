import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/*
 * A SHAPE THE SCANNER WALKED PAST.
 *
 * scan-secrets-on-disk read fourteen files carrying Inngest signing keys and
 * said nothing: it knew bot tokens, JWTs and `sk-` keys, and not this one. The
 * only useful response to a miss is to teach the shape and record which miss
 * taught it.
 *
 * WHAT IS NOT CLAIMED HERE. Those keys are RECORDED DEBT -- the repository's own
 * no-secrets-in-repo guard lists the files in KNOWN_DEBT, with twelve
 * Inngest-related entries. Finding them again is not a discovery, and this test
 * exists because the SCANNER was blind, not because the repository was.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { scanFile } = require('../../../scripts/scan-secrets-on-disk.cjs')

function withFile(content: string, run: (p: string) => void) {
  const p = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'shape-scan-')),
    'f.txt'
  )
  fs.writeFileSync(p, content)
  try {
    run(p)
  } finally {
    fs.rmSync(path.dirname(p), { recursive: true, force: true })
  }
}

const kinds = (p: string) =>
  (scanFile(p) as Array<{ kind: string }>).map(h => h.kind)

// Assembled, never written: a literal of the right shape in this file is a
// secret as far as any scanner is concerned, including the repo's own guard.
const shaped = {
  signing: 'signkey' + '-prod-' + 'a'.repeat(64),
  branch: 'signkey' + '-branch-' + 'b'.repeat(64),
  event: 'evtkey' + '-prod-' + 'c'.repeat(40),
  slack: 'xox' + 'b-' + '1234567890-abcdefghij',
  stripe: 'sk' + '_live_' + 'd'.repeat(24),
}

describe('the scanner learns what it missed', () => {
  it('finds an Inngest signing key, prod or branch', () => {
    withFile(`K=${shaped.signing}`, p =>
      expect(kinds(p)).toContain('inngest signing key')
    )
    // The branch flavour matters: the repository's own guard pattern allows
    // only prod|test, so `signkey-branch-...` is invisible to it -- and that
    // is the value deployed as the RENDER_INNGEST_SIGNING_KEY fallback.
    withFile(`K=${shaped.branch}`, p =>
      expect(kinds(p)).toContain('inngest signing key')
    )
  })

  it('finds an event key, a Slack token and a Stripe key', () => {
    withFile(`K=${shaped.event}`, p =>
      expect(kinds(p)).toContain('inngest event key')
    )
    withFile(`K=${shaped.slack}`, p =>
      expect(kinds(p)).toContain('slack token')
    )
    withFile(`K=${shaped.stripe}`, p =>
      expect(kinds(p)).toContain('stripe key')
    )
  })

  it('still does not cry wolf over ordinary text', () => {
    withFile(
      [
        'const key = process.env.INNGEST_SIGNING_KEY',
        'signkey-prod-<redacted>',
      ].join('\n'),
      p => expect(kinds(p)).toEqual([])
    )
  })

  it('and still never returns the value', () => {
    withFile(`K=${shaped.signing}`, p => {
      const hits = scanFile(p) as Array<Record<string, unknown>>
      expect(hits.length).toBeGreaterThan(0)
      for (const h of hits)
        expect(JSON.stringify(h)).not.toContain(shaped.signing)
    })
  })
})
