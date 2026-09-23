/**
 * NO RAW APP HOST IN WHAT THE BOT OR THE RENDER SAYS TO A PERSON.
 *
 * Owner, 2026-09-22: "links must open inside Telegram; outside Telegram they
 * do not open, so they do not work". The app (app.t27.ai, the same bundle as
 * vibee-editor-production on Railway) knows who is looking only from
 * Telegram's signed launch data; a plain link opened in a phone browser has
 * none. A link to the app goes out as `appLinkFor(bot, route)` (bot:
 * src/navigation/helpers/appLinks.ts; render: render/src/app-links.ts) or as
 * a web_app button in a private chat -- never as the bare host.
 *
 * This reads the CODE of src/ and the render (comments stripped, tests
 * skipped) and fails on any app host outside the allow-list below, each entry
 * with the reason it is not a link a person receives. One line elsewhere may
 * carry its own reason as `// app-link-ok: <why>`.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '..', '..', '..')

const HOST_RE = /app\.t27\.ai|vibee-editor-production\.up\.railway\.app/i

/** Block-comment markers built from pieces: a literal pair in this file's
 * own source would end the doc comment it sits in. */
const BLOCK_OPEN = '/' + '*'
const BLOCK_CLOSE = '*' + '/'

/** Files that may name the host, and why each is not a link to a person. */
export const ALLOWED: Record<string, string> = {
  'src/navigation/config/miniApp.config.ts':
    'MINI_APP_URL default: the target of web_app buttons (private chats) and the menu button, never text',
  'src/navigation/helpers/appLinks.ts':
    'APP_HOSTS: the list the safety net rewrites FROM',
  'apps/vibee-editor/render/src/app-links.ts':
    'APP_HOSTS mirror: the list the render safety net rewrites FROM',
  'apps/vibee-editor/render/src/agent/web-guard.ts':
    "the web tools' own-host deny list: internal, never shown",
  'apps/vibee-editor/render/src/browser/announce.ts':
    'BROWSER_TAB_URL: only ever the url of a web_app button, which opens inside Telegram',
  'apps/vibee-editor/render/src/agent/botfather-main-app.ts':
    'APP_HOSTS: the hosts a Main Mini App URL may point at, checked before BotFather is told; never text to a person',
  'apps/vibee-editor/render/src/auth/refresh-cookie.ts':
    'APP_ORIGIN: the Origin header the sign-in doors accept credentialed calls from; never a link',
}

const TREES = ['src', 'apps/vibee-editor/render/src']
const EXTRA_FILES = ['apps/vibee-editor/render/render-server.ts']

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (['node_modules', '__tests__', 'test', 'tests'].includes(e.name))
        continue
      walk(p, out)
    } else if (
      /\.(ts|tsx|js|cjs|mjs)$/.test(e.name) &&
      !/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name)
    ) {
      out.push(p)
    }
  }
}

/**
 * Index just past the closing quote, or -1 when this quote opens no string.
 * A single- or double-quoted string cannot span a line, so an apostrophe in
 * prose (an English contraction in JSX text) opens nothing and must not
 * swallow the rest of the file.
 */
function endOfString(src: string, start: number): number {
  const quote = src[start]
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') {
      i++
      continue
    }
    if (c === quote) return i + 1
    if (c === '\n' && quote !== '`') return -1
  }
  return -1
}

/**
 * The code of a file with comments removed, line numbers kept.
 *
 * ONE SCAN, LEFT TO RIGHT -- not block comments first and line comments
 * second. That order let a block-comment opener written INSIDE a line comment
 * open a block that ran to the next closer anywhere further down the file,
 * blanking every real line between them. Whatever those lines said, the scan
 * below could not see it: the guard silently stopped covering the code it is
 * pointed at, which is the one failure a guard cannot report about itself.
 * Found in the review of #2870.
 *
 * Strings are stepped over rather than stripped: the link a person receives
 * lives in one, so their contents ARE the code this guard reads.
 */
