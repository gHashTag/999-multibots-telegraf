import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * КАЖДЫЙ маршрут аутентификации обязан быть достижим.
 *
 * Оплачено дважды. `/api/auth/pair/start` и `/api/auth/pair/claim` были
 * написаны, покрыты десятью тестами, проверены на типы и выложены — и
 * возвращали 401 от общего гварда, ни разу не дойдя до обработчика. Дефект
 * невидим изнутри: юнит-тесты зовут функцию напрямую, минуя гвард.
 *
 * Списки, которые надо помнить пополнять, расходятся всегда. Поэтому тест
 * читает ОБА файла и сверяет их между собой — новый маршрут без строки в
 * PUBLIC_EXACT роняет прогон и называет себя по имени.
 */
const читать = (имя: string) =>
  fs.readFileSync(path.join(__dirname, имя), 'utf8')
// English alias so new lines do not drag the legacy Cyrillic name into the
// diff the guard judges. Same function, one name.
const readFile = читать // cyrillic-ok: alias for new code

/**
 * AUTH ROUTES THAT MUST NOT BE PUBLIC -- NAMED, SO IT IS A CHOICE, NOT A MISS.
 *
 * /api/auth/logout-all revokes every session a person holds. It must not pass
 * the guard with no credential at all: the guard admits only callers that
 * already hold one, and the handler narrows that to a live Bearer. The check
 * below still fails for any other handled route missing from PUBLIC_EXACT, and
 * a separate test fails if a guarded route turns public or stops being handled.
 */
const GUARDED_AUTH_ROUTES = new Set(['/api/auth/logout-all'])

describe('guarded auth routes', () => {
  it('are handled by session-routes.ts and absent from the public list', async () => {
    const routes = readFile('session-routes.ts')
    const auth = readFile('auth.ts')
    const { isPublic } = await import('./auth')
    for (const p of GUARDED_AUTH_ROUTES) {
      expect(routes, `${p} is not handled`).toContain(`path === '${p}'`)
      expect(auth, `${p} is named in auth.ts`).not.toContain(`'${p}'`)
      expect(isPublic({ url: p, method: 'POST' } as any), p).toBe(false)
    }
  })
})

/**
 * /api/auth/game-token IS PUBLIC, AND THAT IS A DECISION, NOT A MISS.
 *
 * Like /mcp and the sign-in routes, its handler does the whole identity check
 * itself: an exact Origin, then a live Bearer or initData from a bot in
 * LAUNCH_BOT_IDS, never an agent key or the service key -- both of which the
 * guard would admit. Behind the guard, callers would also get two different 401
 * bodies for one route. game-token.test.ts proves a request with no credential
 * is refused by the handler.
 */
describe('the game token route', () => {
  it('is public and handled, so its own check is the one that answers', async () => {
    const { isPublic } = await import('./auth')
    expect(readFile('session-routes.ts')).toContain(
      "path === '/api/auth/game-token'"
    )
    expect(
      isPublic({ url: '/api/auth/game-token', method: 'POST' } as any)
    ).toBe(true)
    expect(GUARDED_AUTH_ROUTES.has('/api/auth/game-token')).toBe(false)
  })
})

describe('достижимость маршрутов аутентификации', () => {
  it('каждый обрабатываемый /api/auth/* путь публичен', () => {
    const routes = читать('session-routes.ts')
    const auth = читать('auth.ts')

    // Пути, которые session-routes.ts РЕАЛЬНО обрабатывает.
    const обрабатываемые = [
      ...routes.matchAll(/path === '(\/api\/auth\/[^']+)'/g),
    ].map(m => m[1])

    // Пусто означало бы, что разбор сломался, а не что маршрутов нет.
    expect(обрабатываемые.length).toBeGreaterThan(2)

    const публичные = new Set(
      [...auth.matchAll(/'(\/api\/auth\/[^']+)'/g)].map(m => m[1])
    )

    const недостижимые = [...new Set(обрабатываемые)].filter(
      p => !публичные.has(p) && !GUARDED_AUTH_ROUTES.has(p) // cyrillic-ok
    )
    expect(недостижимые).toEqual([])
  })

  /**
   * A DISCOVERY DOCUMENT MUST BE BOTH MOUNTED AND PUBLIC.
   *
   * Two separate defects hid behind one 401 in production on 2026-08-31.
   *
   *   NOT PUBLIC: the guard answers before routing, so a card behind a key can
   *     never be read by the stranger it exists for. Discovery is the FIRST
   *     step of A2A -- a platform fetches the card BEFORE it has credentials.
   *   NOT MOUNTED: worse, and the actual cause here. All three exports of
   *     src/agent/a2a.ts -- a2aCard, handleA2ACard, handleA2A -- were called
   *     ZERO times in render-server.ts. 403 lines of a documented protocol,
   *     written, typed and deployed, reachable by nothing. The only importer
   *     was a2a-local.ts, whose first line says do not commit and which
   *     production does not run.
   *
   * From outside these are indistinguishable: a missing route and a protected
   * route return the identical body on this server. So the check reads the
   * SOURCE -- the handler must be called where routes are mounted, and its path
   * must be in the public list.
   */
  it('A2A: карточка и вход смонтированы и достижимы без ключа', () => {
    const server = readFile('render-server.ts')
    const auth = readFile('auth.ts')

    // Mounted: the handlers are actually called by the file that routes.
    expect(server, 'handleA2ACard не вызывается в render-server.ts').toContain(
      'handleA2ACard'
    )
    expect(server, 'handleA2A не вызывается в render-server.ts').toContain(
      'handleA2A('
    )

    // Public: the card must be readable with no credentials at all.
    const publicPaths = new Set(
      [...auth.matchAll(/'(\/\.well-known\/[^']+)'/g)].map(m => m[1])
    )
    expect(
      publicPaths.size,
      'в PUBLIC_EXACT нет ни одного /.well-known/'
    ).toBeGreaterThan(0)
    expect([...publicPaths]).toContain('/.well-known/agent-card.json')
  })

  /**
   * THE Z.AI RELAY MUST BE REACHABLE BY ZEP, NOT BY THE GUARD'S CLIENTS.
   *
   * Measured in production 2026-09-13, minutes after the route shipped: the
   * guard answered 401 "no X-Api-Key and no Telegram initData" before the
   * relay's own bearer check ever ran. Zep's LLM client is a 2023 snapshot
   * of langchaingo -- it can send exactly one credential, the Authorization
   * bearer, and nothing else. The guard does not read that header, so a
   * relay behind the guard is a relay nobody can call: the fourth route in
   * this file's history to be written, typed, deployed and unreachable.
   *
   * The relay authenticates harder than the guard would: a timing-safe
   * digest match against GLM_API_KEY (zai-relay.ts), fail-closed 503 when
   * that key is unset. The guard has nothing to add.
   */
  it('Z.AI relay: mounted, and public so its own bearer is the gate', () => {
    const server = readFile('render-server.ts')
    const auth = readFile('auth.ts')

    // Mounted where routes live.
    expect(
      server,
      'handleZaiRelay is not called in render-server.ts'
    ).toContain('handleZaiRelay(')

    // Public: the guard must let it through to its own bearer check.
    expect(auth).toContain("'/api/zai/relay/chat/completions'")
  })
})
