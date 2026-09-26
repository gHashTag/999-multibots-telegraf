/**
 * BUTTONS ON THE SUBSTANCE OF A MODEL ANSWER.
 *
 * The owner asked first for buttons under every answer, and on 24.09.2026
 * for the opposite: "on the substance, not in every message -- look at how
 * our browser does it". The browser asks permission BY PLACE, not because an
 * action happened; buttons now appear because the answer gives a reason, not
 * because an answer happened.
 *
 * What did not change, because both were already by substance: a pay row
 * when the answer holds an invoice link, the buttons the agent proposed
 * itself, every id having a live handler, and nothing a group chat would
 * reject.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  ACTIONS,
  ACTION_PREFIX,
  standardButtons,
  buttonsForAnswer,
  payRow,
  stripAgentMarkers,
} from '@/navigation/helpers/actionButtons'
import { fallbackSystemPrompt } from '@/navigation/helpers/agentFallback'
import {
  CLUB_STARS,
  clubOfferLine,
  spacedNumber,
} from '../../../apps/vibee-editor/render/src/agent/club-membership'
import {
  ПАКЕТЫ as PACKS, // cyrillic-ok: the render's own export name
  ценаТокенов, // cyrillic-ok: the render's own export name
} from '../../../apps/vibee-editor/render/src/agent/token-packs'

/** The price list's answer for n tokens, under an English name. */
const tokenPrice = (n: number) => ({ stars: ценаТокенов(n).звёзд }) // cyrillic-ok: the render's own API

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8')
const callbacks = (kb: any): string[] =>
  kb.reply_markup.inline_keyboard
    .flat()
    .map(
      (b: any) =>
        b.callback_data ??
        (b.url ? `url:${b.url}` : b.web_app ? 'web_app' : '?')
    )

describe('the standard set', () => {
  it('has a person to call, in this order: pay, balance + can, human, app', () => {
    // pay_rub / pay_crypto are registered for the agent and the /start
    // greeting; the standard set keeps one payment door (the chooser).
    expect(ACTIONS.map(a => a.id)).toEqual([
      'topup',
      'pay_rub',
      'pay_crypto',
      'balance',
      'can',
      'human',
    ])
    expect(callbacks(standardButtons(true))).toEqual([
      'act:topup',
      'act:balance',
      'act:can',
      'act:human',
      'web_app',
    ])
    expect(callbacks(standardButtons(true, { app: false }))).toEqual([
      'act:topup',
      'act:balance',
      'act:can',
      'act:human',
    ])
  })

  it('every action id has a literal handler registration', () => {
    const src = read('navigation/registerCommands.ts')
    for (const a of ACTIONS)
      expect(src, a.id).toContain('`' + '${ACTION_PREFIX}' + a.id + '`')
    expect(ACTION_PREFIX).toBe('act:')
  })
})

describe('the pay row and the markers', () => {
  it('an invoice link becomes the first row; no link, no row; stars named when present', () => {
    expect(
      payRow('Счёт на 50 токенов — 65 ⭐: https://t.me/$abc_DEF-1')
    ).toEqual([
      expect.objectContaining({
        text: 'Оплатить 65 ⭐',
        url: 'https://t.me/$abc_DEF-1',
      }),
    ])
    expect(payRow('оплата: https://t.me/$x9')?.[0]).toMatchObject({
      text: 'Оплатить ⭐',
    })
    // The club invoice the agent hands over (club_invoice): a five-digit
    // price written with its thousands apart is one number, not "000".
    expect(
      payRow('Клуб — 10 000 ⭐ за 30 дней.\nhttps://t.me/$club_invoice_1')?.[0]
    ).toMatchObject({
      text: 'Оплатить 10 000 ⭐',
      url: 'https://t.me/$club_invoice_1',
    })
    // The same with the no-break space toLocaleString('ru-RU') puts there.
    expect(
      payRow('Счёт готов: 10\u00a0000 ⭐ https://t.me/$c2')?.[0]
    ).toMatchObject({ text: 'Оплатить 10 000 ⭐' })
    // A number nearby that is not the price is not glued to it.
    expect(
      payRow('За 30 дней 10000 ⭐, вернётся 2 571 токен https://t.me/$c3')?.[0]
    ).toMatchObject({ text: 'Оплатить 10000 ⭐' })
    // A year right before the price is not read as its first group: without
    // the digit lookbehind this read "026 250".
    expect(
      payRow('Счёт за сентябрь 2026 250 ⭐ https://t.me/$c4')?.[0]
    ).toMatchObject({ text: 'Оплатить 250 ⭐' })
    expect(payRow('зайди на https://t.me/neuro_blogger_bot')).toBeNull()
    const kb = buttonsForAnswer(
      'Готово, вот счёт 65 ⭐ https://t.me/$abc [[Пополнить|act:topup]]',
      true,
      { app: false }
    )
    /*
     * The pay link, then the button the agent itself proposed -- and nothing
     * more. Until 24.09.2026 the four standard buttons followed, so this
     * answer carried `topup` twice. The owner that day: buttons "on the
     * substance, not in every message".
     */
    expect(callbacks(kb.markup)).toEqual(['url:https://t.me/$abc', 'act:topup'])
    expect(kb.text).not.toContain('[[')
  })

  /*
   * THE AMOUNT ON THE BUTTON IS THIS INVOICE'S, OR NONE.
   *
   * Asked for the price, the creator prompt tells the model to name both
   * paths: the packs ("10 tokens -> 15 stars, ...") and the club offer, whose
   * price is written in words ("10 000 stars", no star sign). The button used
   * to read the FIRST "N star-sign" in the answer, so the club link sat under
   * "pay 15" -- a 10 000-star monthly subscription understated ~667 times.
   * The strings below are the real ones: the packs from the price list in
   * chat.ts's shape, the offer from clubOfferLine().
   */
  it('the club link under a price answer never wears a pack price', () => {
    const packs = PACKS.map(
      n => `${n} токенов → ${tokenPrice(n).stars}⭐`
    ).join(', ')
    const club = spacedNumber(CLUB_STARS)
    const link = 'https://t.me/$club_invoice_2'

    // The offer alone: the price in words is the price on the button.
    expect(payRow(`${clubOfferLine()}\n${link}`)?.[0]).toMatchObject({
      text: `Оплатить ${club} ⭐`,
      url: link,
    })

    // Packs, then the offer, then the club link: more than one amount, so the
    // button names none -- Telegram's own sheet shows the real one.
    const both = `Токены: ${packs}.\n${clubOfferLine()}\n${link}`
    const b = payRow(both)?.[0] as { text: string; url: string }
    expect(b).toMatchObject({ text: 'Оплатить ⭐', url: link })
    for (const n of PACKS)
      expect(b.text).not.toContain(String(tokenPrice(n).stars))

    // The same amount written twice is still one amount; the spelling is the
    // one nearest before the link.
    expect(
      payRow(`Клуб — 10000 ⭐ в месяц, то есть 10 000 звёзд.\n${link}`)?.[0]
    ).toMatchObject({ text: 'Оплатить 10 000 ⭐' })

    // An English answer: "stars" is the star sign, and a comma between the
    // thousands does not leave "000" on the button.
    expect(
      payRow(`The club is 10,000 Stars for 30 days.\n${link}`)?.[0]
    ).toMatchObject({ text: 'Оплатить 10 000 ⭐' })
  })

  it('stripAgentMarkers removes every marker, known or not, and collapses the gap', () => {
    const out = stripAgentMarkers(
      'Привет [[Пополнить|act:topup]]\n\n\n[[Х|act:nope]] конец'
    )
    expect(out).not.toContain('[[')
    expect(out).toContain('Привет')
    expect(out).toContain('конец')
    expect(out).not.toContain('\n\n\n')
    expect(stripAgentMarkers('без маркеров')).toBe('без маркеров')
  })
})

