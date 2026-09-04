import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A Neon Postgres connection string WITH ITS PASSWORD was hardcoded as the
 * fallback for NEON_DATABASE_URL:
 *
 *   connectionString: process.env.NEON_DATABASE_URL || 'postgresql://...@...'
 *
 * So a missing variable did not fail -- it connected to a real database using
 * a credential committed to the repository. The same file already refuses when
 * that variable is absent, twice, further down: two opposite decisions about
 * one failure, in one file.
 *
 * It survived because the secret guard did not know the shape. Its table knew
 * Telegram tokens, OpenAI keys, JWTs, PEM blocks and a Fal.ai key, but nothing
 * about a password embedded in a URL, so the string passed every commit.
 *
 * Two things are pinned here, because either alone rots:
 *
 *  - the absence: no source file carries a connection string with a password;
 *  - the enforcer: the guard's own table still contains a rule that catches
 *    the shape. Without this, the rule could be deleted and the first check
 *    would keep passing until someone reintroduced a credential.
 *
 * The credential itself must still be ROTATED -- it is in git history, and
 * removing a line does not unpublish it. That is owner item 19.
 */

const ROOT = path.resolve(__dirname, '../../..')

/** scheme, name, colon, password, at-sign, host. */
const EMBEDDED_PASSWORD = /[a-z][a-z0-9+.-]*:\/\/[a-z0-9_.%-]+:[^@\s"'`/]{6,}@/i

/**
 * The positive sample, assembled rather than written. Spelled out as a literal
 * it would sit in a file under src/ and the whole-tree check below would match
 * ITSELF -- which is exactly what happened on the first run. The password is
 * invented; the shape is the real one.
 */
const SAMPLE = [
  'postgresql://neondb_owner',
  'notarealpw123@ep-x.neon.tech/db',
].join(':')

/**
 * The repository's existing escape hatch, honoured by scripts/security-guard at
 * commit time: a deliberate sample carries `secret-guard-ok: reason` on the
 * SAME line. Assembled here for the same reason SAMPLE is.
 */
const MARKER = ['secret', 'guard', 'ok'].join('-')

/** Lines that carry an embedded credential and are not excused. */
const offendingLines = (src: string): string[] =>
  src.split('\n').filter(l => EMBEDDED_PASSWORD.test(l) && !l.includes(MARKER))

const sourceFiles = (): string[] => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(rel)
      } else if (e.name.endsWith('.ts')) out.push(rel)
    }
  }
  walk('src')
  return out
}

describe('credentials embedded in connection strings', () => {
  it('the matcher recognises the shape and spares ordinary URLs', () => {
    // Control. Without it, a matcher that matched nothing would report the
    // whole tree clean -- the exact failure this file exists to prevent, and
    // one the guard itself demonstrated by having no rule at all.
    expect(EMBEDDED_PASSWORD.test(SAMPLE)).toBe(true)
    for (const harmless of [
      'https://api.example.com/v1/thing',
      'https://api.example.com:8080/path',
      'postgres://localhost:5432/db',
      'https://user@example.com/profile',
    ]) {
      expect(EMBEDDED_PASSWORD.test(harmless), harmless).toBe(false)
    }
  })

  it('spares a line carrying the repository escape marker, and only that line', () => {
    // Control for the exemption below, in both directions. An exemption with no
    // negative is a hole with a comment on it.
    expect(offendingLines(`const s = '${SAMPLE}'`)).toHaveLength(1)
    expect(
      offendingLines(`const s = '${SAMPLE}' // ${MARKER}: invented sample`)
    ).toHaveLength(0)
    // The marker excuses ITS OWN line, not the file around it.
    expect(
      offendingLines(
        `const ok = '' // ${MARKER}: reason\nconst bad = '${SAMPLE}'`
      )
    ).toHaveLength(1)
  })

  it('appears in no source file', () => {
    // This shipped RED and stayed red, because the author fixed the instance
    // they tripped on instead of the class: the header above records that the
    // check matched its own literal sample and was solved by assembling that
    // one string at runtime. Nobody then asked which OTHER file holds the same
    // shape -- and no-secrets-in-repo.test.ts does, in the table of invented
    // samples that proves the COMMIT guard recognises each secret shape.
    //
    // That sample is already excused by the repository's own convention, the
    // `secret-guard-ok: reason` marker the commit guard honours. This check
    // simply did not know about it. Honouring the existing marker keeps the
    // population whole -- test files are still scanned, because a real
    // credential parked in a test leaks exactly as hard as one in production.
    const files = sourceFiles()
    expect(files.length, 'file walk must find sources').toBeGreaterThan(300)
    const offenders = files.filter(
      f => offendingLines(fs.readFileSync(path.join(ROOT, f), 'utf8')).length
    )
    expect(offenders).toEqual([])
  })

  it('is still refused by the commit guard', () => {
    // The enforcer. Reads the guard's OWN pattern table rather than restating
    // the rule, so deleting the rule fails here instead of silently removing
    // the protection.
    const guard = fs.readFileSync(
      path.join(ROOT, 'scripts/security-token-guard.sh'),
      'utf8'
    )
    const block = guard.match(/declare -a PATTERNS=\(([\s\S]*?)\n\)/)
    expect(block, 'guard must declare a PATTERNS array').toBeTruthy()

    const patterns = (block as RegExpMatchArray)[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith("'") && l.endsWith("'"))
      .map(l => l.slice(1, -1))
      // The guard is grep -E; POSIX classes have no JS equivalent spelling.
      .map(l => l.replace(/\[:space:\]/g, '\\s'))

    expect(patterns.length, 'patterns must parse').toBeGreaterThan(5)

    const catchers = patterns.filter(p => {
      try {
        return new RegExp(p, 'i').test(SAMPLE)
      } catch {
        return false
      }
    })
    expect(
      catchers.length,
      'no rule in the guard catches a password embedded in a URL'
    ).toBeGreaterThanOrEqual(1)
  })

  it('does not fire the guard on an ordinary URL', () => {
    // Pins the rule's other side. A rule broadened until it matched every URL
    // would pass the check above and make the guard unusable, which is how a
    // guard gets switched off for real.
    const guard = fs.readFileSync(
      path.join(ROOT, 'scripts/security-token-guard.sh'),
      'utf8'
    )
    const block = guard.match(
      /declare -a PATTERNS=\(([\s\S]*?)\n\)/
    ) as RegExpMatchArray
    const patterns = block[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith("'") && l.endsWith("'"))
      .map(l => l.slice(1, -1).replace(/\[:space:\]/g, '\\s'))

    const innocent = "const api = 'https://api.example.com/v1/generate'"
    const firing = patterns.filter(p => {
      try {
        return new RegExp(p, 'i').test(innocent)
      } catch {
        return false
      }
    })
    expect(firing).toEqual([])
  })
})
