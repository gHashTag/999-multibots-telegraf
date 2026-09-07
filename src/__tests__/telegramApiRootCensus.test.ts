import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * NOT ONE HARD-CODED BOT API HOST IS LEFT ANYWHERE.
 *
 * This is a census, not a ratchet, and it is strict on purpose.
 *
 * Telegram's own rule makes it necessary: a bot that has called `logOut` on the
 * cloud API works ONLY through a local Bot API server afterwards. There is no
 * fallback, no mixed mode, no per-call choice. So the day the platform moves in
 * order to lift the 20 MB `getFile` ceiling, every call site moves at once --
 * and a single `https://api.telegram.org` left in one scene is a bot that
 * answers "Unauthorized" forever, with nothing in the log naming the file.
 *
 * A ratchet on added lines would not do. The failure is not "the debt grew"; it
 * is "one site was missed", and one is enough.
 *
 * THE ESCAPE HATCH IS DELIBERATE AND NARROW
 *
 * Some appearances of the host are not call sites and must keep the literal
 * text: a redactor that strips tokens out of logs, a parser that recognises the
 * host in somebody else's string, a comment explaining the whole arrangement.
 * Those carry the marker below on the same line, which makes each exception a
 * decision somebody wrote down rather than an oversight.
 */

const ROOT = resolve(__dirname, '..', '..')
const HOST = 'api.telegram.org'
const MARKER = 'telegram-api-root-ok'

/** The two files whose job is to know the host. */
const HELPERS = [
  'src/services/telegramApi.ts',
  'apps/vibee-editor/render/src/telegram-api.ts',
]

function trackedFiles(): string[] {
  const out = execFileSync(
    'git',
    ['grep', '-l', HOST, '--', 'src/', 'apps/', 'scripts/'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  )
  return out.split('\n').filter(Boolean)
}

describe('the Bot API host lives in one place', () => {
  it('no call site writes api.telegram.org by hand', () => {
    const offences: string[] = []

    for (const file of trackedFiles()) {
      if (HELPERS.includes(file)) continue
      // Tests may name the host freely: they assert about it, they do not call
      // it, and a test that cannot mention the thing it tests is useless.
      if (/\.test\.[cm]?[jt]sx?$/.test(file) || file.includes('__tests__')) {
        continue
      }

      const lines = readFileSync(resolve(ROOT, file), 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!line.includes(HOST)) return
        /*
         * The marker counts on the line itself OR the line above it. Prettier
         * moves a trailing comment off the end of an `if (...) {` onto the next
         * line, and a guard that a formatter can silently disarm is not a
         * guard.
         */
        if (line.includes(MARKER)) return
        if ((lines[i - 1] ?? '').includes(MARKER)) return
        offences.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`)
      })
    }

    expect(
      offences,
      'Эти строки зашивают адрес Bot API. После перехода на свой сервер ' +
        'каждая из них — молча умерший бот.\n' +
        `Используйте telegramApiFor(token) / telegramFileApiFor(token), ` +
        `либо пометьте строку «${MARKER}», если это не вызов, а разбор ` +
        'или пояснение.\n\n' +
        offences.join('\n')
    ).toEqual([])
  })

  /*
   * The other half of the same migration. A bot built without the option talks
   * to the cloud whatever the variable says -- and is therefore dead after
   * `logOut`, while every other bot in the same process works.
   */
  it('every bot is constructed with the configured api root', () => {
    const out = execFileSync(
      'git',
      ['grep', '-n', 'new Telegraf', '--', 'src/', 'apps/'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )

    const offences: string[] = []
    for (const row of out.split('\n').filter(Boolean)) {
      const [file, lineNo] = row.split(':')
      if (/\.test\.[cm]?[jt]sx?$/.test(file) || file.includes('__tests__')) {
        continue
      }
      const lines = readFileSync(resolve(ROOT, file), 'utf8').split('\n')
      const at = Number(lineNo) - 1
      const text = lines[at] ?? ''
      // A mention inside a comment or a log string is not a construction.
      if (!/new Telegraf\s*[<(]/.test(text)) continue
      if (/^\s*(\/\/|\*|\/\*)/.test(text)) continue

      // The options may sit on the same line or on the next few.
      const window = lines.slice(at, at + 8).join('\n')
      if (!window.includes('telegramClientOptions')) {
        offences.push(`${file}:${lineNo}  ${text.trim().slice(0, 90)}`)
      }
    }

    expect(
      offences,
      'Эти боты создаются без настроенного адреса API и после перехода ' +
        'замолчат.\nДобавьте telegram: telegramClientOptions() в опции:\n\n' +
        offences.join('\n')
    ).toEqual([])
  })
})
