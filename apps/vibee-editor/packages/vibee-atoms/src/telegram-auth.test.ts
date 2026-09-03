import { describe, expect, it } from 'vitest'
import {
  telegramAuthBotForEnvironment,
  telegramAuthLoginUrl,
} from './telegram-auth'

describe('Telegram auth bot contract', () => {
  it('binds production Trinity login to @t27ai_bot and BOT_TOKEN_12', () => {
    expect(telegramAuthBotForEnvironment('production')).toEqual({
      username: 't27ai_bot',
      tokenEnv: 'BOT_TOKEN_12',
      configured: true,
      launch: 'bot-chat',
    })
    expect(telegramAuthLoginUrl('production')).toBe(
      'https://t.me/t27ai_bot?start=login'
    )
  })

  it('fails closed in development until a separate non-production bot is explicit', () => {
    expect(telegramAuthBotForEnvironment('development')).toMatchObject({
      configured: false,
      username: '',
      tokenEnv: 'TELEGRAM_AUTH_BOT_TOKEN',
    })
    expect(
      telegramAuthBotForEnvironment('development', '@t27ai_bot')
    ).toMatchObject({ configured: false, username: '' })

    expect(
      telegramAuthBotForEnvironment('development', '@trinity_sandbox_bot')
    ).toEqual({
      username: 'trinity_sandbox_bot',
      tokenEnv: 'TELEGRAM_AUTH_BOT_TOKEN',
      configured: true,
      launch: 'main-mini-app',
    })
  })

  it.each([undefined, '', 'staging', 'preview', 'prod'])(
    'does not guess a production identity for unknown environment %s',
    environment => {
      expect(telegramAuthBotForEnvironment(environment)).toMatchObject({
        configured: false,
        username: '',
      })
      expect(telegramAuthLoginUrl(environment)).toBeNull()
    }
  )
})
