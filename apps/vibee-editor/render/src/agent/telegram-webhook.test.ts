import { describe, expect, it } from 'vitest'
import {
  telegramWebhookConfig,
  telegramWebhookSecretMatches,
} from './telegram-webhook'

describe('Telegram shared webhook security', () => {
  it('requires independent exact path and header secrets', () => {
    expect(
      telegramWebhookSecretMatches(
        'path-secret',
        'path-secret',
        'header-secret',
        'header-secret'
      )
    ).toBe(true)
    expect(
      telegramWebhookSecretMatches(
        'path-secret',
        'path-secret',
        'header-secret',
        ''
      )
    ).toBe(false)
    expect(
      telegramWebhookSecretMatches(
        'path-secret',
        'wrong',
        'header-secret',
        'header-secret'
      )
    ).toBe(false)
    expect(
      telegramWebhookSecretMatches(
        'shared-secret',
        'shared-secret',
        'header-secret',
        'shared-secret'
      )
    ).toBe(false)
  })

  it('narrows rollback to payment updates without changing header auth', () => {
    expect(
      telegramWebhookConfig({
        url: 'https://service.invalid/hook',
        headerSecret: 'header-secret',
        agentEnabled: false,
        sameBot: true,
      })
    ).toMatchObject({
      secret_token: 'header-secret',
      allowed_updates: ['pre_checkout_query', 'successful_payment'],
    })
    expect(
      telegramWebhookConfig({
        url: 'https://service.invalid/hook',
        headerSecret: 'header-secret',
        agentEnabled: true,
        sameBot: true,
      })
    ).toMatchObject({
      allowed_updates: ['message', 'pre_checkout_query', 'successful_payment'],
    })
  })
})
