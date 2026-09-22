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

/** The code of a file with comments removed, line numbers kept. */
export function codeOnly(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, m =>
    m.replace(/[^\n]/g, ' ')
  )
  // A line comment starts at `//` preceded by the line start or whitespace;
  // the `//` of `https://` is preceded by `:` and stays.
  return noBlocks
    .split('\n')
    .map(l => l.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
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
    expect(HOST_RE.test(codeOnly('/* app.t27.ai */ const b = 1'))).toBe(false)
    expect(HOST_RE.test(codeOnly(' * app.t27.ai in a doc comment'))).toBe(true)
  })
})
