/**
 * THE TALKING PORTRAIT, MEASURED WHERE THE MONEY IS.
 *
 * WHAT THIS FILE IS FOR. Three questions, and only the third of them is about
 * pixels: does the switch stay off when nobody turned it on, does a broken
 * provider still leave a publishable reel, and does the ceiling actually stop a
 * spend. The provider is a double with counters, so every assertion about "did
 * not call" is a number rather than an absence of a log line.
 *
 * THE DOUBLE IS AS DUMB AS THE REAL THING (house rule 5). It answers with the
 * shapes Kie really returns -- `{data:{taskId}}` collapsed into the two fields
 * the module reads, `state: 'success' | 'fail'`, a URL list -- and it never
 * decides anything on its own. Nothing here reaches a network: the module's
 * only network surfaces (createTask, recordInfo, credits, mirror) are the four
 * injected dependencies.
 *
 * WHY NOT ONLY THE SPAWNED-SCRIPT TEST. The neighbouring
 * autopilot-talking-portrait.test.ts runs the real script and proves the wiring;
 * it cannot cheaply enumerate eight failure modes of a paid provider. Both
 * exist, and they check different things: one that the factory behaves, one
 * that the money rules hold.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  attemptTalkingPortrait,
  ledgerWrite,
  ledgerSpentToday,
  portraitRecord,
  readPortraitConfig,
  CREDITS_PER_SECOND,
  CREDIT_FLOOR,
  DEFAULT_DAILY_CREDITS,
  DEFAULT_SECONDS,
  MAX_SECONDS,
  PORTRAIT_ENV,
  VIDEO_EXT,
  type Env,
  type PortraitProvider,
  type SpendRecord,
} from './src/talking-portrait'

const IMAGE = 'https://app.t27.ai/portrait/owner.jpg'
const AUDIO = 'https://app.t27.ai/voice/owner.mp3'
const DAY = '2026-08-31'

const ON: Env = {
  [PORTRAIT_ENV.mode]: 'on',
  [PORTRAIT_ENV.image]: IMAGE,
  [PORTRAIT_ENV.audio]: AUDIO,
  [PORTRAIT_ENV.key]: 'kie-test-key', // secret-guard-ok: literal test placeholder
}

let dir = ''
let ledgerFile = ''
const lines: string[] = []
const log = (l: string) => {
  lines.push(l)
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portrait-'))
  ledgerFile = path.join(dir, 'portrait-spend.json')
  lines.length = 0
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

/** Counts every call, so "never asked the provider" is a measured 0. */
function provider(opts: {
  balance?: number | null
  taskId?: string
  states?: string[]
  urls?: string[]
  spend?: number
}): PortraitProvider & { calls: Record<string, number> } {
  const calls = { credits: 0, createTask: 0, recordInfo: 0 }
  let balance = opts.balance === undefined ? 6930 : opts.balance
  const states = [...(opts.states || ['success'])]
  return {
    calls,
    async credits() {
      calls.credits++
      // The second read happens after the job: charge it there, exactly as the
      // provider does, so the module's measured delta has something to measure.
      if (calls.credits > 1 && balance != null) balance -= opts.spend ?? 0
      return balance
    },
    async createTask() {
      calls.createTask++
      return opts.taskId
        ? { taskId: opts.taskId, message: 'ok' }
        : { message: 'The model name you specified is not supported' }
    },
    async recordInfo() {
      calls.recordInfo++
      const state = states.length > 1 ? states.shift()! : states[0]
      return {
        state,
        urls: state === 'success' ? opts.urls || [] : [],
        message: state === 'fail' ? 'audio_url file type not supported' : '',
      }
    },
  }
}

const rows = (): SpendRecord[] =>
  fs.existsSync(ledgerFile)
    ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8'))
    : []

function run(
  env: Env,
  p: ReturnType<typeof provider>,
  over: Partial<Parameters<typeof attemptTalkingPortrait>[0]> = {}
) {
  return attemptTalkingPortrait({
    config: readPortraitConfig(env),
    provider: p,
    ledger: { db: null, owner: 'owner-1', file: ledgerFile, log },
    mirror: async u => u.replace('kie.invalid', 's3.invalid'),
    day: DAY,
    log,
    sleep: async () => undefined, // no test waits out a real poll
    pollMs: 0,
    ...over,
  })
}

