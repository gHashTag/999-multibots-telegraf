import { describe, it, expect } from 'vitest'
import * as bot from '@/core/bot/managedBots/protocol'
import * as render from '../../../apps/vibee-editor/render/src/managed-bots-protocol'

/**
 * TWO COPIES, ONE RULE. The render cannot import the bot's protocol and the
 * bot cannot import the render's (separate build roots), so both are fed the
 * same table and must agree, regex included.
 */
describe('managed bots protocol parity (bot vs render)', () => {
  it('has the same username rule', () => {
    expect(render.BOT_USERNAME_RE.source).toBe(bot.BOT_USERNAME_RE.source)
    expect(render.BOT_USERNAME_RE.flags).toBe(bot.BOT_USERNAME_RE.flags)
  })

  const owners = [
    { id: 144022504 },
    { id: 1, username: 'neuro_coder' },
    { id: 2, username: 'shop_bot' },
    { id: 3, username: '99__x' },
    { id: 4, username: 'a'.repeat(40) },
    { id: 5, username: 'Ивan' }, // cyrillic-ok: fixture
  ]
  it.each(owners)('suggests the same username for %o', o => {
    expect(render.suggestBotUsername(o)).toBe(bot.suggestBotUsername(o))
  })

  it.each([
    ['Dmitrii', true],
    ['', false],
    ['  x  ', true],
  ] as const)('suggests the same name for %s', (n, ru) =>
    expect(render.suggestBotName(n, ru)).toBe(bot.suggestBotName(n, ru))
  )

  it('builds the same link and keyboard', () => {
    const s = { username: 'shop_helper_bot', name: 'Shop & co' }
    expect(render.newBotLink('t27ai_bot', s)).toBe(
      bot.newBotLink('t27ai_bot', s)
    )
    expect(render.requestManagedBotKeyboard('Go', s)).toEqual(
      bot.requestManagedBotKeyboard('Go', s)
    )
  })
})
