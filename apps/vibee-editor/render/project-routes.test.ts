import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'

/**
 * Projects: private by construction, not by convention.
 *
 * WHY THESE TESTS GO THROUGH `handleProjectRoute` RATHER THAN THE SQL. The
 * defect this file exists to prevent does not live in a query — it lives in
 * the seam between "who is asking" and "which rows are returned". A unit test
 * that called a store function with an owner already decided would be green
 * whatever the route did with the Authorization header, which is precisely how
 * two pairing routes shipped unreachable behind the guard.
 *
 * So the fake pool below implements the four statements LITERALLY, including
 * the `telegram_id = $2` guard on the upsert, and throws on any statement it
 * does not recognise. A fake that answered "0 rows" to a query it did not
 * understand would turn a broken test into a passing one.
 */

const TOKEN = '111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

/** initData signed exactly the way Telegram signs it. */
function sign(fields: Record<string, string>): string {
  const pairs = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))
  const line = pairs.map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(TOKEN)
    .digest()
  const hash = crypto.createHmac('sha256', secret).update(line).digest('hex')
  const p = new URLSearchParams(fields)
  p.set('hash', hash)
  return p.toString()
}

type Row = {
  id: string
  telegram_id: string
  name: string
  composition: string
  updated_at: number
}

/** Shared across a test so a write and the read after it see one table. */
let rows: Row[] = []
let clock = 1_700_000_000_000

function pool() {
  return {
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (s.startsWith('CREATE TABLE') || s.startsWith('CREATE INDEX')) {
        return { rows: [] }
      }

      /**
       * THE FAKE OBEYS THE STATEMENT IT IS GIVEN.
       *
       * This is the difference between a test and a decoration. The first
       * version of this file hardcoded the ownership rule in the fake — so
       * deleting `WHERE projects.telegram_id = $2` from the real SQL left every
       * test green, and the privacy test below was proving a property of the
       * fake rather than of the route.
       *
       * Now each filter is read out of the SQL text. Remove a clause from
       * `project-routes.ts` and the fake stops enforcing it too, which is
       * exactly when the assertions must go red. Verified by doing it.
       */
      if (s.startsWith('SELECT id, name, updated_at FROM projects')) {
        const byOwner = s.includes('WHERE telegram_id = $1')
        return {
          rows: rows
            .filter(r => (byOwner ? r.telegram_id === params[0] : true))
            .sort((a, b) => b.updated_at - a.updated_at),
        }
      }

      if (s.startsWith('SELECT id, name, composition::text')) {
        const byOwner = s.includes('AND telegram_id = $2')
        return {
          rows: rows.filter(
            r =>
              r.id === params[0] &&
              (byOwner ? r.telegram_id === params[1] : true)
          ),
        }
      }

      if (s.startsWith('INSERT INTO projects')) {
        const [id, owner, name, composition] = params as string[]
        const guarded = s.includes('WHERE projects.telegram_id = $2')
        const existing = rows.find(r => r.id === id)
        clock += 1000
        if (!existing) {
          const row: Row = {
            id,
            telegram_id: owner,
            name,
            composition,
            updated_at: clock,
          }
          rows.push(row)
          return { rows: [row] }
        }
        // ON CONFLICT ... DO UPDATE ... WHERE projects.telegram_id = $2:
        // a conflict on somebody else's row updates nothing and returns
        // nothing. Without the clause it would overwrite, which is the whole
        // point of the ownership test.
        if (guarded && existing.telegram_id !== owner) return { rows: [] }
        existing.name = name
        existing.composition = composition
        existing.updated_at = clock
        return { rows: [existing] }
      }

      throw new Error(
        `fake pool does not know this statement: ${s.slice(0, 90)}`
      )
    },
  }
}

function request(
  url: string,
  method: string,
  body: unknown = null,
  headers: Record<string, string> = {}
) {
  const r = Readable.from(
    body === null ? [] : [Buffer.from(JSON.stringify(body))]
  ) as any
  r.url = url
  r.method = method
  r.headers = headers
  return r
}

function response() {
  const o: any = {
    code: 0,
    body: null as any,
    writeHead(c: number) {
      o.code = c
      return o
    },
    end(s: string) {
      o.body = s ? JSON.parse(s) : null
    },
  }
  return o
}

const COMPOSITION = {
  fps: 30,
  width: 1080,
  height: 1920,
  tracks: [
    {
      id: 't1',
      type: 'video',
      name: 'Video',
      locked: false,
      visible: true,
      muted: false,
      solo: false,
      items: [
        {
          id: 'c1',
          trackId: 't1',
          startFrame: 0,
          durationInFrames: 150,
          x: 0,
          y: 0,
          width: 1080,
          height: 1920,
          rotation: 0,
          opacity: 1,
        },
      ],
    },
  ],
}

