import { describe, it, expect, beforeEach } from 'vitest'
import {
  insideTelegram,
  rememberBotInfo,
  forgetLastKnownBotForTests,
} from '@/navigation/helpers/appLinks'
import { buttonsForAnswer } from '@/navigation/helpers/actionButtons'

/**
 * Owner, 2026-09-23: "why does the agent in the bot send a link? there is no
 * sign-in there! forbid it at the level of the code -- only opening inside,
 * because this is a mini app."
 *
 * The app knows a person only by Telegram's signed launch data, so a raw
 * https link to it opens a browser where nobody is signed in. It must not
 * leave the bot, not even when the code that sends it forgot to say which
 * bot is speaking.
 */
describe('a raw app link never leaves the bot', () => {
  beforeEach(() => forgetLastKnownBotForTests())

  it('becomes this bot s Telegram link when the bot is known', () => {
    const out = insideTelegram('Смотрите: https://app.t27.ai/browser', 'my_bot')
    expect(out).toContain('t.me/my_bot')
    expect(out).not.toContain('app.t27.ai')
  })

  it('uses the last bot that answered when the caller forgot to name one', () => {
    rememberBotInfo({ username: 'seller_bot', has_main_web_app: false })
    const out = insideTelegram('Открыть: https://app.t27.ai/chat')
    expect(out).toContain('t.me/seller_bot')
    expect(out).not.toContain('app.t27.ai')
  })

  it('REMOVES the link when no bot is known at all, rather than send it dead', () => {
    const out = insideTelegram('Готово: https://app.t27.ai/browser (смотрите)')
    expect(out).not.toContain('app.t27.ai')
    expect(out).toContain('Готово:')
  })

  it('the answer the bot sends carries no app host, bot or no bot', () => {
    for (const bot of [{ username: 'my_bot' }, undefined]) {
      const { text } = buttonsForAnswer(
        'Ваш браузер: https://app.t27.ai/browser',
        true,
        bot ? { bot } : {}
      )
      expect(text).not.toContain('app.t27.ai')
    }
  })

})
