import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { logger } from '@/utils/logger'
import {
  refuseUnpaidGeneration,
  BalanceRefusedError,
  INSUFFICIENT_FUNDS_SENTINEL,
} from '@/price/helpers/refuseUnpaidGeneration'

/**
 * A REFUSED CHARGE WAS SERVING THE GENERATION ANYWAY.
 *
 * Three image services -- FluxKontextPro, QwenImageEdit and SeedEdit3 -- called
 * processBalanceOperation, bound its answer, and never looked at `.success`.
 * processBalanceOperation itself had already told the customer their balance was
 * short and offered a top-up button (processBalanceOperation.ts:141-151); the
 * service then continued past that message, called the provider, and handed over
 * the paid image. Somebody with an empty wallet was refused and served in the
 * same breath.
 *
 * The tell that this was an omission rather than a decision: each of the three
 * sat next to a refund guarded by `if (charged)`. Someone had reasoned about
 * the insufficient-funds path well enough to protect the refund side and never
 * built the refusal side. FluxKontextPro's comment even recorded the behaviour
 * as a permanent fact of the file.
 *
 * TWO THINGS HAD TO BE TRUE AT ONCE, which is why this is one ratchet and not
 * two:
 *
 *  1. The generation must stop. That is the money.
 *  2. Stopping must not page the owner. Every logger.error in this process is
 *     a Telegram message to the owner's group (utils/logger.ts), so a naive
 *     `throw` into an outer catch that logs at error would have traded free
 *     images for one push notification per broke customer -- a new alert storm
 *     built out of a money fix.
 *
 * refuseUnpaidGeneration is the single place that decides which of the two a
 * failed charge is. An empty wallet is `info` and the customer has already been
 * told; anything else -- a non-positive price, a failed balance WRITE, a thrown
 * exception -- is `error`, because that is our machinery and nobody else will
 * notice it.
 */

// ---------------------------------------------------------------------------
// The decision itself, exercised rather than read.
// ---------------------------------------------------------------------------

