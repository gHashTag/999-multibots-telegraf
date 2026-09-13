import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  crmCarrier,
  setCrmCarrier,
  resetCarrierForTests,
  sweepDriver,
} from '@/services/crmProactive'
import {
  crmProactiveSweep,
  CRM_SWEEP_CRON,
} from '@/inngest_app/functions/crm/crmProactiveSweep'

/**
 * THE SELLER'S CLOCK ON INNGEST (2026-09-12). The tick did not change; what
 * drives it did. These tests pin the contract between the entry point, the
 * carrier registry and the cron function.
 */
const read = (rel: string) =>
  readFileSync(join(__dirname, '..', '..', rel), 'utf8')

describe('crm-proactive-sweep, the Inngest cron', () => {
  it('is a 30-minute cron with no retries and one run at a time', () => {
    const fn = crmProactiveSweep as any
    expect(fn.id('telegram-bot-client')).toBe(
      'telegram-bot-client-crm-proactive-sweep'
    )
    expect(CRM_SWEEP_CRON).toBe('*/30 * * * *')
    const crons = (fn.opts.triggers ?? [])
      .map((t: any) => t.cron)
      .filter(Boolean)
    expect(crons).toEqual([CRM_SWEEP_CRON])
    expect(fn.opts.retries).toBe(0)
    expect(fn.opts.concurrency).toEqual({ limit: 1 })
    expect(typeof fn.onFailureFn).toBe('function')
  })

  it('is served and in the manifest as spec+code', () => {
    expect(read('inngest_app/registerFunctions.ts')).toContain(
      'crmProactiveSweep,'
    )
    const m = JSON.parse(read('inngest_app/functions.manifest.json'))
    const e = m.functions.find((f: any) => f.id === 'crm-proactive-sweep')
    expect(e).toBeDefined()
    expect(e.control).toBe('spec+code')
    expect(e.cron).toBe(CRM_SWEEP_CRON)
    expect(e.retries).toBe(0)
  })
})

describe('the carrier registry and the driver switch', () => {
  const env = { ...process.env }
  beforeEach(() => resetCarrierForTests())
  afterEach(() => {
    process.env = { ...env }
    resetCarrierForTests()
  })

  it('no carrier until the entry registers one', () => {
    expect(crmCarrier()).toBeNull()
    const bot = { telegram: {}, botInfo: { username: 'b' } } as any
    setCrmCarrier(bot, { ownerId: '1' })
    expect(crmCarrier()).toEqual({ bot, opts: { ownerId: '1' } })
  })

  it('inngest is the default driver; only the literal "timer" restores the interval', () => {
    expect(sweepDriver({})).toBe('inngest')
    expect(sweepDriver({ CRM_SWEEP_DRIVER: 'inngest' })).toBe('inngest')
    expect(sweepDriver({ CRM_SWEEP_DRIVER: 'TIMER ' })).toBe('timer')
    expect(sweepDriver({ CRM_SWEEP_DRIVER: 'cron' })).toBe('inngest')
  })

  it('the entry registers the carrier in BOTH clocks and starts the timer only on demand', () => {
    for (const file of ['index.ts', 'bot.ts']) {
      const s = read(file)
      expect(s, file).toContain('setCrmCarrier(carrier')
      expect(s, file).toMatch(/=== 'timer'\)/)
    }
  })
})
