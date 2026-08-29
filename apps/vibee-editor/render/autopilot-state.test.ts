/**
 * The autopilot's memory must survive a deploy. Nothing checked that either.
 *
 * loop/state.json lives in the container and this project has NO volumes, so
 * every merge to main wiped it. The daily cap was rescued earlier by counting
 * the feed, but the QUEUE CURSOR has no second source -- the feed knows titles,
 * not positions. After each wipe the cycle re-picked topic 0, hit the dedupe
 * branch, advanced the cursor by one and returned: one 30-minute tick burned
 * per already-published topic before anything could be published again.
 *
 * What is proven here is behaviour, not the presence of SQL: state survives a
 * wiped file, a new day zeroes only the counter, a missing DATABASE_URL still
 * works off the file, and a database that throws degrades instead of crashing
 * (an escaped error in one-shot mode is exit 1 under a respawn supervisor --
 * a crash loop, not a failure anyone would see).
 *
 * THE FAKE IS DUMB ON PURPOSE. It stores whatever the upsert sends and hands it
 * back on select. It does NOT implement the day reset, the floor merge or
 * GREATEST -- those are the invariants under test, and a fake that enforced
 * them would be measuring itself. The one thing it does copy from Postgres is
 * that an insert on an existing key overwrites rather than duplicates.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  cursorFor,
  loadState,
  mergeState,
  openDb,
  ownerFromEnv,
  rollDay,
  saveState,
  withDb,
  type AutopilotState,
} from './src/autopilot-state'

const OWNER = '144022504'
const TODAY = '2026-08-29'
const YESTERDAY = '2026-08-28'

/** A one-table Postgres stand-in that records every statement it was given. */
function fakeDb() {
  const rows = new Map<string, Record<string, any>>()
  const sqls: string[] = []
  return {
    rows,
    sqls,
    async query(sql: string, params: unknown[] = []) {
      sqls.push(sql)
      if (sql.includes('INSERT INTO autopilot_state')) {
        rows.set(String(params[0]), {
          date: params[1],
          posts_today: params[2],
          next_topic: params[3],
          last_topic: params[4],
          last_post_at: params[5],
        })
        return { rows: [] }
      }
      if (sql.includes('SELECT') && sql.includes('autopilot_state')) {
        /**
         * The owner filter is applied ONLY IF THE QUERY ASKS FOR IT.
         *
         * The first version of this fake looked the row up by params[0]
         * regardless, so "another owner's row is not read as mine" passed even
         * with `WHERE owner = $1` cut out of the SELECT -- it measured the fake
         * rather than the code, and the mutation proving it stayed green.
         * Postgres given no owner predicate hands back every row and the caller
         * takes the first; that is what is emulated here.
         */
        const scoped = /WHERE\s+owner\s*=\s*\$1/i.test(sql)
        const all = [...rows.entries()]
        const hits = scoped ? all.filter(([o]) => o === String(params[0])) : all
        return { rows: hits.map(([, row]) => row) }
      }
      return { rows: [] } // CREATE TABLE IF NOT EXISTS
    },
  }
}

/** A database that is simply not there: every statement rejects. */
const deadDb = {
  async query(): Promise<{ rows: any[] }> {
    throw new Error('ECONNREFUSED 10.0.0.1:5432')
  },
}

let dir = ''
let STATE = ''
let said: string[] = []
const log = (line: string) => said.push(line)
const DATABASE_URL = process.env.DATABASE_URL

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-state-'))
  STATE = path.join(dir, 'state.json')
  said = []
  // This machine has a real DATABASE_URL. Leaving it set would make loadState
  // report "no database" differently and would tempt a future openDb() test
  // into the developer's own Postgres.
  process.env.DATABASE_URL = 'postgresql://fake/never-opened-in-this-file'
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  if (DATABASE_URL === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = DATABASE_URL
})

const write = (s: Partial<AutopilotState>) =>
  fs.writeFileSync(STATE, JSON.stringify(s))

