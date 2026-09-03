import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * The durable job store must be attached before the first request.
 *
 * generate-jobs.ts keeps its pool in a module variable that only attachStore()
 * sets, and persist() opens with `if (!(await ensureSchema()) || !pool) return`.
 * So until something attaches the store, every write is silently dropped.
 *
 * attachStoreOnce() used to be called from exactly ONE place: inside
 * GET /api/generate/jobs. The write path never called it. On a fresh process a
 * generation was therefore charged, started, and never written to the table --
 * and a client that polls a job by id instead of listing (the iOS app) never
 * triggered the attach at all. That inverts the module's purpose: it exists so
 * a paid generation survives a restart, and a deploy mid-job is precisely when
 * the in-memory Map dies.
 *
 * Source-level, because render-server.ts cannot be imported without booting the
 * service. Mutation-checked: removing the boot call turns this red.
 */

const SERVER = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

/** The body of main(), the boot sequence. */
function mainBody(): string {
  const start = SERVER.indexOf('async function main()')
  expect(start, 'main() not found').toBeGreaterThan(-1)
  return SERVER.slice(start, start + 3000)
}

describe('хранилище заданий подключено на старте', () => {
  it('находит boot-функцию и обёртку — иначе проверка пустая', () => {
    expect(mainBody()).toContain('await initBundle()')
    expect(SERVER).toContain('function attachStoreOnce()')
  })

  it('main() подключает хранилище, а не только маршрут чтения', () => {
    // The defect was that the ONLY caller sat inside GET /api/generate/jobs.
    expect(mainBody()).toContain('attachStoreOnce()')
  })

  it('подключение не валит старт без DATABASE_URL', () => {
    // getPool() throws synchronously when the env var is absent; a server with
    // no database has to keep running memory-only.
    const body = mainBody()
    const call = body.indexOf('attachStoreOnce()')
    const tryAt = body.lastIndexOf('try {', call)
    expect(tryAt).toBeGreaterThan(-1)
    expect(tryAt).toBeLessThan(call)
  })

  it('вызов на старте предшествует запуску сервера', () => {
    // Attaching after listen() would leave the very first requests unwritten,
    // which is the same defect in a smaller window.
    const body = mainBody()
    const call = body.indexOf('attachStoreOnce()')
    const listen = body.indexOf('server.listen')
    expect(call).toBeGreaterThan(-1)
    if (listen > -1) expect(call).toBeLessThan(listen)
  })
})
