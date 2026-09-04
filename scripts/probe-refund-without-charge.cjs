#!/usr/bin/env node
/**
 * WHO GIVES MONEY BACK WITHOUT EVER HAVING TAKEN IT.
 *
 * A refund is only a refund if something was charged. Otherwise it is a mint,
 * and this repository has produced that shape more than once: a video
 * generator crediting on every failure with no debit anywhere on its path, and
 * a session field that meant "intended price" being refunded as though it
 * meant "amount charged".
 *
 * Crediting without charging is NOT automatically wrong -- a top-up, a
 * referral bonus and a promo all legitimately create stars. What must be
 * paired is a REFUND. So the census reports two populations separately:
 *
 *   1. files that credit and never debit  -- a reading list, mostly innocent
 *   2. callers of the shared refund helpers with no charge primitive in sight
 *      -- the sharp one
 *
 * Neither is a verdict. A cancel flow legitimately refunds a charge made in
 * another file, so (2) still has to be read; what it buys is a list of a few
 * files instead of a repository.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { selfCheck: blankSelfCheck, matchCode } = require('./lib/blank-code.cjs')

const ROOT = path.resolve(__dirname, '..')

/** Every way this repository moves a balance. */
const CHARGE_PRIMITIVE =
  /\b(updateUserBalance|directPaymentProcessor|setPayments|processBalanceOperation)\s*\(/g
const CREDIT = /\bMONEY_INCOME\b/g
const DEBIT = /\bMONEY_OUTCOME\b/g
/** The shared helpers whose whole job is to give money back. */
const REFUND_HELPER = /\b(refundUser|refundAndTell|refundAndDescribe)\s*\(/g

function selfCheck() {
  blankSelfCheck()
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }

  const hit = (src, re) => matchCode(src, re).length

  if (!hit('await updateUserBalance(id, 1, PaymentType.MONEY_INCOME)', CREDIT))
    fail('начисление не распознано')
  if (!hit('PaymentType.MONEY_OUTCOME', DEBIT)) fail('списание не распознано')
  if (!hit('await processBalanceOperation({ ... })', CHARGE_PRIMITIVE))
    fail('денежный примитив не распознан')
  if (!hit('await refundUser(ctx, amount)', REFUND_HELPER))
    fail('возвратный помощник не распознан')

  // A matcher that fires on the mere WORD would count comments and prose as
  // money movements, and the report would accuse whoever documents the class.
  if (hit('// this function never calls updateUserBalance', CHARGE_PRIMITIVE))
    fail('упоминание в комментарии принято за вызов')
  if (hit('const refundUserName = x', REFUND_HELPER))
    fail('другое имя с той же приставкой принято за помощника')

  console.log('самопроверка: денежные формы распознаны, упоминания отвергнуты')
}

selfCheck()

const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(f => f.endsWith('.ts') && f.startsWith('src/'))
  .filter(f => !f.includes('__tests__') && !f.includes('/test/'))

const src = new Map(
  files.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')])
)

const credits = []
const refundCallers = []
for (const [f, s] of src) {
  const credit = matchCode(s, CREDIT).length
  const charge = matchCode(s, CHARGE_PRIMITIVE).length
  const debit = matchCode(s, DEBIT).length
  if (credit && !debit && !charge) credits.push(f)
  // The helpers themselves are supposed to credit; their callers are the ones
  // that must have charged.
  if (/price\/helpers\/(refundUser|refundAndTell)\.ts$/.test(f)) continue
  if (matchCode(s, REFUND_HELPER).length && !charge && !debit)
    refundCallers.push(f)
}

console.log(`файлов просмотрено: ${files.length}`)

console.log(`\n=== НАЧИСЛЯЮТ, НО НЕ СПИСЫВАЮТ: ${credits.length} ===`)
console.log(
  '   (пополнения, рефералы и промо здесь законны -- это список на чтение)'
)
for (const f of credits) console.log(`  ${f}`)

console.log(
  `\n=== ЗОВУТ ВОЗВРАТ, НО НИГДЕ НЕ СПИСЫВАЮТ: ${refundCallers.length} ===`
)
console.log(
  '   (отмена законно возвращает списание из ДРУГОГО файла -- читать каждый)'
)
for (const f of refundCallers) console.log(`  ${f}`)

// A run where nothing credits at all means the matcher stopped matching, not
// that the product stopped taking money.
if (credits.length === 0) {
  console.error(
    '\nсамопроверка не прошла: НИ ОДНОГО начисления во всём репозитории --' +
      ' сломан матчер, а не деньги.'
  )
  process.exit(2)
}
