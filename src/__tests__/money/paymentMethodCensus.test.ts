import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * A PAYMENT METHOD THAT CAN BE OFFERED MUST BE ONE THAT CAN CREDIT.
 *
 * x402 took twelve payments over nine months while its receiving end was
 * switched off on purpose. The two halves of that fact lived in different
 * files and different suites: one census knew the endpoint was dead, another
 * knew people were paying, and nothing joined them.
 *
 * scripts/payment-method-census.cjs is that join. This file keeps it running on
 * every suite pass, so the joining question is asked by default rather than
 * when somebody remembers the command.
 *
 * The script carries its own controls and exits 2 rather than print a table it
 * cannot stand behind -- Robokassa must read as creditable (75 payments really
 * completed through it), CryptoBot must not (nothing receives its callback),
 * x402 must not (its only credit site sits in an unmounted router), and the
 * verdict must not move when the search window doubles. Running it here
 * exercises all four.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const SCRIPT = path.join(REPO, 'scripts', 'payment-method-census.cjs')

function run(args: string[] = []) {
  try {
    return {
      code: 0,
      out: execFileSync('node', [SCRIPT, ...args], {
        cwd: REPO,
        encoding: 'utf8',
      }),
    }
  } catch (e: any) {
    return {
      code: e.status as number,
      out: String(e.stdout) + String(e.stderr),
    }
  }
}

describe('no payment method takes money it cannot deliver', () => {
  it('the census can see both sides, and says so', () => {
    const { code, out } = run()
    expect(code, out).toBe(0)

    // A count is the difference between "nothing is wrong" and "nothing was
    // looked at". The script refuses if the enum is short or if too few routers
    // resolve as mounted, so reaching here is already part of the check.
    const n = Number(/payment methods in the enum: (\d+)/.exec(out)?.[1] ?? 0)
    expect(n, 'the enum must be read, not assumed').toBeGreaterThanOrEqual(8)
    expect(out, 'a channel known to work must read as creditable').toMatch(
      /ok Robokassa/
    )
  })

  it('every method that takes money either credits it or says why not', () => {
    const { code, out } = run(['--gate'])
    expect(
      code,
      'a payment method writes a PENDING row and nothing can complete it:\n' +
        out
    ).toBe(0)
  })
})