describe('the switch is off until somebody turns it on', () => {
  it('unset means off, and off means the provider is never asked', async () => {
    const p = provider({ taskId: 't1', urls: ['https://kie.invalid/a.mp4'] })
    const r = await run({ [PORTRAIT_ENV.image]: IMAGE }, p)
    expect(r.state).toBe('off')
    expect(r.credits).toBe(0)
    expect(p.calls).toEqual({ credits: 0, createTask: 0, recordInfo: 0 })
    expect(rows()).toEqual([])
  })

  it('the strings that mean off are the ones an owner would actually type', () => {
    for (const raw of ['', '0', 'off', 'no', 'false', undefined]) {
      expect(readPortraitConfig({ [PORTRAIT_ENV.mode]: raw }).mode).toBe('off')
    }
    for (const raw of ['1', 'on', 'ON', 'true']) {
      expect(readPortraitConfig({ [PORTRAIT_ENV.mode]: raw }).mode).toBe('on')
    }
    for (const raw of ['dry', 'dry-run']) {
      expect(readPortraitConfig({ [PORTRAIT_ENV.mode]: raw }).mode).toBe('dry')
    }
  })

  it('with the switch off nothing about the media is even validated', () => {
    // Off is off: a missing portrait is not a complaint anyone has to read.
    const c = readPortraitConfig({ [PORTRAIT_ENV.mode]: '0' })
    expect(c.refusals).toEqual([])
  })
})

describe('what the owner must supply, refused before a single credit', () => {
  it('names the two variables it needs, and the key', async () => {
    const c = readPortraitConfig({ [PORTRAIT_ENV.mode]: 'on' })
    expect(c.refusals.join(' ')).toContain(PORTRAIT_ENV.image)
    expect(c.refusals.join(' ')).toContain(PORTRAIT_ENV.audio)
    expect(c.refusals.join(' ')).toContain(PORTRAIT_ENV.key)
  })

  it('an audio value that is not a file is caught here, not by the provider', () => {
    // veed/fabric-1 answers "audio_url file type not supported" AFTER the
    // request. Cheaper to know before.
    const c = readPortraitConfig({
      ...ON,
      [PORTRAIT_ENV.audio]: 'https://app.t27.ai/voice/owner',
    })
    expect(c.refusals.join(' ')).toContain('audio_url')
  })

  it('a relative portrait path is refused: the provider fetches it itself', () => {
    const c = readPortraitConfig({
      ...ON,
      [PORTRAIT_ENV.image]: '/portrait.jpg',
    })
    expect(c.refusals.length).toBe(1)
  })

  it('a misconfigured switch costs nothing and asks nobody', async () => {
    const p = provider({ taskId: 't1' })
    const r = await run({ [PORTRAIT_ENV.mode]: 'on' }, p)
    expect(r.state).toBe('refused')
    expect(r.credits).toBe(0)
    expect(p.calls.createTask).toBe(0)
    expect(p.calls.credits).toBe(0)
  })
})

describe('the length is a price, so it is clamped', () => {
  it('the default is 6 seconds and 108 credits', () => {
    const c = readPortraitConfig(ON)
    expect(c.seconds).toBe(DEFAULT_SECONDS)
    expect(c.plannedCredits).toBe(DEFAULT_SECONDS * CREDITS_PER_SECOND)
    expect(c.dailyCredits).toBe(DEFAULT_DAILY_CREDITS)
  })

  it('a 30-second request is cut to the ceiling and says so', () => {
    const c = readPortraitConfig({ ...ON, [PORTRAIT_ENV.seconds]: '30' })
    expect(c.seconds).toBe(MAX_SECONDS)
    expect(c.plannedCredits).toBe(MAX_SECONDS * CREDITS_PER_SECOND)
    expect(c.notes.join(' ')).toContain('540') // what 30 s would have cost
  })

  it('nonsense is not a length', () => {
    expect(
      readPortraitConfig({ ...ON, [PORTRAIT_ENV.seconds]: 'x' }).seconds
    ).toBe(DEFAULT_SECONDS)
    expect(
      readPortraitConfig({ ...ON, [PORTRAIT_ENV.seconds]: '-4' }).seconds
    ).toBe(DEFAULT_SECONDS)
  })
})

