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
/**
 * The money directions are read from the PaymentType enum, not guessed.
 *
 * The first version of this probe hardcoded MONEY_INCOME as "credit" and
 * missed PaymentType.REFUND entirely -- a third member used in six files. It
 * therefore reported files as never crediting when they refund on every
 * failure. Deriving the vocabulary from the enum makes that impossible to
 * repeat silently: an unclassified member stops the run instead of being
 * counted as nothing.
 */
const PAYMENT_TYPES_FILE = 'src/interfaces/payments.interface.ts'
const CREDIT_MEMBERS = ['MONEY_INCOME', 'REFUND']
const DEBIT_MEMBERS = ['MONEY_OUTCOME']

function enumMembers() {
  const src = fs.readFileSync(path.join(ROOT, PAYMENT_TYPES_FILE), 'utf8')
  const block = src.match(/enum PaymentType\s*\{([\s\S]*?)\}/)
  if (!block) return null
  return [...block[1].matchAll(/^\s*([A-Z_]+)\s*=/gm)].map(m => m[1])
}

// Qualified by the enum on purpose. The bare word appears as a string literal
// in the zot classifier's case labels, which classify payments rather than
// making them; matching it there accused two files of moving money they only
// describe.
const CREDIT = new RegExp(
  `(?<![A-Za-z0-9_])PaymentType\\.(?:${CREDIT_MEMBERS.join('|')})\\b`,
  'g'
)
const DEBIT = new RegExp(
  `(?<![A-Za-z0-9_])PaymentType\\.(?:${DEBIT_MEMBERS.join('|')})\\b`,
  'g'
)
/** The shared helpers whose whole job is to give money back. */
const REFUND_HELPER = /\b(refundUser|refundAndTell|refundAndDescribe)\s*\(/g

function selfCheck() {
  blankSelfCheck()
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }

  const hit = (src, re) => matchCode(src, re).length

  // Every member of the enum must be classified. A new direction added to
  // PaymentType and not to this probe would otherwise be silently ignored,
  // which is exactly how REFUND was missed the first time.
  const members = enumMembers()
  if (!members || members.length < 2)
    fail('перечисление PaymentType не разобрано')
  const known = new Set([...CREDIT_MEMBERS, ...DEBIT_MEMBERS])
  const unclassified = members.filter(m => !known.has(m))
  if (unclassified.length)
    fail(
      `в PaymentType есть неразнесённые значения: ${unclassified.join(', ')}`
    )

  if (!hit('await updateUserBalance(id, 1, PaymentType.MONEY_INCOME)', CREDIT))
    fail('начисление MONEY_INCOME не распознано')
  if (!hit('await updateUserBalance(id, 1, PaymentType.REFUND)', CREDIT))
    fail('возврат PaymentType.REFUND не распознан')
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
  if (hit("case 'MONEY_INCOME':", CREDIT))
    fail('строковый литерал в classifier принят за начисление')
  if (hit("appliedRules.push('MONEY_INCOME_BONUS')", CREDIT))
    fail('имя правила принято за начисление')
  // ZOTPaymentType ENDS WITH PaymentType, so an unanchored pattern matched
  // inside another enum's name and accused the zot classifier of moving money
  // it only labels.
  if (hit('type = ZOTPaymentType.REFUND', CREDIT))
    fail('другое перечисление с тем же окончанием принято за наше')
  if (hit('ZOTPaymentType.MONEY_OUTCOME', DEBIT))
    fail('другое перечисление принято за наше (списание)')

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