describe('состояние переживает подмену контейнера', () => {
  it('то, что записали, читается обратно из базы', async () => {
    const db = fakeDb()
    await saveState({
      db,
      owner: OWNER,
      stateFile: STATE,
      state: {
        date: TODAY,
        postsToday: 2,
        nextTopic: 3,
        lastTopic: 'третья тема',
        lastPostAt: '2026-08-29T09:00:00Z',
      },
      log,
    })
    const back = await loadState({
      db,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.postsToday).toBe(2)
    expect(back.nextTopic).toBe(3)
    expect(back.lastTopic).toBe('третья тема')
    expect(back.lastPostAt).toBe('2026-08-29T09:00:00Z')
  })

  it('ДЕПЛОЙ СТЁР ФАЙЛ — курсор всё равно на месте', async () => {
    // The whole point. A fresh container has no state.json at all.
    const db = fakeDb()
    await saveState({
      db,
      owner: OWNER,
      stateFile: STATE,
      state: { date: TODAY, postsToday: 3, nextTopic: 7, lastTopic: 'седьмая' },
      log,
    })
    fs.rmSync(STATE) // the deploy
    const back = await loadState({
      db,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.nextTopic).toBe(7)
    expect(back.postsToday).toBe(3)
  })

  it('база старше файла — берём базу, а не свежий нуль', async () => {
    const db = fakeDb()
    db.rows.set(OWNER, {
      date: TODAY,
      posts_today: 3,
      next_topic: 7,
      last_topic: null,
      last_post_at: null,
    })
    write({ date: TODAY, postsToday: 0, nextTopic: 2 })
    const back = await loadState({
      db,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.nextTopic).toBe(7)
    expect(back.postsToday).toBe(3)
  })

  it('файл ушёл вперёд (запись в базу падала) — очередь не отматывается назад', async () => {
    const db = fakeDb()
    db.rows.set(OWNER, {
      date: TODAY,
      posts_today: 1,
      next_topic: 4,
      last_topic: null,
      last_post_at: null,
    })
    write({ date: TODAY, postsToday: 2, nextTopic: 6, lastTopic: 'шестая' })
    const back = await loadState({
      db,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.nextTopic).toBe(6)
    expect(back.lastTopic).toBe('шестая')
    expect(back.postsToday).toBe(2)
  })

  it('строка чужого владельца не читается как своя', async () => {
    const db = fakeDb()
    db.rows.set('999', {
      date: TODAY,
      posts_today: 4,
      next_topic: 9,
      last_topic: null,
      last_post_at: null,
    })
    const back = await loadState({
      db,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.nextTopic).toBe(0)
    expect(back.postsToday).toBe(0)
  })

  it('курсор продвигается витком и переживает следующую загрузку', async () => {
    const db = fakeDb()
    let s = await loadState({
      db,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(s.nextTopic).toBe(0)
    // Exactly what the cycle writes after a successful publication.
    await saveState({
      db,
      owner: OWNER,
      stateFile: STATE,
      state: {
        ...s,
        postsToday: s.postsToday + 1,
        nextTopic: 1,
        lastTopic: 'первая',
      },
      log,
    })
    fs.rmSync(STATE) // redeploy between cycles
    s = await loadState({
      db,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(s.nextTopic).toBe(1)
    expect(s.postsToday).toBe(1)
  })
})

describe('новые сутки обнуляют счётчик и только его', () => {
  it('вчерашняя строка в базе: постов 0, очередь и интервал целы', async () => {
    const db = fakeDb()
    db.rows.set(OWNER, {
      date: YESTERDAY,
      posts_today: 4,
      next_topic: 5,
      last_topic: 'пятая',
      last_post_at: '2026-08-28T21:00:00Z',
    })
    const back = await loadState({
      db,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.postsToday).toBe(0)
    expect(back.nextTopic).toBe(5)
    expect(back.lastTopic).toBe('пятая')
    expect(back.lastPostAt).toBe('2026-08-28T21:00:00Z')
    expect(back.date).toBe(TODAY)
  })

  it('вчерашний файл обнуляется так же', async () => {
    write({
      date: YESTERDAY,
      postsToday: 4,
      nextTopic: 5,
      lastPostAt: '2026-08-28T21:00:00Z',
    })
    const back = await loadState({
      db: null,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.postsToday).toBe(0)
    expect(back.nextTopic).toBe(5)
  })

  it('сегодняшний счётчик НЕ обнуляется', async () => {
    write({ date: TODAY, postsToday: 3, nextTopic: 5 })
    const back = await loadState({
      db: null,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.postsToday).toBe(3)
  })
})

describe('без базы автопилот работает ровно как раньше', () => {
  it('нет DATABASE_URL — состояние из файла', async () => {
    delete process.env.DATABASE_URL
    write({ date: TODAY, postsToday: 2, nextTopic: 4 })
    const back = await loadState({
      db: null,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back).toMatchObject({ date: TODAY, postsToday: 2, nextTopic: 4 })
    expect(said.join('\n')).toMatch(/DATABASE_URL/)
  })

  it('файла нет вовсе — чистое состояние, без исключения', async () => {
    const back = await loadState({
      db: null,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back).toEqual({ date: TODAY, postsToday: 0, nextTopic: 0 })
  })

  it('битый JSON в файле — тоже чистое состояние', async () => {
    fs.writeFileSync(STATE, '{не json')
    const back = await loadState({
      db: null,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.nextTopic).toBe(0)
  })

  it('без базы запись всё равно ложится в файл', async () => {
    await saveState({
      db: null,
      owner: OWNER,
      stateFile: STATE,
      state: { date: TODAY, postsToday: 1, nextTopic: 2 },
      log,
    })
    expect(JSON.parse(fs.readFileSync(STATE, 'utf8')).nextTopic).toBe(2)
  })

  it('нет DATABASE_URL — openDb не трогает pg и возвращает null', async () => {
    // R1 of the fallback contract, and the reason `pg` is imported inside the
    // function: the module must stay loadable, and the cycle runnable, on a
    // machine or an image where there is no database to talk to at all.
    delete process.env.DATABASE_URL
    expect(await openDb()).toBeNull()
  })

  it('DATABASE_URL ЕСТЬ, а пул не открылся — журнал всё равно говорит', async () => {
    // The asymmetric case that used to be silent: a configured URL whose pool
    // could not be constructed (pg pruned, unparseable DSN) fell back to the
    // file with no line at all, which reads exactly like a healthy load.
    write({ date: TODAY, postsToday: 1, nextTopic: 3 })
    const back = await loadState({
      db: null,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.nextTopic).toBe(3)
    expect(said.join('\n')).toContain('база не открылась')
  })
})

describe('недоступная база — деградация, а не падение', () => {
  it('чтение возвращает файл и ГОВОРИТ об этом в журнале', async () => {
    // A silent fallback looks exactly like a working database, which is how the
    // original wipe stayed invisible for days.
    write({ date: TODAY, postsToday: 1, nextTopic: 3 })
    const back = await loadState({
      db: deadDb,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(back.nextTopic).toBe(3)
    expect(said.join('\n')).toContain('база недоступна')
  })

  it('падающая база при записи НЕ мешает файлу', async () => {
    await saveState({
      db: deadDb,
      owner: OWNER,
      stateFile: STATE,
      state: { date: TODAY, postsToday: 2, nextTopic: 5 },
      log,
    })
    expect(JSON.parse(fs.readFileSync(STATE, 'utf8')).nextTopic).toBe(5)
    expect(said.join('\n')).toContain('база не приняла запись')
  })

  it('ни чтение, ни запись не бросают наружу', async () => {
    // In one-shot mode an escaped error becomes exit 1 under the render
    // server's respawn supervisor: a 60-second crash loop.
    await expect(
      loadState({
        db: deadDb,
        owner: OWNER,
        stateFile: STATE,
        today: TODAY,
        log,
      })
    ).resolves.toBeTruthy()
    await expect(
      saveState({
        db: deadDb,
        owner: OWNER,
        stateFile: STATE,
        state: { date: TODAY, postsToday: 0, nextTopic: 0 },
        log,
      })
    ).resolves.toBeUndefined()
  })
})

describe('курсор устойчив к пересеву topics.json', () => {
  const TITLES = ['a', 'b', 'c', 'd']

  it('индекс за концом массива не отдаётся как индекс', () => {
    // The Dockerfile re-seeds topics.json on every deploy, so a durable index
    // of 9 can meet an array of 4. Without the clamp pickTopic returns `from`
    // unchanged and the caller dereferences undefined -- a TypeError every
    // cycle, which the wipe used to hide.
    const at = cursorFor({ date: TODAY, postsToday: 0, nextTopic: 9 }, TITLES)
    expect(at).toBe(4)
    expect(TITLES[at]).toBeUndefined() // the caller must read this as "exhausted"
  })

  it('заголовок важнее индекса: очередь пересеялась — становимся после него', () => {
    const at = cursorFor(
      { date: TODAY, postsToday: 0, nextTopic: 9, lastTopic: 'b' },
      TITLES
    )
    expect(at).toBe(2)
  })

  it('заголовка в новой очереди нет — падаем обратно на индекс', () => {
    const at = cursorFor(
      { date: TODAY, postsToday: 0, nextTopic: 2, lastTopic: 'ушедшая тема' },
      TITLES
    )
    expect(at).toBe(2)
  })

  it('пустая очередь — ноль, а не отрицательный индекс', () => {
    expect(cursorFor({ date: TODAY, postsToday: 0, nextTopic: 3 }, [])).toBe(0)
  })
})

describe('запросы к базе устроены так, как задумано', () => {
  it('таблица создаётся на месте, как agent_keys и star_payments', async () => {
    const db = fakeDb()
    await loadState({
      db,
      owner: OWNER,
      stateFile: STATE,
      today: TODAY,
      log,
    })
    expect(db.sqls.join('\n')).toMatch(
      /CREATE TABLE IF NOT EXISTS autopilot_state/
    )
  })

  it('запись — один upsert, а не read-modify-write', async () => {
    // Two containers overlap during a rolling deploy (the singleton lock is a
    // PID file, per-filesystem). A SELECT-then-UPDATE would lose one of them.
    const db = fakeDb()
    await saveState({
      db,
      owner: OWNER,
      stateFile: STATE,
      state: { date: TODAY, postsToday: 1, nextTopic: 1 },
      log,
    })
    const upsert = db.sqls.find(s => s.includes('INSERT INTO autopilot_state'))
    expect(upsert).toBeTruthy()
    // A SHAPE check, not a behaviour check: the merge itself is Postgres's job
    // and no fake can prove it. Losing these clauses is silent, so they are
    // asserted where they can at least be noticed.
    expect(upsert).toMatch(/ON CONFLICT \(owner\) DO UPDATE/)
    expect(upsert).toMatch(/GREATEST/)
    expect(db.sqls.some(s => /^\s*SELECT/.test(s))).toBe(false)
  })
})

describe('соединение закрывается всегда', () => {
  /**
   * MEASURED, not assumed: with the finally removed and a reachable Postgres, a
   * one-shot run took 10 099 ms to exit instead of 81 ms -- pg's default idle
   * timeout holding the socket open. The suite must not require a database, so
   * that number was taken by hand; what is checked here is the finally itself.
   */
  const opener = () => {
    let closed = 0
    const open = async () => ({
      db: fakeDb() as unknown as import('./src/autopilot-state').Db,
      close: async () => {
        closed++
      },
    })
    return { open, closed: () => closed }
  }

  it('после обычной работы', async () => {
    const o = opener()
    await withDb(async () => 'ok', o.open)
    expect(o.closed()).toBe(1)
  })

  it('и после исключения внутри витка', async () => {
    const o = opener()
    await expect(
      withDb(async () => {
        throw new Error('виток упал на рендере')
      }, o.open)
    ).rejects.toThrow()
    expect(o.closed()).toBe(1)
  })
})

describe('чистые правила, из которых собрано состояние', () => {
  it('rollDay переносит очередь через полночь, но не счётчик', () => {
    expect(
      rollDay(
        { date: YESTERDAY, postsToday: 4, nextTopic: 6, lastTopic: 'ш' },
        TODAY
      )
    ).toEqual({ date: TODAY, postsToday: 0, nextTopic: 6, lastTopic: 'ш' })
  })

  it('mergeState берёт больший момент публикации', () => {
    const merged = mergeState(
      {
        date: TODAY,
        postsToday: 1,
        nextTopic: 1,
        lastPostAt: '2026-08-29T06:00:00Z',
      },
      {
        date: TODAY,
        postsToday: 1,
        nextTopic: 1,
        lastPostAt: '2026-08-29T11:00:00Z',
      }
    )
    expect(merged.lastPostAt).toBe('2026-08-29T11:00:00Z')
  })

  it('владелец берётся из AGENT_KEYS так же, как на сервере', () => {
    const prev = process.env.AGENT_KEYS
    process.env.AGENT_KEYS = 'tri_abc:144022504,tri_def:777'
    expect(ownerFromEnv()).toBe('144022504')
    process.env.AGENT_KEYS = 'сломанный-ключ-без-владельца'
    // A malformed value must not become a NULL primary key.
    expect(ownerFromEnv()).toBe('autopilot')
    if (prev === undefined) delete process.env.AGENT_KEYS
    else process.env.AGENT_KEYS = prev
  })
})
