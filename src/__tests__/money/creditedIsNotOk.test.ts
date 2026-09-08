import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { starsCreditVerdict } from '@/handlers/paymentHandlers'

/**
 * A CREDIT IS ANNOUNCED ONLY WHEN IT HAPPENED.
 *
 * The ledger answers three separate facts -- `{ ok, credited, reason }` --
 * and both places that ask it read only the first. The render's own log has
 * a line for the case they ignored: `[STARS] not credited for <id>: <reason>`.
 * So a person could pay with Stars, receive nothing, and be told
 * "Зачислено N токенов. Спасибо!" -- while the owner was told nothing at all,
 * because no exception was thrown and no alert path ran.
 *
 * The mini-app had the same defect one layer over: /api/tokens/verify threw
 * away creditStarsPayment's verdict and answered `зачислено_токенов` with the
 * balance read straight after -- a payload that contradicted itself, since
 * the balance shown was the un-incremented one.
 *
 * Measured in production 2026-09-09 while this was written: five invoices
 * minted, none redeemed, and no Stars income at all since the first one. So
 * this path had never once run end to end -- which is exactly why a defect
 * on it could sit unnoticed. It was going to greet the first real buyer.
 */

describe('ok is not credited', () => {
  it('a real credit is announced', () => {
    expect(starsCreditVerdict({ ok: true, credited: true })).toBe('credited')
  })

  /**
   * The exemption that keeps this fix from becoming its own bug. Telegram
   * redelivers successful payments; the ledger's primary-key lock answers
   * `credited: false` for the second delivery and the tokens ARE there.
   * Without this branch every redelivery would fire a support message and an
   * owner alert on a healthy payment.
   */
  it('a redelivery is not a failure', () => {
    expect(
      starsCreditVerdict({
        ok: true,
        credited: false,
        reason: 'redelivery of a payment already credited',
      })
    ).toBe('already')
  })

  it('paid and not credited is a failure, not a thank-you', () => {
    expect(
      starsCreditVerdict({
        ok: true,
        credited: false,
        reason: 'no amount or recipient',
      })
    ).toBe('failed')
  })

  /**
   * Fail closed. A render that stops sending the field must not be read as
   * agreement -- the repository has already been bitten by a missing field
   * defaulting to the permissive answer.
   */
  it('a missing credited field is a failure, not a yes', () => {
    expect(starsCreditVerdict({ ok: true })).toBe('failed')
    expect(starsCreditVerdict({ ok: true, reason: 'что-то' })).toBe('failed')
  })

  it('a refused request is a failure whatever credited says', () => {
    expect(starsCreditVerdict({ ok: false, credited: true })).toBe('failed')
  })
})

/**
 * The render half is wiring, not a function, so it is read from the source --
 * the same reason cashier-one-intake.test.ts reads files: the defect was in
 * what the handler did with a value, and no unit test of either side could
 * see it.
 */
describe('the mini-app verify path reads the verdict', () => {
  const server = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      'apps',
      'vibee-editor',
      'render',
      'render-server.ts'
    ),
    'utf8'
  )

  it('the file under test is the one that serves /api/tokens/verify', () => {
    // Positive control: without this, a wrong path would read as "clean".
    expect(server).toContain("'/api/tokens/verify'")
    expect(server).toContain('creditStarsPayment')
  })

  it('the credit verdict is captured, not discarded', () => {
    expect(server).toContain('const credit = await creditStarsPayment(pool, {')
  })

  it('a failed credit is not announced as a credit', () => {
    expect(server).toContain('зачисление_провалено: true')
    expect(server).toContain('if (!credit.credited && !redelivered)')
    // The announcement must be conditional on the verdict, never a bare count.
    expect(server).toContain(
      'зачислено_токенов: credit.credited ? row.tokens : 0'
    )
    expect(server).not.toContain('зачислено_токенов: row.tokens')
  })

  it('a redelivery still answers ok, so a healthy payment is not alarmed', () => {
    expect(server).toContain(
      "const redelivered = /redeliver/i.test(credit.reason || '')"
    )
  })
})

/**
 * The browser's own branch: `ok:false` used to mean only "not visible yet",
 * and the client promised the credit would catch up on the next visit. After
 * a genuine failure the invoice is already marked redeemed, so no later
 * verify finds it -- the promise could never come true.
 */
describe('the browser tells the two apart', () => {
  const chat = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      'apps',
      'vibee-editor',
      'player',
      'src',
      'pages',
      'Chat.tsx'
    ),
    'utf8'
  )

  it('the file under test is the one that calls verify', () => {
    expect(chat).toContain('/api/tokens/verify')
  })

  it('a failed credit stops the retries and says so', () => {
    expect(chat).toContain("vd['зачисление_провалено']")
    expect(chat).toContain('токены не зачислены')
    // The retry promise must not be what a failed credit reaches.
    const failedBranch = chat.indexOf("vd['зачисление_провалено']")
    const retryPromise = chat.indexOf('проверяю зачисление ещё пару раз')
    expect(failedBranch).toBeGreaterThan(-1)
    expect(retryPromise).toBeGreaterThan(failedBranch)
  })
})