describe('every answer path is wired', () => {
  it('the agent answer and the fallback gate the app button by chat type and chunk long texts', () => {
    const src = read('navigation/registerCommands.ts')
    const agent = src.slice(
      src.indexOf('const { text: ochishcheno, markup } = buttonsForAnswer('),
      src.indexOf('const chasti =')
    )
    expect(agent).toContain("app: ctx.chat?.type === 'private'")
    // The honest line after an empty answer and the fallback answer share
    // one set of options, gated by chat type.
    const optsAt = src.indexOf('const missButtons = {')
    expect(optsAt).toBeGreaterThan(-1)
    expect(src.slice(optsAt, optsAt + 300)).toContain(
      "app: ctx.chat?.type === 'private'"
    )
    const emptyAt = src.indexOf("if (miss.kind === 'empty') {")
    expect(emptyAt).toBeGreaterThan(-1)
    expect(src.slice(emptyAt, emptyAt + 400)).toMatch(
      /buttonsForAnswer\([\s\S]*missButtons/
    )
    const fb = src.slice(
      src.indexOf(
        'const { text: replyClean, markup: replyMarkup } = buttonsForAnswer('
      ),
      src.indexOf('THE FALLBACK ANSWER GOES INTO THE SHARED CONVERSATION')
    )
    expect(fb).toContain('missButtons')
    expect(fb).toContain('const fbParts = splitLong(replyClean)')
    expect(fb).toMatch(/i === fbParts\.length - 1 \? replyMarkup : undefined/)
    const failAt = src.indexOf('fallbackFailedText(replyRu')
    expect(failAt).toBeGreaterThan(-1)
    expect(src.slice(failAt, failAt + 300)).toContain(
      "app: ctx.chat?.type === 'private'"
    )
    // The marker grammar the fallback model is taught, in both languages.
    for (const isRu of [true, false])
      expect(fallbackSystemPrompt(isRu)).toMatch(
        /act:id\]\][^:]*: topup, balance, can, human\./
      )
  })

  it('the chat scenes answer with the standard set: text, photo caption, document caption', () => {
    const ai = read('scenes/aiChatWizard/index.ts')
    expect(ai).toContain(
      "standardButtons(isRu, { app: ctx.chat?.type === 'private' })"
    )
    expect(ai).toMatch(
      /parse_mode: 'Markdown',\s*reply_markup: kb\.reply_markup/
    )
    const av = read('scenes/chatWithAvatarWizard/index.ts')
    expect(av).toMatch(
      /replyWithPhoto\(response\.imageUrl, \{\s*caption,\s*reply_markup: kb\.reply_markup/
    )
    expect(av).toMatch(
      /replyWithDocument\(response\.imageUrl, \{\s*caption,\s*reply_markup: kb\.reply_markup/
    )
    expect(av).toMatch(
      /ctx\.reply\(\s*textResponse,\s*standardButtons\(isRussian\(ctx\)/
    )
  })

  it("the render's prompt names all six ids and forbids offering payment first", () => {
    const prompt = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        'apps',
        'vibee-editor',
        'render',
        'src',
        'agent',
        'chat.ts'
      ),
      'utf8'
    )
    expect(prompt).toContain('human (позвать человека)')
    expect(prompt).toContain('pay_rub')
    expect(prompt).toContain('pay_crypto')
    expect(prompt).toContain('Кнопки оплаты не предлагай')
  })
})
