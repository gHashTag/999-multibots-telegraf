import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * The Robokassa ResultURL must credit a payment once, not once per delivery.
 *
 * The handler reads the payment, short-circuits if it is already COMPLETED,
 * flips it to COMPLETED, and credits. The early read is not atomic with the
 * flip, and Robokassa retries the ResultURL — a slow first request can overlap
 * a retry — so two concurrent deliveries both read PENDING, both flip, and both
 * credit: one payment credited twice. Same shape as the TON check handlers.
 *
 * The fix claims the payment with a compare-and-set: the flip carries
 * .eq('status', PENDING) (atomic in Postgres) and .select() reports the winner;
 * a delivery that finds zero rows acknowledges without crediting. This reads the
 * source and pins that shape — the status guard and a claimed check standing
 * between the completion update and the credit — so a revert to the
 * unconditional update fails here.
 */

const strip = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''")

const FILE = path.join('src', 'api_server', 'routes', 'robokassa.routes.ts')

function completionToCredit(): string {
  const s = strip(fs.readFileSync(FILE, 'utf8'))
  const upd = s.indexOf('status: PaymentStatus.COMPLETED')
  if (upd === -1) return ''
  const credit = s.indexOf('updateUserBalance', upd)
  if (credit === -1) return ''
  return s.slice(upd, credit)
}

describe('robokassa ResultURL credits a payment once', () => {
  const window = completionToCredit()

  it('has a completion update followed by a credit', () => {
    expect(window.length).toBeGreaterThan(0)
  })

  it('the completion update is a compare-and-set on status = PENDING', () => {
    expect(window).toMatch(/\.eq\(\s*''\s*,\s*PaymentStatus\.PENDING\s*\)/)
  })

  it('reads the affected rows with .select()', () => {
    expect(window).toMatch(/\.select\(/)
  })

  it('skips the credit when the claim was already taken', () => {
    expect(window).toMatch(/claimed/)
    expect(window).toMatch(/\breturn\b/)
  })
})
