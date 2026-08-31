/**
 * emailWizard.getInvoiceId must NEVER log the Robokassa merchant Password1.
 *
 * getInvoiceId received password1 (the real ROBOKASSA_PASSWORD_1) and logged it
 * verbatim in the 'Start getInvoiceId' object. The global setupSafeConsoleLogging
 * patch does not redact plain strings, so the secret reached stdout/Railway logs;
 * a log reader could forge valid Robokassa payment-initiation signatures. The
 * sibling getRuBillWizard already logs only hasPassword1 / a 5-char preview.
 *
 * Deterministic behavioral test: getInvoiceId is pure (md5 + string building, no
 * network), so we force a sentinel password through it and assert the sentinel
 * never appears in any captured console line. Mutation — restoring the bare
 * `password1` in the log — makes the sentinel appear and turns this RED.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getInvoiceId } from '@/scenes/emailWizard'

const SENTINEL = 'SENTINEL_PW1_DO_NOT_LOG'

describe('emailWizard getInvoiceId does not log the Robokassa Password1', () => {
  const captured: string[] = []
  const spies: Array<{ mockRestore: () => void }> = []

  beforeEach(() => {
    captured.length = 0
    const grab = (...args: unknown[]) => {
      captured.push(
        args
          .map(a => {
            try {
              return typeof a === 'string' ? a : JSON.stringify(a)
            } catch {
              return String(a)
            }
          })
          .join(' ')
      )
    }
    spies.push(vi.spyOn(console, 'log').mockImplementation(grab))
    spies.push(vi.spyOn(console, 'error').mockImplementation(grab))
    spies.push(vi.spyOn(console, 'warn').mockImplementation(grab))
  })
  afterEach(() => {
    for (const s of spies.splice(0)) s.mockRestore()
  })

  it('never writes the secret password to any console line', async () => {
    await getInvoiceId('merchant', 100, 123, 'desc', SENTINEL)
    const leaked = captured.filter(l => l.includes(SENTINEL))
    expect(
      leaked,
      `the Robokassa Password1 leaked to ${leaked.length} log line(s)`
    ).toEqual([])
    // sanity: the function DID run and log something (else the test is vacuous)
    expect(captured.length).toBeGreaterThan(0)
  })
})