describe('проекты: приватность и запись', () => {
  let handleProjectRoute: typeof import('./project-routes').handleProjectRoute
  let signAccessToken: typeof import('./session').signAccessToken

  beforeEach(async () => {
    rows = []
    process.env.TELEGRAM_BOT_TOKEN = TOKEN
    process.env.SESSION_SIGNING_KEY ||= 'x'.repeat(48)
    // Enforce, not warn: the guard is not under test here, but leaving the
    // module-level table flag from a previous file would be.
    vi.resetModules()
    handleProjectRoute = (await import('./project-routes')).handleProjectRoute
    const session = await import('./session')
    session.setRevokedSessions([])
    signAccessToken = session.signAccessToken
  })

  const bearer = (telegramId: string) => ({
    authorization: `Bearer ${signAccessToken({
      telegramId,
      sessionId: `s-${telegramId}`,
      deviceKeyThumbprint: '',
    })}`,
  })

  const initData = (id: number) => ({
    'x-telegram-init-data': sign({
      user: JSON.stringify({ id, first_name: 'Test' }),
      auth_date: String(Math.floor(Date.now() / 1000)),
    }),
  })

  const put = async (
    id: string,
    headers: Record<string, string>,
    body: unknown
  ) => {
    const o = response()
    await handleProjectRoute(
      request(`/api/projects/${id}`, 'PUT', body, headers),
      o,
      pool as any
    )
    return o
  }

  const get = async (path: string, headers: Record<string, string>) => {
    const o = response()
    await handleProjectRoute(
      request(path, 'GET', null, headers),
      o,
      pool as any
    )
    return o
  }

  // ─── Identity ──────────────────────────────────────────────────────────

  /**
   * The 401 must be the ROUTE's, not the guard's.
   *
   * The shared guard answers `no X-Api-Key and no Telegram initData` for every
   * path in the service, including paths that do not exist — so a route that
   * echoed those words would be indistinguishable from one that was never
   * deployed. This assertion is what makes a live probe meaningful.
   */
  it('без личности отвечает СВОИМИ словами, а не словами гварда', async () => {
    const o = await get('/api/projects', {})
    expect(o.code).toBe(401)
    expect(o.body.error).toBe('проект не знает, чей он')
    expect(JSON.stringify(o.body)).not.toContain('no X-Api-Key')
  })

  it('ключ сервера личностью не считается: он не называет человека', async () => {
    const o = await get('/api/projects', { 'x-api-key': 'какой-угодно' })
    expect(o.code).toBe(401)
    expect(o.body.error).toBe('проект не знает, чей он')
  })

  /**
   * A presented-but-broken Bearer must NOT quietly fall through to the
   * signature branch. If it did, an app whose session expired would be told
   * "unauthorized" instead of "refresh your token", and would never refresh.
   */
  it('испорченный Bearer не проваливается в проверку подписи', async () => {
    const o = await get('/api/projects', {
      authorization: 'Bearer не-токен',
      ...initData(4242),
    })
    expect(o.code).toBe(401)
  })

  it('подпись мини-аппа тоже годится: у веб-редактора она есть всегда', async () => {
    const o = await get('/api/projects', initData(4242))
    expect(o.code).toBe(200)
    expect(o.body.projects).toEqual([])
  })

  // ─── Round trip ────────────────────────────────────────────────────────

  it('записанный проект читается обратно тем же самым', async () => {
    const written = await put('proj-1', bearer('4242'), {
      name: 'Мой ролик',
      composition: COMPOSITION,
    })
    expect(written.code).toBe(200)

    const readBack = await get('/api/projects/proj-1', bearer('4242'))
    expect(readBack.code).toBe(200)
    expect(readBack.body.name).toBe('Мой ролик')
    expect(readBack.body.composition).toEqual(COMPOSITION)
  })

  it('список отдаёт свои проекты и НЕ таскает композиции целиком', async () => {
    await put('proj-1', bearer('4242'), {
      name: 'Раз',
      composition: COMPOSITION,
    })
    await put('proj-2', bearer('4242'), {
      name: 'Два',
      composition: COMPOSITION,
    })

    const o = await get('/api/projects', bearer('4242'))
    expect(o.code).toBe(200)
    expect(o.body.projects.map((p: any) => p.id).sort()).toEqual([
      'proj-1',
      'proj-2',
    ])
    // Twenty projects must not mean twenty timelines on the wire.
    expect(o.body.projects[0].composition).toBeUndefined()
  })

  // ─── Privacy ───────────────────────────────────────────────────────────

  it('чужой проект не отдаётся и не подтверждается его существование', async () => {
    await put('proj-1', bearer('1111'), {
      name: 'Чужой',
      composition: COMPOSITION,
    })

    const o = await get('/api/projects/proj-1', bearer('2222'))
    expect(o.code).toBe(404)
    expect(JSON.stringify(o.body)).not.toContain('Чужой')
  })

  it('в списке нет чужих проектов', async () => {
    await put('proj-1', bearer('1111'), {
      name: 'Чужой',
      composition: COMPOSITION,
    })
    const o = await get('/api/projects', bearer('2222'))
    expect(o.body.projects).toEqual([])
  })

  /**
   * The main test of this file.
   *
   * The tempting upsert is a bare `ON CONFLICT (id) DO UPDATE`, and it would
   * pass every other test here: the conflict target is the primary key, which
   * says nothing about who owns the row. Anyone who guessed an id could then
   * overwrite a stranger's timeline.
   *
   * The assertion is on the STORED ROW, not on the status code. A 404 is also
   * what a bare upsert would eventually produce for other reasons, and this
   * file has been bitten before by a mutation that a status-only assertion did
   * not catch: what matters is that the victim's work is still there.
   */
  it('чужой проект нельзя перезаписать, зная его идентификатор', async () => {
    await put('proj-1', bearer('1111'), {
      name: 'Оригинал',
      composition: COMPOSITION,
    })

    const attack = await put('proj-1', bearer('2222'), {
      name: 'Подмена',
      composition: { tracks: [] },
    })
    expect(attack.code).toBe(404)

    // State, not the answer: the row still belongs to 1111 and still holds
    // what 1111 wrote.
    const stored = rows.find(r => r.id === 'proj-1')!
    expect(stored.telegram_id).toBe('1111')
    expect(stored.name).toBe('Оригинал')
    expect(JSON.parse(stored.composition)).toEqual(COMPOSITION)

    // And the owner can still read their own project unchanged.
    const ownerView = await get('/api/projects/proj-1', bearer('1111'))
    expect(ownerView.body.name).toBe('Оригинал')
  })

  it('свой проект перезаписывается и владелец не меняется', async () => {
    await put('proj-1', bearer('1111'), {
      name: 'Было',
      composition: COMPOSITION,
    })
    const again = await put('proj-1', bearer('1111'), {
      name: 'Стало',
      composition: { tracks: [] },
    })
    expect(again.code).toBe(200)

    const stored = rows.find(r => r.id === 'proj-1')!
    expect(stored.telegram_id).toBe('1111')
    expect(stored.name).toBe('Стало')
  })

  // ─── Input ─────────────────────────────────────────────────────────────

  it('без композиции запись отклоняется', async () => {
    const o = await put('proj-1', bearer('4242'), { name: 'Пусто' })
    expect(o.code).toBe(400)
    expect(rows).toEqual([])
  })

  it('композиция обязана быть объектом, а не массивом или строкой', async () => {
    expect((await put('p1', bearer('4242'), { composition: [] })).code).toBe(
      400
    )
    expect(
      (await put('p2', bearer('4242'), { composition: 'таймлайн' })).code
    ).toBe(400)
    expect((await put('p3', bearer('4242'), { composition: null })).code).toBe(
      400
    )
    expect(rows).toEqual([])
  })

  /**
   * The id arrives from outside and lands in a primary key, so its alphabet is
   * stated rather than assumed. The percent-encoded case is the one worth
   * having: it is a single path segment, so it reaches the id check, and it
   * only fails there because the check runs on the DECODED value.
   */
  it('недопустимый идентификатор отклоняется', async () => {
    expect((await get('/api/projects/..', bearer('4242'))).code).toBe(400)
    expect(
      (await get('/api/projects/%2E%2E%2Fsecrets', bearer('4242'))).code
    ).toBe(400)
    expect(
      (await put('a b', bearer('4242'), { composition: COMPOSITION })).code
    ).toBe(400)
    expect(rows).toEqual([])
  })

  // ─── Routing ───────────────────────────────────────────────────────────

  /**
   * Extra segments must not fall through into the server's if-cascade, where
   * `startsWith` matchers live. That is how a profile card was once served
   * with a 200 for a templates path, and nobody's videos appeared on their
   * profile for as long as it lasted.
   */
  it('лишний сегмент обслуживается здесь и отвечает 404, а не проваливается дальше', async () => {
    const o = response()
    const handled = await handleProjectRoute(
      request('/api/projects/proj-1/tracks', 'GET', null, bearer('4242')),
      o,
      pool as any
    )
    expect(handled).toBe(true)
    expect(o.code).toBe(404)
    expect(o.body.error).toBe('нет такого маршрута проектов')
  })

  it('чужой путь не наш: обработчик возвращает false и молчит', async () => {
    const o = response()
    const handled = await handleProjectRoute(
      request('/api/feed', 'GET', null, {}),
      o,
      pool as any
    )
    expect(handled).toBe(false)
    expect(o.code).toBe(0)
  })

  /**
   * `/api/projectsomething` starts with `/api/projects` as a STRING but is a
   * different route. Matching on the prefix without the slash would swallow
   * every future path that merely begins with those letters.
   */
  it('похожий по буквам путь не перехватывается', async () => {
    const o = response()
    const handled = await handleProjectRoute(
      request('/api/projectsomething', 'GET', null, {}),
      o,
      pool as any
    )
    expect(handled).toBe(false)
  })
})
