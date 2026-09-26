import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE QUEEN'S TRI TAB FRAMES THIS APP FROM https://t27.ai.
 *
 * nginx drops inherited add_header lines in any location that sets its own,
 * so the policy is written three times: at server level, inside
 * `location = /index.html`, and inside `location /live/`. Deep routes
 * (/chat, /feed?post=...) reach /index.html through try_files and get the
 * second copy; the remote browser is framed by the app itself and gets the
 * third. Editing one line and forgetting the others leaves half the routes
 * refusing the frame, and the game then shows its "did not answer" strip on
 * exactly those screens.
 */

const TEMPLATE = path.resolve(__dirname, '../../../nginx/default.conf.template')

/** Every problem with the policy lines, as text; empty means the file is right. */
function problems(conf: string): string[] {
  // Locations that carry their own policy are removed before counting, and
  // each is pinned whole by a test of its own -- otherwise this checker would
  // demand https://t27.ai on a line whose entire point is not to have it:
  //  - the bridge, frame-ancestors https://t27.ai only, and the consent popup
  //    'none' (bridge-nginx.test.ts);
  //  - /pair, the sign-in code, Telegram only (pair-nginx.test.ts);
  //  - the Queen board, 'self' and Telegram but NOT t27.ai (queen-nginx.test.ts).
  //    It moved here FROM t27.ai, and the move is what disqualifies it from
  //    this list: on t27.ai it held a 300-second token good for two tools,
  //    here it reads the app's session. A credential-wielding page, like the
  //    two above. t27.ai does not need to frame it — the old address redirects.
  const lines = conf
    .replace(
      /\n {4}location (= \/bridge|= \/bridge\/consent\.html|\^~ \/bridge\/|~ \^\/pair\/\?\$|\^~ \/queen\/) \{\n[\s\S]*?\n {4}\}\n/g,
      '\n'
    )
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^add_header\s+Content-Security-Policy\b/.test(l))
  const out: string[] = []
  /*
   * THREE since 2026-09-20: the server level, `location = /index.html`, and
   * `location /live/` -- the person's own remote browser, which the app
   * frames itself and so must admit 'self' and the same origins.
   *
   * The count is kept rather than replaced by "check whatever lines exist":
   * it is what catches a line being DELETED, which is how half the routes
   * would quietly stop allowing the frame. /live/ is declared after
   * /index.html on purpose, so the negative control below still means the
   * /index.html copy when it says "line 2".
   *
   * FOUR since 2026-09-26: `location = /queen`, the app's own address for the
   * Queen's board (owner: "embed the board into the app"). It serves the
   * app's index.html, so it carries the app's policy, t27.ai included.
   */
  if (lines.length !== 4) {
    out.push(`expected 4 Content-Security-Policy lines, found ${lines.length}`)
  }
  lines.forEach((line, i) => {
    const directive = line.match(/frame-ancestors([^;"]*)/)
    const sources = directive ? directive[1].trim().split(/\s+/) : []
    if (!sources.includes('https://t27.ai')) {
      out.push(`line ${i + 1} does not allow https://t27.ai: ${line}`)
    }
    if (!sources.includes('https://web.telegram.org')) {
      out.push(`line ${i + 1} no longer allows Telegram Web: ${line}`)
    }
  })
  return out
}

describe('app.t27.ai may be framed by the game on t27.ai', () => {
  const conf = fs.readFileSync(TEMPLATE, 'utf8')

  it('every policy line allows https://t27.ai and still allows Telegram Web', () => {
    expect(problems(conf)).toEqual([])
  })

  it('the checker catches a template where only the server-level line was edited', () => {
    // Negative control for the checker itself: put back the old value on the
    // copy inside `location = /index.html` only.
    const old =
      "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org;"
    const idx = conf.indexOf('location = /index.html')
    expect(idx).toBeGreaterThan(0)
    const tail = conf
      .slice(idx)
      .replace(/frame-ancestors [^"]*/, old.replace(/"$/, ''))
    const broken = conf.slice(0, idx) + tail
    const found = problems(broken)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatch(/^line 2 does not allow https:\/\/t27\.ai/)
  })

  it('does not add www.t27.ai, which only redirects to the apex', () => {
    const policies = conf
      .split('\n')
      .filter(l => /^\s*add_header\s+Content-Security-Policy\b/.test(l))
    expect(policies.join('\n')).not.toContain('www.t27.ai')
  })
})
