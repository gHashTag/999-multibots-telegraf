/**
 * BUTTONS UNDER EVERY MODEL ANSWER TO A USER.
 *
 * Owner: "юзеру в каждом ответе модели отправлять телеграм кнопки". Every
 * path that carries a model answer to a person ends with something to tap:
 * the standard set (pay, balance, what you can, a person), a pay row when
 * the answer already holds an invoice link, and nothing a group chat would
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
    expect(ACTIONS.map(a => a.id)).toEqual(['topup', 'balance', 'can', 'human'])
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
    expect(payRow('зайди на https://t.me/neuro_blogger_bot')).toBeNull()
  })

  /**
   * THE NUMBER ON A PAY BUTTON IS A PROMISE ABOUT MONEY.
   *
   * It used to be the FIRST star number in the answer, and an answer often
   * names several: two packages compared, then an invoice for one of them.
   * The button then promised one price while Telegram charged another --
   * under the owner's own name.
   */
  it('names a price only when the answer names exactly one', () => {
    expect(
      payRow(
        'Пакет 100 токенов — 130 ⭐, 500 токенов — 600 ⭐. Взял 500, вот счёт: https://t.me/$abc'
      )?.[0]
    ).toMatchObject({ text: 'Оплатить ⭐' })
    // The same amount repeated is still one amount, and it is the right one.
    expect(
      payRow(
        'Счёт на 65 ⭐: https://t.me/$abc. После оплаты 65 ⭐ спишутся сразу'
      )?.[0]
    ).toMatchObject({ text: 'Оплатить 65 ⭐' })
    // A number that is not a price does not become one.
    expect(
      payRow('50 токенов, вот счёт: https://t.me/$abc')?.[0]
    ).toMatchObject({ text: 'Оплатить ⭐' })
    const kb = buttonsForAnswer(
      'Готово, вот счёт 65 ⭐ https://t.me/$abc [[Пополнить|act:topup]]',
      true,
      { app: false }
    )
    expect(callbacks(kb.markup)).toEqual([
      'url:https://t.me/$abc',
      'act:topup',
      'act:topup',
      'act:balance',
      'act:can',
      'act:human',
    ])
    expect(kb.text).not.toContain('[[')
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
    const fb = src.slice(
      src.indexOf(
        'const { text: replyClean, markup: replyMarkup } = buttonsForAnswer('
      ),
      src.indexOf('THE FALLBACK ANSWER GOES INTO THE SHARED CONVERSATION')
    )
    expect(fb).toContain("app: ctx.chat?.type === 'private'")
    expect(fb).toContain('const fbParts = splitLong(replyClean)')
    expect(fb).toMatch(/i === fbParts\.length - 1 \? replyMarkup : undefined/)
    const fail = src.slice(
      src.indexOf('Модели сейчас перегружены'),
      src.indexOf('Модели сейчас перегружены') + 700
    )
    expect(fail).toContain("app: ctx.chat?.type === 'private'")
    expect(src).toContain(
      "'[[Подпись|act:id]], где id — одно из: topup, balance, can, human. '"
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

  it("the render's prompt names all four ids and forbids offering payment first", () => {
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
    expect(prompt).toContain('Кнопку оплаты не предлагай')
  })
})
