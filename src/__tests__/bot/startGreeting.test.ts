import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  startGreetingText,
  startGreetingPrompt,
  startGreetingKeyboard,
} from '@/navigation/helpers/startGreeting'
import {
  ACTION_PREFIX,
  isKnownAction,
} from '@/navigation/helpers/actionButtons'
import { SUPPORT_HANDLE, supportMention } from '@/config/support'

/**
 * THE /start GREETING AND THE PAYMENT DOORS.
 *
 * Owner, 2026-09-09: "improve the greeting on /start and more buttons about
 * the project, so a person picks WHAT and WHOM right away"; "add payment in
 * rubles, by choice, or in crypto -- find every payment type and wire it";
 * "talk to a person -- fix the name to t27_dev, that is me".
 *
 * Three things can go quietly wrong here: a button whose press lands nowhere,
 * a web_app link whose start_param the mini app does not map, and a greeting
 * that promises in words what the rules forbid.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const read = (...p: string[]) => fs.readFileSync(path.join(REPO, ...p), 'utf8')

type Btn = {
  text: string
  callback_data?: string
  web_app?: { url: string }
}
const flat = (kb: ReturnType<typeof startGreetingKeyboard>): Btn[] =>
  kb.reply_markup.inline_keyboard.flat() as Btn[]

describe('the greeting text', () => {
  it('is bilingual, names the project and every door, and greets by name', () => {
    const ru = startGreetingText(true, 'Дмитрий')
    const en = startGreetingText(false, 'Dmitrii')
    expect(ru).toContain('Дмитрий')
    expect(en).toContain('Dmitrii')
    for (const t of [ru, en]) {
      expect(t).toContain('t27')
      expect(t).toContain('Trinity')
    }
    for (const w of [
      'Улей',
      'Агент',
      'Клуб',
      'Профиль',
      'рублями',
      'криптой',
    ]) {
      expect(ru).toContain(w)
    }
    for (const w of ['Hive', 'Agent', 'Club', 'Profile', 'rubles', 'crypto']) {
      expect(en).toContain(w)
    }
    // No name, no dangling comma.
    expect(startGreetingText(true).startsWith('👋 Привет!')).toBe(true)
    expect(startGreetingText(false).startsWith('👋 Hi!')).toBe(true)
  })

  it('escapes a hostile first name, because the text is HTML', () => {
    expect(startGreetingText(true, '<b>x</b>')).not.toContain('<b>x</b>')
    expect(startGreetingText(true, '<b>x</b>')).toContain(
      '&lt;b&gt;x&lt;/b&gt;'
    )
  })

  it('keeps the honesty rules and never hard-codes a price', () => {
    const both = startGreetingText(true) + startGreetingText(false)
    expect(both).not.toMatch(
      new RegExp(
        'первый в|первая|единственн|лучший|the first|the only|the best',
        'i'
      )
    )
    // The club price lives on the server (club-membership.ts); a number here
    // would drift the day it changes there.
    expect(both).not.toMatch(/\d\s?\d{3}\s?⭐|10\s?000|30%/)
    expect(both).not.toMatch(new RegExp('\\$\\d|/month|/месяц|в месяц'))
    expect(startGreetingPrompt(true)).toContain('кого')
    expect(startGreetingPrompt(false)).toContain('whom')
  })
})

describe('the greeting keyboard', () => {
  it('offers what, whom, and how to pay -- and every callback is a known action', () => {
    const kb = startGreetingKeyboard(true, { app: true, rubles: true })
    const buttons = flat(kb)
    const callbacks = buttons
      .map(b => b.callback_data)
      .filter((c): c is string => !!c)
    // Every press lands: the id after the prefix is a registered action.
    for (const c of callbacks) {
      expect(c.startsWith(ACTION_PREFIX), c).toBe(true)
      expect(isKnownAction(c.slice(ACTION_PREFIX.length)), c).toBe(true)
    }
    expect(callbacks).toEqual([
      `${ACTION_PREFIX}human`,
      `${ACTION_PREFIX}topup`,
      `${ACTION_PREFIX}pay_rub`,
      `${ACTION_PREFIX}pay_crypto`,
      `${ACTION_PREFIX}balance`,
      `${ACTION_PREFIX}can`,
    ])
    // WHAT and WHOM through the signed launch: hive, agent, club, profile.
    const params = buttons
      .map(b => b.web_app?.url)
      .filter((u): u is string => !!u)
      .map(u => new URL(u).searchParams.get('tgWebAppStartParam'))
    expect(params).toEqual(['hive', 'chat', 'club', 'profile'])
  })

  it('drops rubles where the bot hides them, and web_app buttons outside a private chat', () => {
    const noRub = flat(
      startGreetingKeyboard(true, { app: true, rubles: false })
    )
    expect(noRub.map(b => b.callback_data)).not.toContain(
      `${ACTION_PREFIX}pay_rub`
    )
    expect(noRub.map(b => b.callback_data)).toContain(
      `${ACTION_PREFIX}pay_crypto`
    )
    const group = flat(
      startGreetingKeyboard(false, { app: false, rubles: true })
    )
    expect(group.some(b => b.web_app)).toBe(false)
    expect(group.map(b => b.callback_data)).toContain(`${ACTION_PREFIX}human`)
  })

  it('every start_param it sends is a route the mini app knows', () => {
    const provider = read(
      'apps/vibee-editor/player/src/components/Telegram/TelegramProvider.tsx'
    )
    const routes = [
      ...provider.matchAll(/^\s{2}([a-z_]+):\s*'\/[^']*',?\s*$/gm),
    ].map(m => m[1])
    for (const p of ['hive', 'chat', 'club', 'profile']) {
      expect(
        routes,
        `start_param "${p}" is not mapped by the mini app`
      ).toContain(p)
    }
  })

  it('has a label on every button, short enough for a phone', () => {
    for (const isRu of [true, false]) {
      for (const b of flat(
        startGreetingKeyboard(isRu, { app: true, rubles: true })
      )) {
        expect(b.text.length, b.text).toBeGreaterThan(2)
        expect(b.text.length, b.text).toBeLessThanOrEqual(30)
      }
    }
  })
})

describe('the payment doors behind the buttons', () => {
  const commands = read('src/navigation/registerCommands.ts')

  it('top-up opens the chooser with every method, not Stars alone', () => {
    const topup = commands.slice(
      commands.indexOf('bot.action(`${ACTION_PREFIX}topup`'),
      commands.indexOf('bot.action(`${ACTION_PREFIX}pay_rub`')
    )
    expect(topup).toContain('ModeEnum.PaymentScene')
    expect(topup).not.toContain('ModeEnum.StarPaymentScene')
  })

  it('rubles go to the ruble scene where allowed, and to the chooser where not', () => {
    const rub = commands.slice(
      commands.indexOf('bot.action(`${ACTION_PREFIX}pay_rub`'),
      commands.indexOf('bot.action(`${ACTION_PREFIX}pay_crypto`')
    )
    expect(rub).toContain('shouldShowRubles(ctx)')
    expect(rub).toContain('ModeEnum.RublePaymentScene')
    expect(rub).toContain('ModeEnum.PaymentScene')
  })

  it('crypto enters the payment scene on its crypto menu, and Back does not loop', () => {
    const crypto = commands.slice(
      commands.indexOf('bot.action(`${ACTION_PREFIX}pay_crypto`'),
      commands.indexOf('bot.action(`${ACTION_PREFIX}balance`')
    )
    expect(crypto).toContain('ModeEnum.PaymentScene, { crypto: true }')
    const scene = read('src/scenes/paymentScene/index.ts')
    expect(scene).toContain('export async function showCryptoMenu')
    expect(scene).toMatch(
      /state as \{ crypto\?: boolean \}[^\n]*\)\?\.crypto\)/
    )
    // crypto_back must enter with an empty state; reenter() would keep
    // { crypto: true } and show the same menu again.
    const back = scene.slice(scene.indexOf("paymentScene.action('crypto_back'"))
    expect(back).toContain('ctx.scene.enter(ModeEnum.PaymentScene, {})')
    expect(back.slice(0, back.indexOf('})\n'))).not.toContain(
      'ctx.scene.reenter()'
    )
  })

  it('/start for an existing person shows the greeting', () => {
    expect(commands).toContain('await showStartGreeting(ctx)')
  })
})

describe('the person behind the "talk to a person" button', () => {
  it('is t27_dev by default, everywhere the bot names a person', () => {
    expect(SUPPORT_HANDLE).toBe('t27_dev')
    expect(supportMention()).toBe('@t27_dev')
    expect(supportMention('@x')).toBe('@x')
    const files = [
      'src/navigation/registerCommands.ts',
      'src/commands/handleTechSupport/index.ts',
      'src/scenes/techSupportScene/index.ts',
      'src/scenes/getRuBillWizard/index.ts',
      'src/scenes/emailWizard/index.ts',
      'src/api_server/index.ts',
    ]
    for (const f of files) {
      const src = read(f)
      expect(src, f).not.toMatch(/['"@]neuro_sage\b/)
      expect(src, f).toMatch(/SUPPORT_HANDLE|supportMention/)
    }
  })
})
