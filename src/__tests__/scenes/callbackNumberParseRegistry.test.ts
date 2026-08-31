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
  'instagramParserScene/index.ts':
    'count_(d+) via action.match; validated `typeof cost !== number` reject (#1425)',
  'videoDurationScene.ts':
    'duration_(d+) via .action; validated by isDurationSupported(modelId, duration)',
  'musicGenerationWizard/index.ts':
    'duration_(d+) via .action; validated against SUNO_DURATION_OPTIONS allowlist',
  'lipSyncWizard/ai-reels-inngest-wizard.ts':
    'voice_message_(d+) placeholder built from voice.duration (<=30 rejected) + fixed WAN base cost floor (never 0)',
  'lipSyncWizard/veed-fabric-wizard.ts':
    'voice_message_(d+) placeholder from voice.duration (<=30 rejected) + explicit duration===0 zero-cost reject',
  'cryptoPaymentScene.ts':
    'crypto_topup_(d+); validated via getUsdcTopUpOption(amount) find/reject',
  'tonPaymentScene/index.ts':
    'ton_select_(d+); validated via tonUsdtTopUpOptions.find(opt.usdt===n)/reject',
  'tonNativePaymentScene/index.ts':
    'tonn_select_(d+); validated via tonNativeTopUpOptions.find(opt.ton===n)/reject',
  'rublePaymentScene.ts':
    'top_up_rub_(d+); amount taken from server-side sceneState.paymentInfo, not the parsed number',
  'starPaymentScene.ts':
    'top_up_(d+) -> handleTopUp -> handleBuy; proportional invoice (user pays for what they credit)',
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

describe('callback/text number-parse scenes are all reviewed (zero-cost bypass class)', () => {
  const root = path.join(__dirname, '..', '..', 'scenes')
  const found = walk(root)
    .filter(f => fs.readFileSync(f, 'utf8').includes(SIG))
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
