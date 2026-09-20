/**
 * The report is what the owner reads; these tests pin what it must never do.
 */
import { describe, it, expect } from 'vitest'
import {
  buildClientTelemetryReport,
  unavailableReport,
  trackPeople,
  sceneLabel,
  agoRu,
} from '@/services/clientTelemetryReport'
import type { ClientEventRow } from '@/core/telemetry/clientEvents'
import { sceneFromSession } from '@/core/telemetry/telemetryMiddleware'

const NOW = Date.parse('2026-09-20T12:00:00.000Z')
const MIN = 60000

function ev(p: Partial<ClientEventRow> & { at: number }): ClientEventRow {
  return {
    telegramId: '111',
    botName: 'neuro_blogger_bot',
    username: 'vasya',
    fromScene: 'main_menu',
    toScene: 'neuro_photo',
    ...p,
  }
}

describe('trackPeople', () => {
  it('collapses repeated visits to one step in the path but counts every move', () => {
    const t = trackPeople([
      ev({ at: NOW - 60 * MIN, toScene: 'neuro_photo' }),
      ev({
        at: NOW - 50 * MIN,
        fromScene: 'neuro_photo',
        toScene: 'main_menu',
      }),
      ev({ at: NOW - 40 * MIN, toScene: 'neuro_photo' }),
    ])
    expect(t).toHaveLength(1)
    expect(t[0].steps).toBe(3)
    expect(t[0].scenes).toEqual(['neuro_photo', 'main_menu', 'neuro_photo'])
    expect(t[0].lastScene).toBe('neuro_photo')
  })

  it('keeps a username that appeared on any of the person events', () => {
    const t = trackPeople([
      ev({ at: NOW - 10 * MIN, username: null }),
      ev({ at: NOW - 5 * MIN, username: 'late_name' }),
    ])
    expect(t[0].username).toBe('late_name')
  })
})

describe('buildClientTelemetryReport', () => {
  const base = { now: NOW, tz: 'Europe/Moscow' as const, previousRows: [] }

  it('names the client and the scene they stopped in', () => {
    const text = buildClientTelemetryReport({
      ...base,
      rows: [ev({ at: NOW - 120 * MIN, toScene: 'starPaymentScene' })],
    })
    expect(text).toContain('@vasya')
    expect(text).toContain('Оплата звёздами')
    expect(text).toContain('2 ч назад')
  })

  it('does not call the main menu a place someone got stuck in', () => {
    const text = buildClientTelemetryReport({
      ...base,
      rows: [ev({ at: NOW - 300 * MIN, toScene: 'main_menu' })],
    })
    const stall = text.split('На чём встали:')[1].split('\n')[1]
    expect(stall).toBe('—')
  })

  it('does not report as stalled someone who is still working', () => {
    const text = buildClientTelemetryReport({
      ...base,
      rows: [ev({ at: NOW - 2 * MIN, toScene: 'neuro_photo' })],
    })
    expect(text.split('На чём встали:')[1].split('\n')[1]).toBe('—')
  })

  it('separates people who are new from people who were here yesterday', () => {
    const text = buildClientTelemetryReport({
      ...base,
      rows: [ev({ at: NOW - 30 * MIN, telegramId: '222', username: 'fresh' })],
      previousRows: [
        ev({ at: NOW - 30 * 60 * MIN, telegramId: '111', username: 'vasya' }),
      ],
    })
    expect(text).toContain('новых 1')
    expect(text).toContain('@fresh')
    // vasya was here yesterday and is not here today.
    expect(text.split('Замолчали')[1]).toContain('@vasya')
  })

  it('keeps every section, with a dash, when the day was empty', () => {
    const text = buildClientTelemetryReport({ ...base, rows: [] })
    expect(text).toContain('Куда заходили:')
    expect(text).toContain('На чём встали:')
    expect(text).toContain('Замолчали')
    expect(text).toContain('0 чел.')
  })

  it('escapes HTML so a username cannot break the message', () => {
    const text = buildClientTelemetryReport({
      ...base,
      rows: [ev({ at: NOW - 60 * MIN, username: '<b>x' })],
    })
    expect(text).toContain('&lt;b&gt;x')
  })

  it('never invents advice', () => {
    const text = buildClientTelemetryReport({
      ...base,
      rows: [ev({ at: NOW - 60 * MIN })],
    })
    expect(text).not.toContain('рассылк')
    expect(text).not.toContain('Рекомендаци')
  })
})

describe('unavailableReport', () => {
  it('says it did not count instead of printing zeros', () => {
    const text = unavailableReport(NOW, 'Europe/Moscow', 'connection refused')
    expect(text).toContain('Не посчитано')
    expect(text).toContain('connection refused')
    expect(text).not.toContain('0 чел.')
  })
})

describe('sceneLabel', () => {
  it('falls back to the raw id rather than guessing a name', () => {
    expect(sceneLabel('some_unmapped_wizard')).toBe('some_unmapped_wizard')
    expect(sceneLabel('neuro_photo')).toBe('Нейрофото')
    expect(sceneLabel(null)).toBe('вне сцен')
  })
})

describe('agoRu', () => {
  it('rounds to a unit a human reads', () => {
    expect(agoRu(5 * MIN)).toBe('5 мин назад')
    expect(agoRu(180 * MIN)).toBe('3 ч назад')
    expect(agoRu(72 * 60 * MIN)).toBe('3 дн назад')
  })
})

describe('sceneFromSession', () => {
  it('reads the scene Telegraf stores, and tolerates anything else', () => {
    expect(sceneFromSession({ __scenes: { current: 'neuro_photo' } })).toBe(
      'neuro_photo'
    )
    expect(sceneFromSession({ __scenes: {} })).toBeNull()
    expect(sceneFromSession({})).toBeNull()
    expect(sceneFromSession(undefined)).toBeNull()
    expect(sceneFromSession({ __scenes: { current: 42 } })).toBeNull()
  })
})
