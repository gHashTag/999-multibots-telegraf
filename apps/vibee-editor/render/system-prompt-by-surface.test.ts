import { describe, it, expect } from 'vitest'
import { systemPrompt } from './src/agent/chat'
import { TOKEN_PRICES } from './src/agent/billing-shared'
import { ПАКЕТЫ, ценаТокенов } from './src/agent/token-packs' // cyrillic-ok: pre-existing names

/**
 * The prompt must never guess a price. Found live 2026-09-08: a client in
 * the owner's DM was offered "Basic 299 rub/month" -- a tariff that does
 * not exist -- and asked to pick one when they said they wanted to pay.
 * The numbers here come from the same price list the tools charge by.
 */
describe('the client in the owner DM (surface business)', () => {
  const p = systemPrompt('business')

  it('names the packs from the price list, not from memory', () => {
    for (const n of ПАКЕТЫ /* cyrillic-ok */) {
      const c = ценаТокенов(n) // cyrillic-ok: pre-existing helper name
      expect(p).toContain(`${n} токенов → ${c.звёзд}⭐`) // cyrillic-ok: pre-existing field name
    }
  })

  it('names the service prices from TOKEN_PRICES', () => {
    expect(p).toContain(`картинка ${TOKEN_PRICES.image_generate}`)
    expect(p).toContain(`видео ${TOKEN_PRICES.video_generate}`)
    expect(p).toContain(`озвучка ${TOKEN_PRICES.audio_generate}`)
    expect(p.includes('картинка 1,')).toBe(false)
  })

  it('denies tariffs and the club, and sends the invoice first', () => {
    expect(p).toContain('Тарифов,')
    expect(p).toContain('подписок и клуба для клиента НЕТ')
    expect(p).toContain('СРАЗУ вызови tokens_invoice')
    expect(p).toContain('my_balance')
    expect(p).not.toContain('$99')
    expect(p).not.toContain('Basic')
  })

  it('leaves no unfilled marker behind', () => {
    expect(p).not.toContain('%%')
    expect(systemPrompt('bot')).not.toContain('%%')
  })
})

describe('the creator in the app (other surfaces)', () => {
  it('keeps the club, and does not get the DM client rules', () => {
    const o = systemPrompt('bot')
    expect(o).toContain('$99')
    expect(o).not.toContain('ЕГО КЛИЕНТУ')
    expect(o).toContain(`картинка ${TOKEN_PRICES.image_generate}`)
  })
})
