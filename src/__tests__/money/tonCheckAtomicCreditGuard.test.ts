/**
 * Ratchet: the TON top-up check credits MONEY_INCOME only AFTER an atomic
 * status compare-and-swap, so two concurrent taps cannot double-credit (mint).
 *
 * ton_check_/tonn_check_ fetch a PENDING payment and credit the user. Two
 * concurrent taps of the same public on-chain invId would both read PENDING and
 * both credit -- a double top-up for one real payment (a mint). The guard is an
 * atomic Postgres UPDATE `.update({status: COMPLETED}).eq('status', PENDING)
 * .select()`: only the tap that flips PENDING->COMPLETED gets a non-empty select
 * and proceeds to credit; the loser skips. This pins that the atomic CAS
 * precedes the MONEY_INCOME credit in both TON scenes -- today it is protected
 * only by a code comment, so a refactor that drops the `.eq('status', PENDING)`
 * precondition or reorders the credit before the CAS would silently reopen the
 * mint.
 *
 * Found via `tri inflight` (which flags these handlers because the guard is a
 * DB CAS, not a session *InProgress flag). loop-fable iter214. Structural
 * (source scan) -> self-check + floor + mutation-verified. Behaviour-neutral.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const CASES = [
  {
    file: path.resolve(__dirname, '../../scenes/tonPaymentScene/index.ts'),
    action: 'ton_check_',
  },
  {
    file: path.resolve(
      __dirname,
      '../../scenes/tonNativePaymentScene/index.ts'
    ),
    action: 'tonn_check_',
  },
]

/** Extract the check-action handler body by brace-matching from its `.action(`. */
function checkHandlerBody(code: string, actionPrefix: string): string | null {
  // ...action(/^ton_check_(.+)$/,  or  /^tonn_check_(.+)$/
  const re = new RegExp(`\\.action\\(\\s*/\\^${actionPrefix}`)
  const m = re.exec(code)
  if (!m) return null
  const open = code.indexOf('{', m.index)
  if (open === -1) return null
  let depth = 0
  let i = open
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) break
  }
  return code.slice(open, i + 1)
}

function analyze(
  code: string,
  actionPrefix: string
): { handlerFound: boolean; credits: boolean; casBeforeCredit: boolean } {
  const body = checkHandlerBody(code, actionPrefix)
  if (body === null)
    return { handlerFound: false, credits: false, casBeforeCredit: false }

  // The credit: updateUserBalance(...) with a MONEY_INCOME argument.
  const creditRe = /updateUserBalance\([\s\S]*?MONEY_INCOME/
  const creditPos = body.search(creditRe)

  // The atomic CAS: an UPDATE that sets status COMPLETED, gated on the row still
  // being PENDING (the compare-and-swap precondition), then reads the result.
  const casRe =
    /\.update\(\s*\{[\s\S]*?status[\s\S]*?COMPLETED[\s\S]*?\.eq\(\s*['"]status['"]\s*,\s*[^)]*PENDING[\s\S]*?\.select\(/
  const casPos = body.search(casRe)

  return {
    handlerFound: true,
    credits: creditPos !== -1,
    casBeforeCredit: casPos !== -1 && creditPos !== -1 && casPos < creditPos,
  }
}

describe('TON check credits only after an atomic status CAS (no double-credit mint)', () => {
  for (const c of CASES) {
    const code = fs.readFileSync(c.file, 'utf8')
    const a = analyze(code, c.action)
    const name = path.basename(path.dirname(c.file))

    it(`floor: ${name} ${c.action} handler still credits MONEY_INCOME`, () => {
      expect(a.handlerFound).toBe(true)
      expect(a.credits).toBe(true)
    })

    it(`${name}: the atomic status CAS precedes the credit`, () => {
      expect(a.casBeforeCredit).toBe(true)
    })
  }

  it('self-check: a handler that credits without the atomic CAS is detected', () => {
    const bad = `scene.action(/^ton_check_(.+)$/, async ctx => {
      const { data: payment } = await supabase.from('payments_v2').select('*').eq('inv_id', invId).single()
      await updateUserBalance(id, payment.amount, PaymentType.MONEY_INCOME, 'ton')
    })`
    const rb = analyze(bad, 'ton_check_')
    expect(rb.handlerFound).toBe(true)
    expect(rb.credits).toBe(true)
    expect(rb.casBeforeCredit).toBe(false)

    const good = `scene.action(/^ton_check_(.+)$/, async ctx => {
      const { data: won } = await supabase.from('payments_v2')
        .update({ status: PaymentStatus.COMPLETED }).eq('inv_id', invId).eq('status', PaymentStatus.PENDING).select('inv_id')
      if (!won || won.length === 0) return
      await updateUserBalance(id, amount, PaymentType.MONEY_INCOME, 'ton')
    })`
    const rg = analyze(good, 'ton_check_')
    expect(rg.casBeforeCredit).toBe(true)
  })
})
