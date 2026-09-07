import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { notifySignIn, safeDeviceName } from './src/auth/notify-sign-in'

/**
 * A STRANGER'S SIGN-IN MUST BE NOTICEABLE.
 *
 * Owner, 2026-09-07: "the bot just does not show that I signed in from another
 * device".
 *
 * The code sign-in: the Mini App shows an eight-digit code, the person types it
 * on another device, and that device gets a sixty-day session. The code is on
 * screen for two minutes and is single-use -- whoever types it first gets in.
 *
 * The only trace of somebody else's sign-in was the ABSENCE of traces: the real
 * owner saw "the code did not work" and assumed they had mistyped. The
 * notification does not stop the theft -- it is the only way to learn about it.
 */

const WHEN = new Date('2026-09-07T12:34:00Z')

describe('the sign-in message', () => {
  it('names the device and the time', async () => {
    const sender = vi.fn(async () => undefined)
    expect(
      await notifySignIn(sender, {
        telegramId: '144022504',
        device: 'iPhone Дмитрия',
        when: WHEN,
      })
    ).toBe('sent')
    const [to, text] = sender.mock.calls[0] as unknown as [string, string]
    expect(to).toBe('144022504')
    expect(text).toContain('iPhone Дмитрия')
    expect(text).toMatch(/\d{2}\.\d{2}/)
  })

  it('says WHAT TO DO if it was not them', async () => {
    /*
     * A notification with no action is an alarm with no exit. Somebody who sees
     * a stranger's sign-in must learn from the same message how to close it.
     */
    const sender = vi.fn(async () => undefined)
    await notifySignIn(sender, {
      telegramId: '1',
      device: 'x',
      when: WHEN,
    })
    const text = String((sender.mock.calls[0] as unknown as string[])[1])
    expect(text).toContain('не вы')
    expect(text).toContain('Выйти')
  })

  it('A SEND FAILURE DOES NOT THROW: the sign-in already happened', async () => {
    // A blocked bot, an expired token, an unreachable network -- all of these
    // must end in a lost notification and nothing more.
    const sender = vi.fn(async () => {
      throw new Error('403 bot was blocked by the user')
    })
    await expect(
      notifySignIn(sender, { telegramId: '1', device: 'x', when: WHEN })
    ).resolves.toBe('not sent')
  })
})

describe('the device name arrives from outside and is defanged', () => {
  it('newlines cannot forge a continuation of the message', () => {
    /*
     * The client sets the name. "MacBook\n\nYour code: 12345678" is ready-made
     * fraud inside our own notification if let through as is.
     */
    const name = safeDeviceName('MacBook\n\nВаш код: 12345678')
    expect(name).not.toContain('\n')
  })

  it('a long name is trimmed rather than stretching the message across a screen', () => {
    expect(safeDeviceName('x'.repeat(200)).length).toBeLessThanOrEqual(41)
  })

  it('an empty name does not become an empty string in the text', () => {
    expect(safeDeviceName('')).toContain('без имени')
    expect(safeDeviceName(null)).toContain('без имени')
  })
})

describe('the code sign-in route sends the notification', () => {
  const SRC = fs
    .readFileSync(path.join(__dirname, 'session-routes.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('the call is there', () => {
    expect(SRC).toContain('notifySignIn(sendToTelegram')
  })

  it('does NOT await it: the sign-in must not depend on somebody else network', () => {
    // An `await` here would make issuing the session depend on Telegram being
    // reachable -- that is, sometimes break the sign-in for the sake of the
    // notification about it.
    expect(SRC).toContain('void notifySignIn(')
    expect(SRC).not.toContain('await notifySignIn(')
  })

  it('the notification goes out AFTER the session, not instead of it', () => {
    expect(
      SRC.indexOf('await mintSession(pool, outcome.telegramId')
    ).toBeLessThan(SRC.indexOf('void notifySignIn('))
  })
})