export function codeOnly(src: string): string {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (c === "'" || c === '"' || c === '`') {
      const end = endOfString(src, i)
      if (end > i) {
        out += src.slice(i, end)
        i = end
        continue
      }
      out += c
      i++
      continue
    }
    if (c === '/' && next === '*') {
      // Blanked, not deleted: the line numbers reported below stay right.
      i += 2
      out += '  '
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += '  '
        i += 2
      }
      continue
    }
    // A line comment starts at `//` at the line start or after whitespace;
    // the `//` of an https URL follows a colon and is not one.
    if (c === '/' && next === '/' && (i === 0 || /\s/.test(src[i - 1]))) {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    out += c
    i++
  }
  return out
}

function offenders(): string[] {
  const files: string[] = []
  for (const t of TREES) walk(path.join(ROOT, t), files)
  for (const f of EXTRA_FILES) files.push(path.join(ROOT, f))
  const out: string[] = []
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/')
    if (ALLOWED[rel]) continue
    const lines = codeOnly(fs.readFileSync(f, 'utf8')).split('\n')
    const raw = fs.readFileSync(f, 'utf8').split('\n')
    lines.forEach((l, i) => {
      // A single line may carry its own reason: `// app-link-ok: <why>`.
      if (/app-link-ok:\s*\S/.test(raw[i] ?? '')) return
      if (HOST_RE.test(l))
        out.push(`${rel}:${i + 1}: ${l.trim().slice(0, 120)}`)
    })
  }
  return out
}

describe('links to the app open inside Telegram', () => {
  it('no raw app host in the code of the bot or the render', () => {
    expect(
      offenders(),
      'use appLinkFor(bot, route) or a web_app button; see .claude/skills/links-open-in-telegram/SKILL.md'
    ).toEqual([])
  })

  it('every allow-listed file exists and still names the host (no stale entries)', () => {
    for (const rel of Object.keys(ALLOWED)) {
      const src = codeOnly(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
      expect(HOST_RE.test(src), rel).toBe(true)
    }
  })

  it('the stripper keeps a URL in code and drops one in a comment', () => {
    expect(codeOnly("const a = 'https://app.t27.ai/x' // app.t27.ai")).toBe(
      "const a = 'https://app.t27.ai/x' "
    )
    expect(
      HOST_RE.test(codeOnly(BLOCK_OPEN + ' app.t27.ai ' + BLOCK_CLOSE))
    ).toBe(false)
    expect(HOST_RE.test(codeOnly(' * app.t27.ai in a doc comment'))).toBe(true)
  })

  /*
   * The stripper used to run the block rule over the whole file first. A
   * block opener typed inside a LINE comment then opened a block that ran to
   * the next closer further down, and every real line between them was
   * blanked -- invisible to the scan. Measured over this repository on
   * 2026-09-23: 8 files, 453 lines of real code, skin.ts alone 336.
   */
  it('a block opener inside a line comment hides nothing below it', () => {
    const src = [
      'const a = 1 // note: ' + BLOCK_OPEN + ' see below',
      "const url = 'https://app.t27.ai/hive'",
      'const b = 2 ' + BLOCK_OPEN + ' a real block ' + BLOCK_CLOSE,
    ].join('\n')
    const stripped = codeOnly(src)
    expect(HOST_RE.test(stripped)).toBe(true)
    // Line numbers survive, or every offender is reported at the wrong line.
    expect(stripped.split('\n')).toHaveLength(3)
    expect(stripped.split('\n')[1]).toContain('app.t27.ai')
  })

  it('a line-comment marker inside a block comment does not end the block', () => {
    const src = [
      BLOCK_OPEN,
      ' * see app.t27.ai // and app.t27.ai again',
      ' ' + BLOCK_CLOSE,
      'const c = 3',
    ].join('\n')
    expect(HOST_RE.test(codeOnly(src))).toBe(false)
  })

  it('a string keeps its contents, comment markers and all', () => {
    const src = "const s = 'a // b " + BLOCK_OPEN + " c'"
    expect(codeOnly(src)).toBe(src)
  })

  it('an apostrophe in prose does not swallow the rest of the file', () => {
    // A contraction in JSX text is not a string opener; if it were taken for
    // one, every line after it would be read as string contents.
    const src = [
      "const t = <p>don't</p>",
      "const u = 'https://app.t27.ai/hive'",
    ].join('\n')
    const stripped = codeOnly(src)
    expect(HOST_RE.test(stripped)).toBe(true)
    expect(stripped.split('\n')).toHaveLength(2)
  })
})
