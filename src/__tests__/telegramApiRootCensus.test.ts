import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * NOT ONE HARD-CODED BOT API HOST, AND NOT ONE CLIENT BUILT WITHOUT THE TOKEN'S HOST.
 *
 * A census, not a ratchet, and strict on purpose. A bot that has moved to our
 * own Bot API server must never be called on the cloud: the request logs it
 * back in there and its updates split between two servers, with nothing in any
 * log naming the call site. The failure is not "the debt grew"; it is "one
 * site was missed", and one is enough.
 *
 * THE ESCAPE HATCH IS NARROW AND WRITTEN DOWN
 *
 * A line that must keep the literal host -- a matcher recognising a cloud URL,
 * a message naming it, a scanner's fixture -- carries `telegram-api-root-ok`
 * on the line or the line above (prettier moves a trailing comment off an
 * `if (...) {`, and a guard a formatter can disarm is not a guard). Comment
 * lines are prose and are not counted: prose calls nothing.
 *
 * THE SCANNERS ARE TESTED THEMSELVES
 *
 * A census that finds nothing looks exactly like a census that looks at
 * nothing. So each scanner is first fed a planted offence it must report.
 */

const ROOT = resolve(__dirname, '..', '..')
const HOST = 'api.telegram.org'
const MARKER = 'telegram-api-root-ok'

/** The files whose job is to know the host. */
const HELPERS = [
  'src/services/telegramApi.ts',
  'apps/vibee-editor/render/src/telegram-api.ts',
  'scripts/lib/telegram-api.cjs',
]

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|sh|py|swift)$/
const isTest = (file: string) =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) ||
  file.includes('__tests__') ||
  file.startsWith('src/tests/')
const outOfScope = (file: string) =>
  file.startsWith('.claude/') || file.startsWith('docs/')

function isCommentLine(file: string, line: string): boolean {
  if (/^\s*(\/\/|\*|\/\*)/.test(line)) return true
  return /\.(sh|py)$/.test(file) && /^\s*#/.test(line)
}

/** Lines of one file that write the host by hand. */
export function hostOffences(file: string, text: string): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  lines.forEach((line, i) => {
    if (!line.includes(HOST)) return
    if (isCommentLine(file, line)) return
    if (line.includes(MARKER) || (lines[i - 1] ?? '').includes(MARKER)) return
    out.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`)
  })
  return out
}

/**
 * `new Telegraf(...)` / `new Telegram(...)` built without the token's host.
 *
 * The arguments are read up to the MATCHING parenthesis, not "the next few
 * lines": with a fixed window, a bare construction followed by a correct one
 * borrows its neighbour's options and passes -- the self-check below found
 * exactly that.
 */
export function constructionOffences(file: string, text: string): string[] {
  const out: string[] = []
  const opening = /new (Telegraf|Telegram)\s*(<[^>()]*>)?\s*\(/g
  let m: RegExpExecArray | null
  while ((m = opening.exec(text))) {
    const lineStart = text.lastIndexOf('\n', m.index) + 1
    const lineEnd = text.indexOf('\n', m.index)
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
    if (isCommentLine(file, line)) continue
    let depth = 0
    let end = m.index + m[0].length - 1
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++
      else if (text[end] === ')' && --depth === 0) break
    }
    const args = text.slice(m.index + m[0].length, end)
    if (/telegramClientOptionsFor\(|telegramApiRootFor\(/.test(args)) continue
    const lineNo = text.slice(0, m.index).split('\n').length
    out.push(`${file}:${lineNo}  ${line.trim().slice(0, 100)}`)
  }
  return out
}

function git(args: string[]): string[] {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    // git grep exits 1 when nothing matches.
    return []
  }
}

const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8')

describe('the scanners can see an offence', () => {
  it('a planted host is reported; a marked one, a comment and a test are not', () => {
    const planted = [
      'const url = `https://api.telegram.org/bot${token}/sendMessage`',
      '// see https://api.telegram.org for prose',
      ' * prose inside a block comment: api.telegram.org',
      '// telegram-api-root-ok: a matcher',
      "if (u.includes('api.telegram.org/file/bot')) {",
      '  curl "https://api.telegram.org/bot$T/getMe"',
    ].join('\n')
    expect(hostOffences('src/x.ts', planted)).toEqual([
      expect.stringContaining('src/x.ts:1'),
      expect.stringContaining('src/x.ts:6'),
    ])
    expect(
      hostOffences('loop/x.sh', '# api.telegram.org in a shell comment')
    ).toEqual([])
  })

  it('a client built without the host is reported', () => {
    const planted = [
      'const a = new Telegraf(token)',
      'const b = new Telegraf<MyContext>(token, {',
      '  telegram: telegramClientOptionsFor(token),',
      '})',
      'const c = new Telegram(token, { apiRoot: telegramApiRootFor(token) })',
      '// new Telegraf(token) in prose',
    ].join('\n')
    expect(constructionOffences('src/y.ts', planted)).toEqual([
      expect.stringContaining('src/y.ts:1'),
    ])
  })
})

