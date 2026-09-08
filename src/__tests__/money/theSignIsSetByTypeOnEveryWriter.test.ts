import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  CreatePaymentV2Schema,
  PaymentV2Schema,
} from '@/interfaces/zod/payment.zod'

/*
 * THE BALANCE IS NOT A COLUMN. get_user_balance SUMS payments_v2, so a row
 * carrying negative stars on a MONEY_OUTCOME is a CREDIT -- 114 rows at -9
 * stars once credited 1026 where they should have debited.
 *
 * updateUserBalance grew a guard for that and the guard stayed inside it,
 * while SEVEN places write the same table. Found by enumerating the writers by
 * the ACTION -- an insert into payments_v2 -- rather than by the name of the
 * helper everyone remembers, which is how the same class was found twice
 * before in the render app.
 *
 * Three properties: writes refuse the inverted row, READS still accept the
 * history that already contains it, and no new writer appears without one of
 * the two guards.
 */
const ROOT = process.cwd()

const base = {
  telegram_id: 123,
  amount: 10,
  status: 'COMPLETED',
  type: 'MONEY_OUTCOME',
  description: 'test',
  bot_name: 'b',
  service_type: null,
  operation_id: 'x',
  model_name: null,
}

describe('the sign is set by type, on every writer', () => {
  it('refuses a negative amount on the validated write path', () => {
    const r = CreatePaymentV2Schema.safeParse({ ...base, stars: -9 })
    expect(r.success).toBe(false)
  })

  it('still accepts an ordinary write', () => {
    // Without this the guard could be a blanket that rejects everything and
    // the first assertion would not notice.
    const r = CreatePaymentV2Schema.safeParse({ ...base, stars: 9 })
    expect(r.success).toBe(true)
  })

  it('READS still accept the negative history that is already in the table', () => {
    /*
     * The 114 rows are still there. A read schema that refused them would turn
     * a past accounting error into a present outage, so the constraint is on
     * the create schema alone -- and that separation is the property, not an
     * implementation detail.
     */
    const row = {
      ...base,
      id: 1,
      stars: -9,
      created_at: new Date().toISOString(),
      payment_date: new Date().toISOString(),
      currency: 'STARS',
      inv_id: null,
      invoice_url: null,
      metadata: {},
      language: 'ru',
      payment_method: 'System',
      subscription_type: null,
      is_system_payment: false,
      cost: 0,
      category: 'REAL',
    }
    expect(PaymentV2Schema.safeParse(row).success).toBe(true)
  })

  /**
   * Writers whose amount cannot be inverted by a caller, each read on
   * 2026-09-08. A name here is a claim that somebody looked; the staleness
   * check below stops the list rotting into decoration.
   */
  const DECLARED: Record<string, string> = {
    'src/handlers/groupMemberHandler.ts':
      'a literal constant, no caller input reaches stars',
    'src/scenes/tonPaymentScene/index.ts':
      'stars comes from the server-side options table, not from the request',
    'src/scenes/tonNativePaymentScene/index.ts':
      'stars comes from the server-side options table, not from the request',
  }

  /** Files that insert into payments_v2, found by the action. */
  function writers(): string[] {
    const files: string[] = []
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) {
          if (!/node_modules|__tests__/.test(p)) walk(p)
        } else if (/\.ts$/.test(p) && !/\.test\./.test(p)) files.push(p)
      }
    }
    walk(path.join(ROOT, 'src'))
    return files
      .filter(p =>
        /from\('payments_v2'\)[\s\S]{0,120}?\.insert/.test(
          fs.readFileSync(p, 'utf8')
        )
      )
      .map(p => path.relative(ROOT, p))
  }

  it('finds the writers at all — otherwise the next assertion proves nothing', () => {
    expect(writers().length).toBeGreaterThanOrEqual(5)
  })

  it('every writer is validated, guarded, or declared', () => {
    const open = writers().filter(rel => {
      const t = fs.readFileSync(path.join(ROOT, rel), 'utf8')
      const validated = /CreatePaymentV2Schema\.parse/.test(t)
      const guarded = /(<\s*0|<=\s*0)[\s\S]{0,600}?(return false|throw)/.test(t)
      return !validated && !guarded && !(rel in DECLARED)
    })
    expect(
      open,
      'writes payments_v2 with no schema, no sign guard and no declaration'
    ).toEqual([])
  })

  it('declares nothing that has stopped writing payments', () => {
    const present = new Set(writers())
    expect(
      Object.keys(DECLARED).filter(f => !present.has(f)),
      'declared but no longer a writer'
    ).toEqual([])
  })
})
