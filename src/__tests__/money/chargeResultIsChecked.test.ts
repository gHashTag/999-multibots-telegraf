import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * updateUserBalance returns false WITHOUT throwing when the payer row is
 * missing or the insert fails. A call whose result is discarded therefore
 * cannot tell a successful money movement from a failed one, and everything
 * after it proceeds as though it worked.
 *
 * Of forty such calls in production code, thirty-five already bound the result.
 * Three of the remaining five mattered:
 *
 *  - ai-reels-inngest-wizard CHARGED, discarded the result, sent the Inngest
 *    event anyway -- so the generation ran for free -- and then told the user
 *    "Списано: N ⭐" plus a new balance computed by subtraction. Two claims,
 *    neither checked.
 *  - both x402 routes CREDITED a real USDC payment, discarded the result, and
 *    logged "Payment completed" regardless. Someone paid, the stars may never
 *    have arrived, and the only record said it went fine.
 *
 * The charge now gates the paid work, the way aiCoverWizard already did. The
 * credits are not changed -- crediting is the owner's territory -- only the
 * record is: a failure is logged loudly and the success line no longer claims
 * something nobody checked.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

const REELS = 'src/scenes/lipSyncWizard/ai-reels-inngest-wizard.ts'
const X402 = 'src/api_server/routes/x402.routes.ts'

/** A call whose value is thrown away: the statement begins with await. */
const DISCARDED = /(?:^|\n)\s*await\s+updateUserBalance\s*\(/g

describe('money calls whose result is thrown away', () => {
  it('the reels wizard binds its charge and refuses to work unpaid', () => {
    const src = read(REELS)
    expect(src).toMatch(/const charged = await updateUserBalance\(/)
    // The bail must come BEFORE the event is sent, or the generation still
    // runs for free.
    const bail = src.indexOf('if (!charged)')
    const send = src.indexOf('sendAIReelsEvent(')
    expect(bail, 'no bail on a failed charge').toBeGreaterThan(-1)
    expect(bail).toBeLessThan(send)
  })

  it('the reels wizard no longer claims a charge it did not verify', () => {
    // The success message states an amount and a new balance; it may only be
    // reached once the charge is known to have happened.
    const src = read(REELS)
    const bail = src.indexOf('if (!charged)')
    // The TEMPLATE form, not the bare words: the file also explains the defect
    // in a comment, and matching that counted a mention as the message -- the
    // exact mistake this suite exists to catch elsewhere.
    const claim = src.indexOf('Списано: ${')
    expect(claim, 'the charged-amount message must exist').toBeGreaterThan(-1)
    expect(claim).toBeGreaterThan(bail)
  })

  it('both x402 credits are bound and their success line is conditional', () => {
    const src = read(X402)
    expect(
      matchCode(src, /const credited = await updateUserBalance\(/g).length
    ).toBe(2)
    expect(src).toMatch(/PAID BUT NOT CREDITED/)
    expect(src).toMatch(/credited \? 'Payment completed'/)
    expect(src).toMatch(/credited \? 'Payment callback processed'/)
  })

  it('leaves no discarded call anywhere in src', () => {
    /*
     * Population, not a list of the ones I remembered.
     *
     * This used to expect exactly two, both in fal-render-wizard: a charge
     * behind an eslint no-unreachable marker and a refund in the same dead
     * branch, left alone deliberately. On 2026-09-18 they were fixed too --
     * dead code is what a future edit revives, and it would have revived as a
     * free generation and a swallowed refund. The expectation is now an empty
     * list, and the control below is what keeps that from meaning "the matcher
     * broke".
     */
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) {
          if (
            e.name !== 'node_modules' &&
            e.name !== '__tests__' &&
            e.name !== 'test'
          )
            walk(rel)
        } else if (e.name.endsWith('.ts')) files.push(rel)
      }
    }
    walk('src')
    const offenders: string[] = []
    for (const f of files) {
      for (const _ of matchCode(read(f), DISCARDED)) offenders.push(f)
    }
    expect(offenders.length, offenders.join(', ')).toBe(0)
    expect(
      files.length,
      'the walker found no files -- it is blind'
    ).toBeGreaterThan(300)
  })

  it('the matcher still recognises a discarded call', () => {
    // Control: the population check above is an absence check everywhere else.
    expect(
      matchCode('\n  await updateUserBalance(a, b, c)', DISCARDED).length
    ).toBe(1)
    expect(
      matchCode('\n  const ok = await updateUserBalance(a, b, c)', DISCARDED)
        .length
    ).toBe(0)
  })
})
