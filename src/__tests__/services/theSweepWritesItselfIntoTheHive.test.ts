import { describe, it, expect, vi, afterEach } from 'vitest'
import { noteForSweep, noteSweepToHive } from '@/services/hiveNote'

/**
 * THE SWEEP WRITES ITSELF INTO THE HIVE JOURNAL (owner, 2026-09-11).
 * Quiet sweeps were invisible; failed ones rang twice if this were an alarm.
 */
const OWNER = '144022504'

afterEach(() => vi.unstubAllEnvs())

describe('what the journal is told', () => {
  it('idle and card are normal notes, failed is attention, held/busy are not sweeps', () => {
    expect(
      noteForSweep(OWNER, { did: 'idle', why: 'crm_leads: кандидатов нет' })
    ).toEqual({
      kind: 'sweep-idle',
      who: OWNER,
      what: 'crm_leads: кандидатов нет',
      severity: 'normal',
    })
    expect(
      noteForSweep(OWNER, { did: 'card', why: 'ответ Тиму', id: 'p1' })
    ).toMatchObject({
      kind: 'sweep-card',
      severity: 'normal',
    })
    expect(
      noteForSweep(OWNER, {
        did: 'failed',
        why: 'ждёт Tim (next=reply), модель написала имя инструмента tg_send вместо вызова [модель ollama/qwen3:1.7b]: [[Подпись|tg_send]]',
      })
    ).toMatchObject({ kind: 'sweep-failed', severity: 'attention' })
    expect(
      noteForSweep(OWNER, { did: 'held', why: 'карточка ждёт' })
    ).toBeNull()
    expect(noteForSweep(OWNER, { did: 'busy', why: 'ещё идёт' })).toBeNull()
  })

  it('a scoped item carries its label, and the note is capped at 300 chars', () => {
    const n = noteForSweep(
      OWNER,
      { did: 'idle', why: 'x'.repeat(400) },
      '3/5 Анна'
    )
    expect(n?.what.startsWith('3/5 Анна: xxx')).toBe(true)
    expect(n?.what.length).toBe(300)
  })
})

describe('sending it', () => {
  it('posts to /api/hive/note over the server key and never throws', async () => {
    vi.stubEnv('RENDER_API_KEY', 'k')
    const sent: Array<{ url: string; init: any }> = []
    const fetchImpl = (async (url: string, init: any) => {
      sent.push({ url, init })
      return new Response('{"ok":true}', { status: 200 })
    }) as never
    const out = await noteSweepToHive(
      OWNER,
      { did: 'idle', why: 'тихо' },
      { fetchImpl }
    )
    expect(out).toBe('noted')
    expect(sent[0].url).toContain('/api/hive/note')
    expect(sent[0].init.headers['X-Api-Key']).toBe('k')
    expect(JSON.parse(sent[0].init.body)).toMatchObject({
      kind: 'sweep-idle',
      who: OWNER,
    })
  })

  it('no key: not noted, no request; held: skipped; refused or down: not noted', async () => {
    let calls = 0
    const counting = (async () => {
      calls += 1
      return new Response('{}', { status: 403 })
    }) as never
    expect(
      await noteSweepToHive(
        OWNER,
        { did: 'idle', why: 'x' },
        { fetchImpl: counting }
      )
    ).toBe('not noted')
    expect(calls).toBe(0)
    vi.stubEnv('RENDER_API_KEY', 'k')
    expect(
      await noteSweepToHive(
        OWNER,
        { did: 'held', why: 'x' },
        { fetchImpl: counting }
      )
    ).toBe('skipped')
    expect(calls).toBe(0)
    expect(
      await noteSweepToHive(
        OWNER,
        { did: 'idle', why: 'x' },
        { fetchImpl: counting }
      )
    ).toBe('not noted')
    expect(calls).toBe(1)
    const down = (async () => {
      throw new Error('ECONNREFUSED')
    }) as never
    expect(
      await noteSweepToHive(
        OWNER,
        { did: 'failed', why: 'x' },
        { fetchImpl: down }
      )
    ).toBe('not noted')
  })
})

/*
 * HOW LONG IT TOOK, IN THE LINE THAT IS ACTUALLY READ.
 *
 * The duration was measured every half hour and thrown away: the Inngest step
 * returned `ms` into a payload nothing reads, while the log and the journal
 * carried none. The one number that says whether the model budget is tight
 * existed and was unavailable.
 */
describe('the journal says how long the sweep took', () => {
  const OWNER_T = '144022504'

  it('appends the duration in whole seconds', () => {
    const n = noteForSweep(OWNER_T, {
      did: 'card',
      why: 'подготовил подарок',
      id: 'p1',
      ms: 117_400,
    })
    expect(n?.what).toContain('подготовил подарок')
    expect(n?.what.endsWith(' [117s]'), n?.what).toBe(true)
  })

  /*
   * ASCII, NOT CYRILLIC. `[117s]` and `[117с]` are the same picture in a
   * terminal and different bytes. A tool written against the wrong letter
   * finds nothing and reports a journal with no timings, which reads exactly
   * like a journal that has none.
   */
  it('the marker is ASCII, so a reader can find it', () => {
    const n = noteForSweep(OWNER_T, { did: 'idle', why: 'тихо', ms: 1_000 })
    const tail = n?.what.slice(-5) ?? ''
    expect(
      [...tail].every(c => c.charCodeAt(0) < 128),
      tail
    ).toBe(true)
    expect(/\[\d+s\]$/.test(n?.what ?? ''), n?.what).toBe(true)
  })

  it('without a duration nothing is appended and nothing is invented', () => {
    const n = noteForSweep(OWNER_T, { did: 'idle', why: 'тихо' })
    expect(n?.what).toBe('тихо')
  })

  it('a nonsense duration is dropped rather than printed', () => {
    for (const ms of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const n = noteForSweep(OWNER_T, { did: 'idle', why: 'тихо', ms })
      expect(n?.what, String(ms)).toBe('тихо')
    }
  })

  it('a long reason makes room for the duration instead of losing it', () => {
    const long = 'я'.repeat(400)
    const n = noteForSweep(OWNER_T, { did: 'failed', why: long, ms: 9_000 })
    expect(n!.what.length).toBeLessThanOrEqual(300)
    expect(n!.what.endsWith(' [9s]'), n!.what.slice(-10)).toBe(true)
  })
})