describe('refuseUnpaidGeneration tells an empty wallet from a broken one', () => {
  const ctx = { service: 'TestService', telegram_id: '123' }

  beforeEach(() => vi.clearAllMocks())

  it('lets a successful charge through untouched', () => {
    expect(() =>
      refuseUnpaidGeneration({ success: true, newBalance: 5 } as any, ctx)
    ).not.toThrow()
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('an empty wallet throws and does NOT page the owner', () => {
    let caught: unknown
    try {
      refuseUnpaidGeneration(
        {
          success: false,
          error: 'Insufficient balance',
          insufficientFunds: true,
        } as any,
        ctx
      )
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(BalanceRefusedError)
    expect((caught as BalanceRefusedError).insufficientFunds).toBe(true)
    // The customer was messaged by processBalanceOperation, with buttons.
    expect((caught as BalanceRefusedError).userAlreadyNotified).toBe(true)
    // THE ALERT TEST. logger.error is a push notification to a human.
    expect(
      logger.error,
      'a customer with no stars must not wake the owner'
    ).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalled()
  })

  it('a failed balance WRITE throws and DOES page the owner', () => {
    let caught: unknown
    try {
      refuseUnpaidGeneration(
        {
          success: false,
          error: 'Failed to update balance',
          insufficientFunds: false,
        } as any,
        ctx
      )
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(BalanceRefusedError)
    expect((caught as BalanceRefusedError).insufficientFunds).toBe(false)
    // Nobody has told the customer anything; the caller must.
    expect((caught as BalanceRefusedError).userAlreadyNotified).toBe(false)
    expect(logger.error, 'an outage must reach a human').toHaveBeenCalled()
    // The real reason survives instead of being flattened to "no stars".
    expect((caught as BalanceRefusedError).reason).toBe(
      'Failed to update balance'
    )
  })

  it('the no-stars sentinel is used ONLY for no stars', () => {
    // Five call sites catch this exact string and render a top-up prompt
    // (`.includes('Not enough stars')`). Throwing it for a database failure
    // tells a paying customer they are broke and files the outage as poverty.
    const wallet = (() => {
      try {
        refuseUnpaidGeneration(
          { success: false, insufficientFunds: true } as any,
          ctx
        )
      } catch (e) {
        return e as Error
      }
    })()
    expect(wallet!.message).toBe(INSUFFICIENT_FUNDS_SENTINEL)

    for (const notMoney of [
      { success: false, error: 'Failed to update balance' },
      { success: false, error: 'Invalid payment amount' },
      { success: false, error: 'boom' },
      null,
      undefined,
    ]) {
      const e = (() => {
        try {
          refuseUnpaidGeneration(notMoney as any, ctx)
        } catch (err) {
          return err as Error
        }
      })()
      expect(e, 'every non-success must refuse').toBeInstanceOf(
        BalanceRefusedError
      )
      expect(
        e!.message,
        `"${JSON.stringify(notMoney)}" must not claim the customer is broke`
      ).not.toContain(INSUFFICIENT_FUNDS_SENTINEL)
    }
  })

  it('a missing result is machinery, not poverty', () => {
    // fail closed: no answer at all is the least-known state there is, and the
    // one most likely to be a real fault.
    expect(() => refuseUnpaidGeneration(undefined, ctx)).toThrow(
      BalanceRefusedError
    )
    expect(logger.error).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// The services that must consult it. Read from source, anchored on CODE.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..', '..', '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

/**
 * The three that served the image anyway, plus the four that flattened.
 *
 * The flattening set is four files and five throw sites, not the one the
 * original report named -- the census below found the rest. Two different
 * defects, one repair, because a single helper answers both questions: should
 * this generation proceed, and was this the customer's fault.
 */
const SERVED_ANYWAY = [
  'src/services/generateFluxKontextPro.ts',
  'src/services/generateQwenImageEdit.ts',
  'src/services/generateSeedEdit3.ts',
]

const FLATTENED = [
  'src/services/generateFluxKontextMax.ts',
  'src/services/generateFluxKontext.ts',
  'src/services/generateTextToImageDirect.ts',
  'src/services/imageUpscaler.ts',
]

const REPAIRED = [...SERVED_ANYWAY, ...FLATTENED]

describe('the repaired services refuse before they spend', () => {
  it.each(REPAIRED)('%s refuses a failed charge in CODE', file => {
    const src = read(file)
    // matchCode masks comments and string bodies, so the long explanation
    // written above each guard cannot satisfy this on its own -- which is the
    // exact mistake this suite exists to catch elsewhere.
    expect(
      matchCode(src, /refuseUnpaidGeneration\(/g).length,
      `${file}: no call in code`
    ).toBeGreaterThanOrEqual(1)
    expect(src, `${file}: not imported`).toMatch(
      /import[\s\S]{0,300}refuseUnpaidGeneration[\s\S]{0,300}from '@\/price\/helpers'/
    )
  })

  const PROVIDER_CALL: Record<string, RegExp> = {
    'src/services/generateFluxKontextPro.ts': /replicate\.run\(/g,
    'src/services/generateQwenImageEdit.ts': /replicate\.run\(/g,
    'src/services/generateSeedEdit3.ts': /replicate\.run\(/g,
    'src/services/generateFluxKontextMax.ts': /replicate\.run\(/g,
  }

  it.each(Object.keys(PROVIDER_CALL))(
    '%s refuses BEFORE the provider is called',
    file => {
      const src = read(file)
      const refusal = matchCode(src, /refuseUnpaidGeneration\(/g).map(
        m => m.index as number
      )
      const provider = matchCode(src, PROVIDER_CALL[file]).map(
        m => m.index as number
      )
      expect(refusal.length, `${file}: no refusal in code`).toBeGreaterThan(0)
      expect(
        provider.length,
        `${file}: no provider call found`
      ).toBeGreaterThan(0)
      expect(
        Math.min(...refusal),
        `${file}: the provider is paid before the wallet is checked`
      ).toBeLessThan(Math.min(...provider))
    }
  )

  it.each([...SERVED_ANYWAY, 'src/services/generateFluxKontextMax.ts'])(
    '%s re-throws the refusal out of its catch',
    file => {
      const src = read(file)
      const guard = matchCode(
        src,
        /if \(error instanceof BalanceRefusedError\) throw error/g
      )
      expect(
        guard.length,
        `${file}: the outer catch would log the refusal as a service error -- ` +
          `one Telegram page per broke customer -- and, where a refund ` +
          `follows, credit stars that were never taken`
      ).toBeGreaterThan(0)
    }
  )

  it('the three that flatten but do not re-throw are named, not forgotten', () => {
    // generateFluxKontext, generateTextToImageDirect and imageUpscaler now
    // carry the real reason, but their catch blocks are still what writes the
    // customer's message, so the refusal is deliberately NOT re-thrown past
    // them here. Rewiring those three is the "one refusal, six messages"
    // change -- a different repair, listed so this omission is a decision on
    // the record rather than an oversight discovered later.
    for (const file of [
      'src/services/generateFluxKontext.ts',
      'src/services/generateTextToImageDirect.ts',
      'src/services/imageUpscaler.ts',
    ]) {
      const src = read(file)
      expect(
        matchCode(src, /refuseUnpaidGeneration\(/g).length,
        `${file}: the reason must still survive the charge`
      ).toBeGreaterThan(0)
    }
  })
})

describe('the refund cannot fire on a charge that never happened', () => {
  // QwenImageEdit refunded on `totalCost > 0` alone. Its siblings had a
  // `charged` gate; it had none. refundUser is ledger-guarded, but that guard
  // matches ANY charge of sufficient size in the last 24 hours rather than
  // this one -- so an uncharged failure could credit against an unrelated
  // purchase the customer made that morning.
  it.each([
    'src/services/generateQwenImageEdit.ts',
    'src/services/generateFluxKontextPro.ts',
    'src/services/generateSeedEdit3.ts',
  ])('%s gates its refund on a charge', file => {
    const src = read(file)
    const refunds = matchCode(src, /await refundUser\(/g)
    expect(refunds.length, `${file}: no refund found`).toBeGreaterThan(0)
    expect(
      matchCode(src, /charged\s*=\s*true/g).length,
      `${file}: nothing records that a charge happened`
    ).toBeGreaterThan(0)
    expect(
      matchCode(src, /if \(charged/g).length,
      `${file}: the refund is not gated on it`
    ).toBeGreaterThan(0)
  })
})

describe('the sentinel is no longer thrown for reasons that are not money', () => {
  it('generateFluxKontextMax does not flatten four causes into one', () => {
    const src = read('src/services/generateFluxKontextMax.ts')
    // The old line: `throw new Error('Not enough stars')` for ANY failed
    // balance operation -- including a failed WRITE by a customer who had the
    // stars. Five downstream catchers turn that string into a top-up prompt.
    expect(
      matchCode(src, /throw new Error\(\s*['"]Not enough stars['"]\s*\)/g)
        .length,
      'the flattening throw is back'
    ).toBe(0)
  })

  it('nobody invents the sentinel by hand any more, anywhere in src', () => {
    // POPULATION, not a remembered list -- and this is the assertion that
    // taught me the report was short. Told about one flattening throw, I fixed
    // one; this census found five sites across four files. The original count
    // was not wrong so much as unmeasured.
    //
    // The one legitimate home for this string is refuseUnpaidGeneration, which
    // throws it only for insufficientFunds. A bare `new Error('Not enough
    // stars')` anywhere else is someone guessing why a charge failed -- and
    // five catch sites downstream will render that guess as a top-up prompt.
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) {
          if (!['node_modules', '__tests__', 'test'].includes(e.name)) walk(rel)
        } else if (e.name.endsWith('.ts')) files.push(rel)
      }
    }
    walk('src')

    // FLOOR: this census is an absence check. Without a floor it passes just as
    // happily on an empty directory listing as on a clean repository, and a
    // silent zero reads exactly like success.
    expect(files.length, 'the census measured nothing').toBeGreaterThan(400)

    const offenders = files.filter(
      f =>
        matchCode(read(f), /throw new Error\(\s*['"]Not enough stars['"]\s*\)/g)
          .length > 0
    )
    expect(offenders).toEqual([])
  })

  it('the matcher still recognises the throw it is looking for', () => {
    // Control. Every assertion above this line is an absence, and an absence
    // proves nothing if the pattern can no longer find a present instance.
    expect(
      matchCode(
        `throw new Error('Not enough stars')`,
        /throw new Error\(\s*['"]Not enough stars['"]\s*\)/g
      ).length
    ).toBe(1)
    expect(
      matchCode(
        `// throw new Error('Not enough stars')`,
        /throw new Error\(\s*['"]Not enough stars['"]\s*\)/g
      ).length,
      'a comment must not count as code'
    ).toBe(0)
  })
})