describe('the Bot API host lives in one place', () => {
  it('no code writes api.telegram.org by hand', () => {
    const files = git(['grep', '-l', '-F', HOST]).filter(
      f => CODE.test(f) && !isTest(f) && !outOfScope(f) && !HELPERS.includes(f)
    )
    const offences = files.flatMap(f => hostOffences(f, read(f)))
    expect(
      offences,
      'These lines write the Bot API host by hand. For a bot moved to our own ' +
        'server each one is a call that logs it back into the cloud.\n' +
        'Use telegramApiFor(token) / telegramFileUrlFor(token, path) ' +
        '(render: src/telegram-api.ts, scripts: scripts/lib/telegram-api.cjs), ' +
        `or mark the line "${MARKER}" if it is a matcher or a message, not a call.\n\n` +
        offences.join('\n')
    ).toEqual([])
  })

  it('every Telegraf client is built with the host of its own token', () => {
    // Fixed strings, not -E: an alternation over the whole tree is slow
    // enough to time out under a loaded run; the exact shape is checked below.
    const rows = git([
      'grep',
      '-l',
      '-F',
      '-e',
      'new Telegraf',
      '-e',
      'new Telegram',
    ])
    const files = rows.filter(f => CODE.test(f) && !isTest(f) && !outOfScope(f))
    expect(
      files.length,
      'the scan found no construction at all'
    ).toBeGreaterThan(5)
    const offences = files.flatMap(f => constructionOffences(f, read(f)))
    expect(
      offences,
      'These clients talk to the cloud whatever BOT_API_LOCAL_BOTS says. Add\n' +
        '  telegram: telegramClientOptionsFor(token)\n' +
        'to the options:\n\n' +
        offences.join('\n')
    ).toEqual([])
  })

  it('the helpers are where the host lives, and callers use them', () => {
    for (const helper of HELPERS) expect(read(helper)).toContain(HOST)
    const callers = git([
      'grep',
      '-l',
      '-F',
      '-e',
      'telegramApiFor(',
      '-e',
      'telegramFileUrlFor(',
      '-e',
      'telegramFileLink(',
    ]).filter(f => !isTest(f) && !HELPERS.includes(f))
    expect(callers.length).toBeGreaterThan(30)
  })
})

describe('both services check the configuration before the first call', () => {
  it('the bot: assert, then teach getFileLink, then discover tokens', () => {
    const src = read('src/index.ts')
    const start = src.indexOf('async function initializeBots()')
    const body = src.slice(start)
    const assertAt = body.indexOf('assertBotApiConfig()')
    const installAt = body.indexOf('installLocalFileLinks(Telegram)')
    const discoverAt = body.indexOf('discoverBotTokenEntries()')
    expect(start).toBeGreaterThan(-1)
    expect(assertAt).toBeGreaterThan(-1)
    expect(installAt).toBeGreaterThan(-1)
    expect(assertAt).toBeLessThan(discoverAt)
    expect(installAt).toBeLessThan(discoverAt)
  })

  it('the render: assert before anything else in main()', () => {
    const src = read('apps/vibee-editor/render/render-server.ts')
    const body = src.slice(src.indexOf('async function main()'))
    const assertAt = body.indexOf('assertBotApiConfig()')
    expect(assertAt).toBeGreaterThan(-1)
    expect(assertAt).toBeLessThan(body.indexOf('startSessionRevocationSync()'))
  })
})
