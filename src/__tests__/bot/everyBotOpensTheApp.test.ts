/**
 * THE MOST PROMINENT CONTROL IN THE CHAT, ON EVERY BOT.
 *
 * Asked of Telegram on 2026-09-20 for all eleven bots of the farm: exactly one
 * (@t27ai_bot) answered `web_app`; the other ten answered `commands`. The blue
 * button beside the input field -- the first thing a person presses -- opened a
 * list of slash commands instead of the product, for every partner bot.
 *
 * It is per-bot state held by Telegram, normally typed into BotFather by hand,
 * and ten bots had never been typed into. Nothing in this repository set it,
 * so nothing could notice.
 *
 * These tests pin the two halves that keep it fixed: the button is pointed at
 * the mini app, and it is pointed on EVERY launch rather than once by hand.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  pointMenuButtonAtTheApp,
  MENU_BUTTON_TEXT,
} from '@/core/bot/menuButton'
import { MINI_APP_URL } from '@/navigation/config/miniApp.config'

function botDouble(setChatMenuButton: (arg: unknown) => Promise<unknown>) {
  return { telegram: { setChatMenuButton } } as never
}

describe('the menu button of a bot', () => {
  it('points at the mini app, as a web_app button', async () => {
    const calls: Array<Record<string, unknown>> = []
    const outcome = await pointMenuButtonAtTheApp(
      botDouble(async arg => {
        calls.push(arg as Record<string, unknown>)
        return true
      }),
      'partner_bot'
    )

    expect(outcome).toBe('set')
    const button = (calls[0] as { menuButton: Record<string, unknown> })
      .menuButton
    expect(
      button.type,
      'not a web_app button -- opens commands, as before'
    ).toBe('web_app')
    expect((button.web_app as { url: string }).url).toBe(MINI_APP_URL)
    expect(String(button.text)).toBe(MENU_BUTTON_TEXT)
  })

  /*
   * A BOT THAT COULD NOT HAVE ITS BUTTON SET IS STILL A BOT. Telegram refuses
   * for its own reasons; a menu button is worth a warning and never a dead
   * bot, which is what a thrown error inside the launch loop would produce.
   */
  it('never fails a launch when Telegram refuses', async () => {
    const outcome = await pointMenuButtonAtTheApp(
      botDouble(async () => {
        throw new Error('Forbidden: bot was blocked')
      }),
      'partner_bot'
    )
    expect(outcome).toBe('failed')
  })

  /*
   * AND IT IS DONE FOR EVERY BOT. A one-off call fixes today and says nothing
   * about the next bot somebody adds -- which is exactly how ten of eleven
   * came to be wrong. The launch path is read as text because that is where
   * "for every bot" lives: inside the loop, before launch.
   */
  it('is set inside the launch loop, not once somewhere else', () => {
    const entry = fs.readFileSync(
      path.join(__dirname, '..', '..', 'index.ts'),
      'utf8'
    )
    expect(entry).toContain('pointMenuButtonAtTheApp')
    const at = entry.indexOf('pointMenuButtonAtTheApp')
    const launchAt = entry.indexOf('launchWithConflictRetry(bot')
    expect(at, 'the button is set after the bot is launched').toBeLessThan(
      launchAt
    )
  })
})
