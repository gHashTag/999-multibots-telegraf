import { describe, it, expect } from 'vitest'
import { RPCMessageToError } from 'telegram/errors'
import { inPlainWords } from './src/agent/tg-proposals'
import {
  isDeadSession,
  shortTelegramCode,
  telegramWaitSeconds,
} from './src/agent/tg-errors'

/**
 * A TELEGRAM REFUSAL REACHES THE PERSON IN WORDS, NOT IN GRAMJS ENGLISH.
 *
 * The errors below are built by gramjs itself (`RPCMessageToError`, the very
 * function its sender calls on an rpc_error), so the shape is the installed
 * library's, not a guess: FloodWaitError rewrites the message to "A wait of N
 * seconds is required" and the old /FLOOD_WAIT_(\d+)/ never matched it.
 */
const fromTelegram = (errorMessage: string, errorCode = 400) =>
  RPCMessageToError(
    { errorMessage, errorCode } as never,
    {
      className: 'messages.SendMessage',
    } as never
  )

describe('a flood wait is said in seconds or minutes', () => {
  it('the real FloodWaitError is translated, not passed through', () => {
    const e = fromTelegram('FLOOD_WAIT_30', 420)
    expect(e.message).toMatch(/A wait of 30 seconds/)
    const said = inPlainWords(e)
    expect(said).not.toMatch(/A wait of/)
    expect(said).toContain('30 сек')
  })

  it('a long wait is said in minutes, rounded up', () => {
    expect(inPlainWords(fromTelegram('FLOOD_WAIT_125', 420))).toContain('3 мин')
  })

  it('slow mode in a chat is a wait too', () => {
    const e = fromTelegram('SLOWMODE_WAIT_45', 420)
    expect(e.message).toMatch(/before sending another message/)
    expect(inPlainWords(e)).toContain('45 сек')
  })

  it('.seconds wins; the wording is only a fallback', () => {
    expect(telegramWaitSeconds({ seconds: 7 })).toBe(7)
    expect(
      telegramWaitSeconds(new Error('A wait of 90 seconds is required'))
    ).toBe(90)
    expect(telegramWaitSeconds(new Error('FLOOD_WAIT_12'))).toBe(12)
    expect(telegramWaitSeconds(new Error('TIMEOUT'))).toBeNull()
  })
})

describe('a limited account and a dead login are named', () => {
  it('PEER_FLOOD says the account is limited and not to retry', () => {
    const said = inPlainWords(fromTelegram('PEER_FLOOD'))
    expect(said).toContain('@SpamBot')
    expect(said).toContain('повторять сейчас не нужно')
    expect(said).not.toContain('PEER_FLOOD')
  })

  for (const code of [
    'AUTH_KEY_UNREGISTERED',
    'SESSION_REVOKED',
    'AUTH_KEY_DUPLICATED',
    'USER_DEACTIVATED',
    'USER_DEACTIVATED_BAN',
  ]) {
    it(`${code} sends the person to reconnect in the app`, () => {
      const e = fromTelegram(code, 401)
      expect(isDeadSession(e)).toBe(true)
      const said = inPlainWords(e)
      expect(said).toContain('подключите аккаунт заново')
      expect(said).not.toContain(code)
    })
  }

  it('the bare code is read from errorMessage too', () => {
    const e = Object.assign(new Error('401: something'), {
      errorMessage: 'SESSION_REVOKED',
    })
    expect(isDeadSession(e)).toBe(true)
    expect(shortTelegramCode(e)).toBe('SESSION_REVOKED')
  })

  it('a timeout is not a dead login', () => {
    expect(isDeadSession(new Error('TIMEOUT'))).toBe(false)
    expect(shortTelegramCode(new Error('TIMEOUT'))).toBe('TIMEOUT')
  })
})
