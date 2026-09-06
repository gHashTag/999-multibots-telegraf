import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Money-security class (regressed once: instagramParserScene, #1425).
// A scene that captures a number from callback/text data (`_(\d+)`) and feeds it
// into pricing/quantity/generation MUST validate it against a server-side
// allowlist BEFORE use -- callback data is attacker-craftable (Telegram does not
// verify it matches a button the bot sent), and an out-of-range value makes the
// cost NaN/undefined/0 so the `balance < cost` gate degenerates and hands out a
// paid result for nothing. This registry forces every such site through review:
// a NEW one fails here until it is verified + registered with HOW it validates.
const REGISTERED: Record<string, string> = {
  /*
   * tokens:(\d+):(id) из invoice_payload оплаты звёздами.
   *
   * Число НЕ приходит от человека: payload задаём мы сами при создании счёта
   * (render-server.ts, createInvoiceLink), Telegram возвращает его дословно в
   * successful_payment, и подменить его покупатель не может — он не создаёт
   * счёт.
   *
   * ОСТАТОЧНЫЙ РИСК НАЗЫВАЮ ЧЕСТНО: зачисляется количество из payload, а не
   * пересчитанное из фактически уплаченных звёзд. Если счёт когда-нибудь
   * выпишут с расхождением между payload и ценой, зачислится payload. Обе
   * величины считаются одной шкалой (src/agent/token-packs.ts), и её пакеты
   * закреплены тестом — но это соглашение, а не проверка в момент
   * зачисления.
   */
  'handlers/paymentHandlers/index.ts':
    'tokens:(d+):(id) from invoice_payload; the number is OUR OWN value echoed back by Telegram from an invoice we created, not user input; credited amount is the payload, priced by the single scale in agent/token-packs.ts',
  'scenes/instagramParserScene/index.ts':
    'count_(d+) via action.match; validated `typeof cost !== number` reject (#1425)',
  'scenes/videoDurationScene.ts':
    'duration_(d+) via .action; validated by isDurationSupported(modelId, duration)',
  'scenes/musicGenerationWizard/index.ts':
    'duration_(d+) via .action; validated against SUNO_DURATION_OPTIONS allowlist',
  'scenes/lipSyncWizard/ai-reels-inngest-wizard.ts':
    'voice_message_(d+) placeholder built from voice.duration (<=30 rejected) + fixed WAN base cost floor (never 0)',
  'scenes/lipSyncWizard/veed-fabric-wizard.ts':
    'voice_message_(d+) placeholder from voice.duration (<=30 rejected) + explicit duration===0 zero-cost reject',
  'scenes/cryptoPaymentScene.ts':
    'crypto_topup_(d+); validated via getUsdcTopUpOption(amount) find/reject',
  'scenes/tonPaymentScene/index.ts':
    'ton_select_(d+); validated via tonUsdtTopUpOptions.find(opt.usdt===n)/reject',
  'scenes/tonNativePaymentScene/index.ts':
    'tonn_select_(d+); validated via tonNativeTopUpOptions.find(opt.ton===n)/reject',
  'scenes/rublePaymentScene.ts':
    'top_up_rub_(d+); amount taken from server-side sceneState.paymentInfo, not the parsed number',
  'scenes/starPaymentScene.ts':
    'top_up_(d+) -> handleTopUp -> handleBuy; proportional invoice (user pays for what they credit)',
  // Outside src/scenes, invisible until the population was widened. NOT in
  // the money class: the file holds zero money calls, and the parsed number
  // is a log-line count, not a price or a quantity of paid work.
  'commands/autonomousMonitor.ts':
    'logs_(.+) -> parseInt sets how many log lines to fetch; no money in the file',
}

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

// A scene "parses a callback/text number" if its source contains the regex
// digit-capture `_(\d+)`.
const SIG = '_(\\d+)'

// The population is ALL of src, and any digit-capture spelling -- not one
// fragment inside one directory.
//
// It used to be: files under src/scenes whose text contains the literal
// fragment above. The header promises that a NEW site "fails here until it is
// reviewed", which is a claim wider than that coverage. A regex written
// `count_(\d{1,3})`, or `^buy:(\d+)$`, or a parseInt on a split callback
// string, all pass a literal-fragment search untouched -- and handlers,
// commands and routes were outside the walk entirely.
//
// Measured when this was widened: 9 files in all of src capture digits near
// callback handling. 8 were already registered; the one newly visible is
// commands/autonomousMonitor.ts, which carries NO money -- its number sets how
// many log lines to fetch. The money-class gap was empty. The point of widening
// is that the promise now matches what is checked.
//
// The old fragment stays as one alternative, so no registered entry can drop
// out of the population and read as "removed".
const DIGIT_CAPTURE = /\/[^/\n]*\(\\d[+*{][^/\n]*\//
const HANDLES_CALLBACK = /callbackQuery|\.action\(|callback_data/

describe('callback/text number-parse scenes are all reviewed (zero-cost bypass class)', () => {
  const root = path.join(__dirname, '..', '..')
  const found = walk(root)
    .filter(f => !f.includes('__tests__'))
    .filter(f => {
      const src = fs.readFileSync(f, 'utf8')
      return (
        src.includes(SIG) ||
        (DIGIT_CAPTURE.test(src) && HANDLES_CALLBACK.test(src))
      )
    })
    .map(f =>
      f
        .slice(root.length + 1)
        .split(path.sep)
        .join('/')
    )

  it('finds the parse sites (a broken matcher fails, not passes)', () => {
    expect(found.length).toBeGreaterThan(5)
  })

  it('every callback-number-parse scene is registered (a NEW one must be reviewed)', () => {
    const unregistered = found.filter(f => !(f in REGISTERED))
    expect(
      unregistered,
      'these scenes parse a number from callback/text data -- verify the value is ' +
        'validated against a server-side allowlist BEFORE pricing/generation, then ' +
        'register it in REGISTERED with how it validates'
    ).toEqual([])
  })

  it('has no stale registry entries (a removed/renamed scene must be dropped)', () => {
    const stale = Object.keys(REGISTERED).filter(k => !found.includes(k))
    expect(stale).toEqual([])
  })
})
