import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { safeUnder } from './src/lib/safe-path'

/**
 * THE STATIC ROUTES SERVED WHATEVER THE URL NAMED.
 *
 * Found by an adversarial sweep on 2026-09-20 and reproduced against a copy of
 * the handler. `/renders/`, `/public/` and `/hls/` are all in PUBLIC_PREFIXES,
 * so `authenticate` returns `via: 'public'` before any check runs -- and the
 * handlers did `path.join(ROOT, rest)` with no validation at all.
 *
 * `path.join` RESOLVES `..`, so
 *
 *   curl --path-as-is https://host/renders/../../../etc/passwd
 *
 * read that file and served it, to anybody, with no credential.
 *
 * The rule now lives in `safeUnder`, which is per SEGMENT rather than on the
 * joined string -- a check on the joined string is a check on something
 * `path.join` has already collapsed.
 *
 * This file imports the REAL rule -- an earlier version mirrored it here, and
 * deleting the `..` check from the source passed untouched, because a double
 * that reimplements a rule proves nothing about the rule. It also asserts that
 * every static handler in render-server.ts actually goes through it. A rule nobody
 * calls is a comment; that lesson is one commit old here (safeJoin, #2623).
 */

const ROOT = '/workspace/render/out'

describe('a static path stays under its root', () => {
  /*
   * THE ATTACK VERBATIM, plus the control that the old expression really did
   * escape -- so a refactor back to path.join fails on the attack itself.
   */
  it('refuses the traversal that read /etc/passwd', () => {
    expect(safeUnder(ROOT, '../../../etc/passwd')).toBeNull()
    expect(path.join(ROOT, '../../../etc/passwd')).toBe('/etc/passwd')
  })

  it('refuses every other spelling of out', () => {
    for (const bad of [
      '..',
      '../render-server.ts',
      '%2e%2e/%2e%2e/etc/passwd',
      '%2E%2E%2Fsecrets',
      'a/../../b',
      '..%2fetc%2fpasswd',
      '',
      '/',
      'sub/../../../etc/passwd',
    ]) {
      expect(safeUnder(ROOT, bad), bad).toBeNull()
    }
  })

  /*
   * A BROKEN ENCODING IS A REFUSAL, NOT A FALLBACK. Falling back to the raw
   * text is how a decoder becomes an attacker's second chance.
   */
  it('refuses a percent-encoding it cannot decode', () => {
    expect(safeUnder(ROOT, '%E0%A4%A')).toBeNull()
  })

  /*
   * AND IT STILL SERVES WHAT THE ROUTES ARE FOR, including nested paths --
   * an HLS playlist lives at /hls/<id>/segment.ts.
   */
  it('still serves an ordinary file and a nested one', () => {
    expect(safeUnder(ROOT, 'reel-123.mp4')).toBe(`${ROOT}/reel-123.mp4`)
    expect(safeUnder(ROOT, 'abc/segment-1.ts')).toBe(`${ROOT}/abc/segment-1.ts`)
    expect(safeUnder(ROOT, 'covers/a%20b.png')).toBe(`${ROOT}/covers/a b.png`)
  })
})

describe('every static handler actually calls the rule', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, 'render-server.ts'),
    'utf8'
  )

  /*
   * A GUARD NOBODY CALLS IS A COMMENT. `safeJoin` sat in this same file,
   * written for exactly this shape, called from nowhere, while /cdn/upload
   * read /proc/self/environ. Named here so the next reader sees why this
   * assertion exists.
   */
  it('leaves no path.join on a request-supplied static path', () => {
    const offenders: string[] = []
    for (const [i, line] of source.split('\n').entries()) {
      const code = line.trim()
      // A comment quoting the old expression is not the old expression. The
      // first version of this test flagged its own explanation.
      if (code.startsWith('*') || code.startsWith('//')) continue
      if (!/path\.join\(/.test(code)) continue
      if (!/urlPath|req\.url|hlsPath|filename|video_url/.test(code)) continue
      /*
       * `safeUnder(path.join(cwd, 'public'), urlPath)` is the FIXED shape:
       * path.join builds the ROOT, and the request-supplied part goes through
       * the rule. What is forbidden is the request path reaching path.join
       * itself.
       */
      if (/safeUnder\(|safeJoin\(/.test(code)) continue
      offenders.push(`${i + 1}: ${code.slice(0, 90)}`)
    }
    expect(offenders, 'a request path is joined without safeUnder').toEqual([])
  })

  it('no longer lists the whole farm at GET /assets', () => {
    expect(source).not.toMatch(
      /req\.url === '\/assets' && req\.method === 'GET'/
    )
  })
})
