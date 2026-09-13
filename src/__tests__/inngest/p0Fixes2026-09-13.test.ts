/**
 * Pins the deterministic bugs fixed after the 2026-09-13 function audit
 * (docs/audit/inngest-improvement-plan-2026-09-13.md).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/core/supabase', () => ({ supabase: {}, supabaseAdmin: {} }))
vi.mock('@/utils/logger', () => ({
  logger: { info() {}, warn() {}, error() {}, debug() {} },
}))
vi.mock('@/inngest_app/client', () => ({
  inngest: { createFunction: () => ({}), send: async () => ({}) },
  createInngestFailureHandler: () => async () => undefined,
}))
vi.mock('@/inngest_app/inngestClient', () => ({
  inngest: { createFunction: () => ({}), send: async () => ({}) },
}))
vi.mock('@/inngest_app/functions/monitoring/monitoringBot', () => ({
  getMonitoringBot: () => null,
}))

import {
  logLineTimestamp,
  filterLast24Hours,
  defaultLogDir,
} from '@/inngest_app/functions/monitoring/logMonitor'
import { isBeforeYesterdayCutoff } from '@/inngest_app/functions/analytics/dailySalesAdvisor'

describe('monitoring-logs-analyze reads what the logger writes', () => {
  it('parses the winston printf line format', () => {
    expect(logLineTimestamp('2026-09-13 02:17:45 [INFO]: hello')).toBe(
      Date.parse('2026-09-13T02:17:45Z')
    )
  })
  it('still parses the legacy JSON timestamp form', () => {
    expect(logLineTimestamp('{"timestamp":"2026-09-13T02:17:45.000Z"}')).toBe(
      Date.parse('2026-09-13T02:17:45Z')
    )
  })
  it('returns null for continuation lines', () => {
    expect(logLineTimestamp('    at Object.<anonymous> (x.ts:1:1)')).toBeNull()
  })
  it('keeps only the last 24 hours', () => {
    const now = Date.parse('2026-09-13T03:00:00Z')
    const logs = [
      '2026-09-11 03:00:00 [INFO]: old',
      '2026-09-12 02:59:59 [INFO]: just too old',
      '2026-09-12 03:00:01 [WARN]: keep',
      '2026-09-13 02:00:00 [ERROR]: keep too',
    ].join('\n')
    expect(filterLast24Hours(logs, now).split('\n')).toEqual([
      '2026-09-12 03:00:01 [WARN]: keep',
      '2026-09-13 02:00:00 [ERROR]: keep too',
    ])
  })
  it('defaults to <cwd>/logs like src/utils/logger.ts, LOG_DIR overrides', () => {
    const prev = process.env.LOG_DIR
    delete process.env.LOG_DIR
    expect(defaultLogDir()).toBe(`${process.cwd()}/logs`)
    process.env.LOG_DIR = '/var/x'
    expect(defaultLogDir()).toBe('/var/x')
    if (prev === undefined) delete process.env.LOG_DIR
    else process.env.LOG_DIR = prev
  })
})

describe('analytics-sales-advise splits yesterday from today by created_at', () => {
  const cutoff = Date.parse('2026-09-12T09:00:00Z')
  it('a row older than the cutoff is "yesterday"', () => {
    expect(
      isBeforeYesterdayCutoff({ created_at: '2026-09-11T20:00:00Z' }, cutoff)
    ).toBe(true)
  })
  it('a row inside the 1-day window is not', () => {
    expect(
      isBeforeYesterdayCutoff({ created_at: '2026-09-12T10:00:00Z' }, cutoff)
    ).toBe(false)
  })
  it('rows without a parsable created_at are excluded', () => {
    expect(isBeforeYesterdayCutoff({ created_at: null }, cutoff)).toBe(false)
    expect(isBeforeYesterdayCutoff({ created_at: 'nope' }, cutoff)).toBe(false)
  })
})
