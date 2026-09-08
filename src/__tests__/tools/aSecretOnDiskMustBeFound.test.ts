import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/*
 * TWO CREDENTIAL LEAKS ON ONE MACHINE, ON ONE DAY, FROM TWO DIFFERENT AGENTS.
 *
 * ZEP_AUTH_SECRET reached a session log because masking with `sed` on macOS
 * silently did not substitute. And two full `railway variables` dumps -- 70 and
 * 126 variables WITH VALUES, every bot token, the AWS pair, DATABASE_URL, the
 * Infisical client secret, a GitHub token -- sat in a scratchpad file for hours.
 *
 * Neither was noticed by whatever created it. Both were found because somebody
 * went looking, and going looking is not a control.
 *
 * The scanner is a smoke detector, not a proof: it knows SHAPES, and a secret
 * without a recognisable shape passes straight through. Its own output says so,
 * which is the half that keeps a "clean" result honest.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { scanFile } = require('../../../scripts/scan-secrets-on-disk.cjs')

function withFile(content: string, run: (p: string) => void) {
  const p = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'secret-scan-')),
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

describe('a secret on disk must be found before it is copied', () => {
  /*
   * THE FIXTURES ARE ASSEMBLED, NOT WRITTEN.
   *
   * A literal of the right shape in this file is a secret as far as any scanner
   * is concerned -- and the repository's own pre-commit guard proved it by
   * refusing this commit three times. Two independent detectors agreeing on the
   * same three shapes is better evidence than either one claiming to work.
   *
   * Concatenation keeps the source clean while the scanner still sees the whole
   * string at runtime, which is the thing under test. Suppression markers were
   * the other option and they lost: prettier moves a trailing comment onto its
   * own line, so the marker leaves the line before the guard reads it.
   */
  const shaped = {
    botToken: '1234567890' + ':' + 'AA' + 'x'.repeat(33),
    dbUrl: 'postgresql://user' + ':' + 'hunter2' + '@db.internal:5432/x',
    apiKey: 'sk' + '-' + 'a'.repeat(24),
    ghToken: 'ghp' + '_' + 'b'.repeat(30),
  }

  it('finds the shapes that actually leaked here', () => {
    withFile(`BOT_TOKEN_1=${shaped.botToken}`, p =>
      expect(kinds(p)).toContain('telegram bot token')
    )
    withFile(`DATABASE_URL=${shaped.dbUrl}`, p =>
      expect(kinds(p)).toContain('url with a password')
    )
    withFile(`KEY=${shaped.apiKey}`, p =>
      expect(kinds(p)).toContain('openai-style key')
    )
    withFile(`GITHUB_TOKEN=${shaped.ghToken}`, p =>
      expect(kinds(p)).toContain('github token')
    )
  })

  it('recognises a whole env dump by shape, not by any single value', () => {
    // The railway dump: individually unremarkable lines, damning together.
    const dump = Array.from(
      { length: 20 },
      (_, i) => `SOME_VARIABLE_${i}=some-value-that-is-long-enough`
    ).join('\n')
    withFile(dump, p =>
      expect(kinds(p).some(k => k.startsWith('env dump'))).toBe(true)
    )
  })

  it('a handful of settings is a config file, not a dump', () => {
    /*
     * The threshold is what separates the two, and it was UNTESTED: a mutant
     * that lowered it to one survived every other test here, because the
     * no-false-positive fixture below happens to contain no assignments at all.
     * A small config must stay quiet, or the scanner gets switched off and then
     * it is not a scanner.
     */
    const config = [
      'NODE_ENV=production',
      'API_PORT=3000',
      'LOG_LEVEL=info',
      'PUBLIC_URL=https://example.com',
    ].join('\n')
    withFile(config, p =>
      expect(kinds(p).some(k => k.startsWith('env dump'))).toBe(false)
    )
  })

  it('does not cry wolf over ordinary source and config', () => {
    // A scanner that fires on everything is turned off, and then it is not a
    // scanner. These are the shapes that live in this repository legitimately.
    withFile(
      [
        "const url = 'https://api.telegram.org/file/bot<token>/x.jpg'",
        'const sha = "a".repeat(64)',
        'export const PORT = 3000',
        "import { x } from '@/utils/logger'",
      ].join('\n'),
      p => expect(kinds(p)).toEqual([])
    )
  })

  it('NEVER returns the value, only where and how long', () => {
    // The report is meant to be pasted somewhere. A leak report that quotes the
    // leak has copied it once more.
    withFile(`T=${shaped.botToken}`, p => {
      const hits = scanFile(p) as Array<Record<string, unknown>>
      expect(hits.length).toBeGreaterThan(0)
      for (const h of hits) {
        expect(Object.keys(h).sort()).toEqual(['at', 'kind', 'len'])
        expect(JSON.stringify(h)).not.toContain(shaped.botToken)
      }
    })
  })
})