describe('the daily ceiling refuses, and refuses BEFORE the provider', () => {
  it('a day that has already spent its budget buys nothing more', async () => {
    await ledgerWrite(
      { db: null, owner: 'owner-1', file: ledgerFile, log },
      {
        id: 'earlier',
        day: DAY,
        state: 'delivered',
        credits: 108,
        at: new Date().toISOString(),
      }
    )
    const p = provider({ taskId: 't1', urls: ['https://kie.invalid/a.mp4'] })
    const r = await run(ON, p)
    expect(r.state).toBe('refused')
    expect(r.credits).toBe(0)
    // The measurement that matters: not a log line, a call count.
    expect(p.calls.createTask).toBe(0)
    expect(String(r.reason)).toContain('потолок')
    expect(r.spentBefore).toBe(108)
    expect(lines.join('\n')).toContain('потолок')
  })

  it('yesterday does not count against today', async () => {
    await ledgerWrite(
      { db: null, owner: 'owner-1', file: ledgerFile, log },
      {
        id: 'yesterday',
        day: '2026-08-30',
        state: 'delivered',
        credits: 144,
        at: new Date().toISOString(),
      }
    )
    const p = provider({ taskId: 't1', urls: ['https://kie.invalid/a.mp4'] })
    const r = await run(ON, p)
    expect(r.state).toBe('delivered')
  })

  it('an owner-set ceiling of zero is a working off switch for the money', async () => {
    const p = provider({ taskId: 't1', urls: ['https://kie.invalid/a.mp4'] })
    const r = await run({ ...ON, [PORTRAIT_ENV.dailyCredits]: '0' }, p)
    expect(r.state).toBe('refused')
    expect(p.calls.createTask).toBe(0)
  })

  it('the floor under the balance protects the tool customers use', async () => {
    // image_edit draws on this same balance at ~8.3 credits per edit.
    const p = provider({
      balance: CREDIT_FLOOR + 10,
      taskId: 't1',
      urls: ['https://kie.invalid/a.mp4'],
    })
    const r = await run(ON, p)
    expect(r.state).toBe('refused')
    expect(String(r.reason)).toContain(String(CREDIT_FLOOR))
    expect(p.calls.createTask).toBe(0)
  })

  it('an unreadable balance is not treated as a rich one', async () => {
    const p = provider({ balance: null, taskId: 't1' })
    const r = await run(ON, p)
    expect(r.state).toBe('refused')
    expect(p.calls.createTask).toBe(0)
  })

  it('a database that was promised and did not answer bounds nothing, so it refuses', async () => {
    /*
     * THE CEILING'S ONE REFUNDABLE HOLE. The file half lives in a container
     * with no volumes and is wiped on every deploy, so after a deploy it sums
     * to 0 for a day that already bought a clip. Read the two sources as
     * interchangeable and a single failed SELECT restores the whole day's
     * budget -- repeatedly, bounded only by the 2000-credit floor.
     *
     * The double is as dumb as pg: query() throws, exactly as a connection
     * refusal surfaces there. openDb hands back a real Pool whenever
     * DATABASE_URL is set (pg connects lazily), so a non-null db here really
     * does mean "the durable half was promised".
     */
    const db = {
      query: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:5432')
      },
    }
    const p = provider({ taskId: 't1', urls: ['https://kie.invalid/a.mp4'] })
    const r = await run(ON, p, {
      ledger: { db: db as never, owner: 'owner-1', file: ledgerFile, log },
    })
    expect(r.state).toBe('refused')
    expect(p.calls.createTask).toBe(0)
    expect(lines.join('\n')).toContain('журнал расходов в базе недоступен')
  })

  it('with no database configured the file IS the ledger, and an empty day is 0', async () => {
    // The other half of the same rule. Without this distinction the very first
    // run in any fresh container -- no file yet, nothing spent yet -- refused
    // forever, and the feature could never work at all.
    const spent = await ledgerSpentToday(
      { db: null, owner: 'owner-1', file: ledgerFile, log },
      DAY
    )
    expect(spent.credits).toBe(0)
    expect(spent.sources.join(' ')).toContain('базы нет')
  })

  it('the database wins when it knows more than the wiped file', async () => {
    await ledgerWrite(
      { db: null, owner: 'owner-1', file: ledgerFile, log },
      {
        id: 'local',
        day: DAY,
        state: 'delivered',
        credits: 36,
        at: new Date().toISOString(),
      }
    )
    /*
     * ПОДДЕЛКА ОТВЕЧАЕТ ПО ЗАПРОСУ, А НЕ КОНСТАНТОЙ.
     *
     * Здесь стояло `query: async () => ({ rows: [{ credits: 108 }] })`, и
     * 108 в проверке было её собственным числом, а не следствием SQL.
     * Доказано мутацией: переставить связки местами
     * (`WHERE owner = $2 AND day = $1`) — тест зелёный, а в настоящем
     * Postgres сумма всегда 0, дневной потолок трат НЕ СРАБАТЫВАЕТ НИКОГДА и
     * платный слой тратит без ограничения. Вторая мутация — убрать
     * `AND day = $2` — суммирует всю историю владельца, и потолок наоборот
     * отказывает навсегда, тихо убивая возможность.
     *
     * Теперь подделка проверяет, что запрос спрашивает СУММУ ЗА ДЕНЬ
     * КОНКРЕТНОГО ВЛАДЕЛЬЦА, и в правильном порядке связок.
     */
    const db = {
      query: async (sql: string) => {
        const т = String(sql).replace(/\s+/g, ' ')
        // Леджер шлёт сюда не только сумму (есть и запись расхода): проверяем
        // ИМЕННО запрос суммы, остальные пропускаем без придирок.
        if (/SUM\(credits\)/.test(т)) {
          if (!/WHERE owner = \$1 AND day = \$2/.test(т)) {
            throw new Error(
              `потолок трат спрашивает не то: ${т.slice(0, 160)} — ` +
                'сумма должна быть по владельцу ($1) и за день ($2)'
            )
          }
          return { rows: [{ credits: 108 }] }
        }
        return { rows: [] }
      },
    }
    const spent = await ledgerSpentToday(
      { db: db as never, owner: 'owner-1', file: ledgerFile, log },
      DAY
    )
    // Both are floors, never authorities: the larger one is the honest answer.
    expect(spent.credits).toBe(108)
  })

  it('no ledger at all means no spending', async () => {
    const p = provider({ taskId: 't1', urls: ['https://kie.invalid/a.mp4'] })
    const r = await run(ON, p, {
      // A directory that cannot be created, and no database: nothing can record
      // the attempt, so the attempt does not happen.
      ledger: {
        db: null,
        owner: 'owner-1',
        file: '/proc/no/such/place/spend.json',
        log,
      },
    })
    expect(r.state).toBe('refused')
    expect(p.calls.createTask).toBe(0)
  })
})

