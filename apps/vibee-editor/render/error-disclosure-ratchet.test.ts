import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The public render server must not leak raw internal error strings to clients.
 *
 * WHAT WAS WRONG. Five 500/502 catch blocks logged the error server-side
 * (console.error) — good — but ALSO returned `{ error: String(error) }` to the
 * client. On a public service that reveals internal details (DB errors, driver
 * messages, internal hostnames) to anyone who can trigger a 500.
 *
 * The fix returns a generic message per endpoint; the server-side console.error
 * keeps the detail for ops. This ratchet keeps the class closed: no response may
 * embed String(error) again.
 */
const SERVER = path.join(__dirname, 'render-server.ts')

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

describe('render server does not leak raw error strings to clients', () => {
  it('no response embeds a raw error string, under ANY variable name', () => {
    /*
     * ХРАПОВИК ЛОВИЛ НАПИСАНИЕ, А НЕ УТЕЧКУ.
     *
     * Он искал буквальное `error: String(error)`. На чистом дереве рядом
     * жили ВОСЕМЬ `error: String(e)` — та же утечка под именем в одну букву,
     * — и храповик был зелёным. Проверено в обе стороны: вписать
     * `String(error)` в обработчик — краснеет; переименовать переменную в
     * `e` — зеленеет, а утечка на месте.
     *
     * Имя переменной ничего не решает: наружу уходит текст исключения, а с
     * ним пути файлов, имена таблиц и куски запросов.
     */
    const s = stripComments(fs.readFileSync(SERVER, 'utf8'))
    const hits = [
      ...s.matchAll(/error:\s*String\(\s*\w+\s*\)/g),
      ...s.matchAll(/error:\s*`[^`]*\$\{\s*String\(\s*\w+\s*\)/g),
      ...s.matchAll(/error:\s*\w+\s*\.\s*message\b/g),
    ]
    expect(
      hits.length,
      `ответ отдаёт клиенту сырой текст ошибки в ${hits.length} месте(ах): ` +
        `${hits.map(h => h[0]).slice(0, 6).join(' | ')} — ` +
        `верните общее сообщение, а подробность оставьте в console.error`
    ).toBe(0)
  })
})
