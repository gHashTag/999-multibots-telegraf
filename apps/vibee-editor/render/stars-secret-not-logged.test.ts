import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * The cashier's webhook secret must not reach the log.
 *
 * That secret lives in the PATH -- `/api/telegram/stars-wh/<secret>` -- and it
 * is the whole guard. Past it the body is trusted: `invoice_payload` is called
 * the single source of truth, the credited amount and the recipient both come
 * from it, and so does the idempotency key. Anyone holding the secret can POST
 * a forged successful_payment with any amount, to any telegram_id, with a fresh
 * charge id each time, and mint tokens indefinitely.
 *
 * The request logger runs before any auth and printed the path verbatim, so the
 * service wrote that secret to stdout on every pre-checkout and every payment --
 * twice per purchase. Stripping the query string, which is what the line used to
 * do, does not help: the secret is not in the query.
 *
 * The redaction is asserted behaviourally against the real function, and the
 * source is checked for the one thing a behavioural test cannot see -- that the
 * logger calls it rather than the raw path.
 */

const SERVER = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

/**
 * Extracted rather than imported: importing render-server.ts boots the whole
 * service (S3, bundle, sockets). The body is read from the file so the test
 * cannot drift from the implementation it claims to check.
 */
function loadRedactor(): (url: string | undefined) => string {
  const at = SERVER.indexOf('export function redactedForLog')
  expect(at, 'redactedForLog not found in render-server.ts').toBeGreaterThan(-1)
  const body = SERVER.slice(at, SERVER.indexOf('\n}', at) + 2)
  const js = body
    .replace(
      'export function redactedForLog(url: string | undefined): string',
      'function redactedForLog(url)'
    )
    .replace(': string', '')
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return redactedForLog`)() as (
    url: string | undefined
  ) => string
}

/** An obviously fake path segment standing in for the real one. */
const FIXTURE_SEGMENT = 'fixture-segment-not-a-credential'

describe('секрет кассира не попадает в лог', () => {
  const redact = loadRedactor()

  it('секрет из ПУТИ вебхука вырезан', () => {
    const out = redact(`/api/telegram/stars-wh/${FIXTURE_SEGMENT}`)
    expect(out).not.toContain(FIXTURE_SEGMENT)
    expect(out).toContain('/api/telegram/stars-wh/')
  })

  it('вырезан и когда рядом есть query — query тут ни при чём', () => {
    // The old line only stripped the query. This secret was never in it.
    const out = redact(`/api/telegram/stars-wh/${FIXTURE_SEGMENT}?upd=1`)
    expect(out).not.toContain(FIXTURE_SEGMENT)
    expect(out).not.toContain('upd=1')
  })

  it('обычные пути не искажаются — маска узкая, а не «прячь всё»', () => {
    // A broad redactor would blind the log to real paths, which is its own harm.
    expect(redact('/api/generate/video')).toBe('/api/generate/video')
    expect(redact('/render/abc123')).toBe('/render/abc123')
    expect(redact('/api/feed/publish?x=1')).toBe('/api/feed/publish')
    expect(redact(undefined)).toBe('/')
  })

  it('логгер зовёт редактор, а не сырой путь', () => {
    // The only thing the behavioural test above cannot see.
    expect(SERVER).toMatch(/const requestPath = redactedForLog\(req\.url\)/)
    expect(SERVER).not.toMatch(
      /const requestPath = \(req\.url \|\| '\/'\)\.split\('\?'\)\[0\]/
    )
  })

  it('маршрута с секретом в пути больше нет — маска пережила его намеренно', () => {
    /*
     * ЭТОТ ТЕСТ СРАБОТАЛ РОВНО ТАК, КАК ЗАДУМАЛ ЕГО АВТОР.
     *
     * Он сторожил не строку, а ПРИЧИНУ: «если это перестанет быть правдой,
     * затирание всё ещё верно, но повод изменился — перечитай файл». Повод
     * изменился 06.09.2026: обработчик `POST /api/telegram/stars-wh/<секрет>`
     * убран вместе с вебхуком кассира, который глушил боту весь приём
     * сообщений (см. cashier-one-intake.test.ts).
     *
     * Затирание остаётся, и это не мусор: в уже записанных журналах секрет
     * встречается, а маска узкая и обычные пути не искажает. Проверки выше
     * продолжают её держать.
     */
    expect(SERVER).not.toMatch(/whMatch\[1\] !== WH_SECRET/)
    expect(SERVER).toMatch(/\/api\/telegram\/stars-wh\//)
  })
})