describe('dry-run costs nothing and says what it would have cost', () => {
  it('reaches the balance check, stops before the task', async () => {
    const p = provider({ taskId: 't1', urls: ['https://kie.invalid/a.mp4'] })
    const r = await run({ ...ON, [PORTRAIT_ENV.mode]: 'dry' }, p)
    expect(r.state).toBe('dry')
    expect(r.credits).toBe(0)
    expect(p.calls.credits).toBe(1)
    expect(p.calls.createTask).toBe(0)
    expect(String(r.reason)).toContain('108')
    expect(rows()).toEqual([]) // nothing was intended, so nothing is recorded
  })
})

describe('a broken provider still leaves a reel to publish', () => {
  it('a rejected task settles the intent row back to zero', async () => {
    const p = provider({}) // no taskId: the model id was refused
    const r = await run(ON, p)
    expect(r.state).toBe('refused')
    expect(r.credits).toBe(0)
    expect(String(r.reason)).toContain('not supported')
    // The intent row must still exist, and must no longer charge the day.
    expect(rows().length).toBe(1)
    expect(rows()[0].state).toBe('refused')
    expect(rows()[0].credits).toBe(0)
  })

  it('a failed generation is refused with the provider is own words', async () => {
    const p = provider({ taskId: 't2', states: ['fail'] })
    const r = await run(ON, p)
    expect(r.state).toBe('refused')
    expect(String(r.reason)).toContain('audio_url file type not supported')
    expect(r.taskId).toBe('t2')
  })

  it('a timeout keeps the charge and the task id, and is not a rejection', async () => {
    // The distinction is money: kie-image.ts states it -- a timed-out task may
    // still finish and the credits are already gone. Recording it as a
    // rejection is how the same clip gets paid for twice.
    const p = provider({ taskId: 't3', states: ['waiting'], spend: 108 })
    const r = await run(ON, p, { timeoutMs: 0 })
    expect(r.state).toBe('refused')
    expect(String(r.reason)).toContain('t3')
    const row = rows()[0]
    expect(row.state).toBe('timeout')
    expect(row.credits).toBeGreaterThan(0)
    expect(row.taskId).toBe('t3')
  })

  it('success with no file is not success', async () => {
    const p = provider({ taskId: 't4', urls: [] })
    const r = await run(ON, p)
    expect(r.state).toBe('refused')
  })

  it('a clip that cannot be mirrored is refused, and the day is charged', async () => {
    // The provider link expires; publishing it means a broken oval in an hour.
    const p = provider({
      taskId: 't5',
      urls: ['https://kie.invalid/a.mp4'],
      spend: 108,
    })
    const r = await run(ON, p, { mirror: async () => null })
    expect(r.state).toBe('refused')
    expect(r.credits).toBeGreaterThan(0)
    expect(rows()[0].credits).toBeGreaterThan(0)
  })

  it('a mirrored URL that is not a video is refused, not drawn as an empty oval', async () => {
    const p = provider({ taskId: 't6', urls: ['https://kie.invalid/a.mp4'] })
    const r = await run(ON, p, { mirror: async () => 'https://s3.invalid/a' })
    expect(r.state).toBe('refused')
    expect(String(r.reason)).toContain('видео')
  })

  it('every one of those refusals is a value, never a throw', async () => {
    // The caller has no catch: it renders the engraving on a refusal. A throw
    // here would lose the whole 30-minute cycle instead of one optional layer.
    const p = provider({ taskId: undefined })
    await expect(run(ON, p)).resolves.toBeTruthy()
  })
})

