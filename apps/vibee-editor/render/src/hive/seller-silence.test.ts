import { describe, it, expect } from 'vitest'
import { checkSellerSilence, SELLER_SILENCE_MS } from './seller-silence'

/*
 * WHO WATCHES THE SELLER WHEN THE SELLER STOPS.
 *
 * The sweep reports its own outcome every half hour, so while it runs there
 * is nothing to worry about -- and nothing it can tell us when it does not
 * run. This watchdog lives in the render: a different service, a different
 * process, so the failure it exists for leaves it standing.
 */
const T = Date.parse('2026-09-17T12:00:00Z')

type Row = { at: string }
const poolWith = (sweep: number | null, alarm: number | null) => {
  const written: Array<Record<string, unknown>> = []
  return {
    written,
    query: async (sql: string, params?: unknown[]) => {
      if (/INSERT INTO hive_events/.test(sql)) {
        written.push({
          kind: params?.[0],
          severity: params?.[5],
          what: params?.[4],
        })
        return { rows: [] }
      }
      if (/CREATE TABLE|CREATE INDEX|ALTER TABLE/i.test(sql))
        return { rows: [] }
      const kinds = (params?.[0] ?? []) as string[]
      const want = kinds.includes('seller-silent') ? alarm : sweep
      const rows: Row[] =
        want === null ? [] : [{ at: new Date(want).toISOString() }]
      return { rows }
    },
  }
}

describe('a seller that stopped cannot report that it stopped', () => {
  it('stays quiet while the seller reports on time', async () => {
    const p = poolWith(T - SELLER_SILENCE_MS + 60_000, null)
    expect(await checkSellerSilence(p as never, T)).toBe('fine')
    expect(p.written).toEqual([])
  })

  it('raises an alarm once the silence passes the threshold', async () => {
    const p = poolWith(T - SELLER_SILENCE_MS - 60_000, null)
    expect(await checkSellerSilence(p as never, T)).toBe('alarmed')
    expect(p.written).toHaveLength(1)
    expect(p.written[0]).toMatchObject({
      kind: 'seller-silent',
      severity: 'alarm',
    })
    expect(String(p.written[0].what)).toContain('12 ч')
  })

  /*
   * ONE ALARM PER SILENCE. The report runs on its own timer, and the same
   * sentence every few hours is how an alarm becomes wallpaper.
   */
  it('does not repeat while the same silence lasts', async () => {
    const p = poolWith(T - SELLER_SILENCE_MS * 3, T - 60_000)
    expect(await checkSellerSilence(p as never, T)).toBe('already alarmed')
    expect(p.written).toEqual([])
  })

  it('alarms again once the previous alarm is itself old', async () => {
    const p = poolWith(T - SELLER_SILENCE_MS * 4, T - SELLER_SILENCE_MS - 1)
    expect(await checkSellerSilence(p as never, T)).toBe('alarmed')
    expect(p.written).toHaveLength(1)
  })

  /*
   * NEVER SWEPT is not silence. A fresh install has nothing that could have
   * stopped, and an alarm on the first day teaches the owner to ignore this
   * kind before it ever means anything.
   */
  it('an empty journal is not an alarm', async () => {
    const p = poolWith(null, null)
    expect(await checkSellerSilence(p as never, T)).toBe('never swept')
    expect(p.written).toEqual([])
  })

  /*
   * A watchdog that throws takes the whole report down with it -- and the
   * report is how every other event reaches the owner.
   */
  it('a database that throws is not an alarm and not a crash', async () => {
    const bad = {
      query: async () => {
        throw new Error('connection terminated')
      },
    }
    expect(await checkSellerSilence(bad as never, T)).toBe('quiet')
  })
})
