import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE QUEEN'S TRI TAB FRAMES THIS APP FROM https://t27.ai.
 *
 * nginx drops inherited add_header lines in any location that sets its own,
 * so the policy is written twice: at server level and inside
 * `location = /index.html`. Deep routes (/chat, /feed?post=...) reach
 * /index.html through try_files and get the second copy. Editing one line and
 * forgetting the other leaves half the routes refusing the frame, and the
 * game then shows its "did not answer" strip on exactly those screens.
 */

const TEMPLATE = path.resolve(__dirname, '../../../nginx/default.conf.template')

/** Every problem with the policy lines, as text; empty means the file is right. */
function problems(conf: string): string[] {
  // Locations that carry their own policy are removed before counting, and
  // each is pinned whole by a test of its own -- otherwise this checker would
  // demand https://t27.ai on a line whose entire point is not to have it:
  //  - the bridge, frame-ancestors https://t27.ai only, and the consent popup
  //    'none' (bridge-nginx.test.ts);
  //  - /pair, the sign-in code, Telegram only (pair-nginx.test.ts).
  const lines = conf
    .replace(
      /\n {4}location (= \/bridge|= \/bridge\/consent\.html|\^~ \/bridge\/|~ \^\/pair\/\?\$) \{\n[\s\S]*?\n {4}\}\n/g,
      '\n'
    )
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^add_header\s+Content-Security-Policy\b/.test(l))
  const out: string[] = []
  if (lines.length !== 2) {
    out.push(`expected 2 Content-Security-Policy lines, found ${lines.length}`)
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

  it('both policy lines allow https://t27.ai and still allow Telegram Web', () => {
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