describe('a delivered portrait', () => {
  it('is mirrored, priced from the measured delta, and recorded delivered', async () => {
    const p = provider({
      taskId: 't7',
      urls: ['https://kie.invalid/talk.mp4'],
      spend: 108,
    })
    const r = await run(ON, p)
    expect(r.state).toBe('delivered')
    expect(r.url).toBe('https://s3.invalid/talk.mp4')
    expect(r.seconds).toBe(DEFAULT_SECONDS)
    expect(r.credits).toBe(108)
    expect(VIDEO_EXT.test(String(r.url))).toBe(true)
    const row = rows().find(x => x.state === 'delivered')
    expect(row?.credits).toBe(108)
    expect(row?.taskId).toBe('t7')
  })

  it('two clips in one day: the second one hits the ceiling', async () => {
    const first = provider({
      taskId: 't8',
      urls: ['https://kie.invalid/a.mp4'],
      spend: 108,
    })
    expect((await run(ON, first)).state).toBe('delivered')
    const second = provider({
      taskId: 't9',
      urls: ['https://kie.invalid/b.mp4'],
    })
    const r = await run(ON, second)
    expect(r.state).toBe('refused')
    expect(second.calls.createTask).toBe(0)
  })
})

describe('the record that lands in the published recipe', () => {
  it('a refusal carries its reason, its ceiling and a zero cost', () => {
    const c = readPortraitConfig(ON)
    const rec = portraitRecord(c, {
      state: 'refused',
      reason: 'Kie не принял заявку',
      credits: 0,
    })
    expect(rec.state).toBe('refused')
    expect(rec.credits).toBe(0)
    expect(rec.ceiling).toBe(DEFAULT_DAILY_CREDITS)
    expect(rec.model).toBe('veed/fabric-1')
    // A refusal must not claim the media it never produced.
    expect(rec.image).toBeUndefined()
  })

  it('a delivery names the still and the voice: a recipe without the words is not remixable', () => {
    const c = readPortraitConfig(ON)
    const rec = portraitRecord(c, {
      state: 'delivered',
      url: 'https://s3.invalid/a.mp4',
      seconds: 6,
      credits: 108,
      taskId: 't10',
    })
    expect(rec.image).toBe(IMAGE)
    expect(rec.audio).toBe(AUDIO)
    expect(rec.seconds).toBe(6)
    expect(rec.credits).toBe(108)
  })
})
